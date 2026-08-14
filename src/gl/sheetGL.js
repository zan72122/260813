// 海苔と、その上の水膜を描く WebGL レイヤ。
// 工房・道具・HUD は Canvas 2D のまま。このレイヤはそれらの間に挟まる。
//
// 面の作り: 格子メッシュの頂点位置と法線を CPU 側で毎フレーム作る。
// 剥がれた部分は円弧解（曲率半径 R、弧長角 θ）から法線 (0,-sinθ,cosθ) が出るので、
// めくれるにつれて本当に光の当たり方が変わる。
import { buildFiberTexture } from './fiber.js';

const VS = `
attribute vec2 aPos;
attribute vec2 aUv;
attribute vec3 aNor;
attribute float aLift;
uniform vec2 uCam;
uniform vec2 uScale;
uniform vec2 uShadowOff;
uniform float uShadow;
varying vec2 vUv;
varying vec3 vNor;
varying float vLift;
void main() {
  vec2 w = aPos + uShadowOff * uShadow * max(aLift, 0.0);
  gl_Position = vec4((w - uCam) * uScale, 0.0, 1.0);
  vUv = aUv;
  vNor = aNor;
  vLift = aLift;
}`;

const FS = `
precision highp float;
varying vec2 vUv;
varying vec3 vNor;
varying float vLift;

uniform sampler2D uFiber;   // rg=法線xy  b=高さ(厚み)  a=ムラ
uniform sampler2D uState;   // r=量  g=濡れ  b=押した強さ  a=乾燥リング
uniform vec3 uLight;
uniform vec3 uWetCol;
uniform vec3 uDryCol;
uniform float uDry;
uniform float uShadow;
uniform float uTier;
uniform float uBacklight;
uniform float uMatPitch;
uniform float uThinMax;   // 透過するとみなす厚みの上限（逆光で広がる）
uniform float uAlpha;
uniform sampler2D uNoise;   // 128x128 の繰り返しノイズ（水玉用）

float vnoise(vec2 p) { return texture2D(uNoise, p * 0.0078125).r; }
float ggx(vec3 N, vec3 L, vec3 V, float rough) {
  vec3 H = normalize(L + V);
  float a = max(0.02, rough * rough);
  float ndh = max(dot(N, H), 0.0);
  float t = ndh * ndh * (a * a - 1.0) + 1.0;
  return (a * a) / (3.14159265 * t * t) * max(dot(N, L), 0.0);
}

void main() {
  vec4 st = texture2D(uState, vUv);
  float wet = st.g * (1.0 - uDry);

  // --- 水膜（濡れているところは玉になって盛り上がる） ---
  vec3 Nw = vec3(0.0, 0.0, 1.0);
  float bead = 0.0;
  vec2 uvR = vUv;
  if (uTier > 1.5 && wet > 0.02) {
    vec2 q = vUv * vec2(46.0, 36.0);
    float n = vnoise(q);
    bead = smoothstep(0.60 - wet * 0.46, 0.80 - wet * 0.46, n);
    float dx = vnoise(q + vec2(0.9, 0.0)) - n;
    float dy = vnoise(q + vec2(0.0, 0.9)) - n;
    // 水が多いときは一枚の膜（面の法線に近い）、引いてくると玉になって盛り上がる
    float relief = 2.6 * (1.0 - wet * 0.72);
    Nw = normalize(vec3(-dx * relief, -dy * relief, 1.0));
    // 水の下は屈折で少しずれて見える
    uvR = vUv + Nw.xy * 0.012 * bead;
  }

  vec4 fb = texture2D(uFiber, uvR);
  float mottle = fb.a;
  // 縁は繊維のムラでギザつく
  float alpha = smoothstep(0.16, 0.40, st.r * (0.80 + mottle * 0.42)) * uAlpha;
  // 縁は機械的な直線にせず、繊維のムラでわずかにちぎれさせる
  float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  alpha *= smoothstep(0.0, 0.010 + mottle * 0.022, edge);
  if (alpha <= 0.004) discard;

  // vLift は弧上の位置 s（負なら台に付いている）
  float lift = vLift < 0.0 ? 0.0 : smoothstep(0.0, 0.30, vLift);

  if (uShadow > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha * 0.36 * lift);
    return;
  }

  float thick = st.r * (0.5 + 0.95 * fb.b);

  // --- 法線 ---
  vec3 N = normalize(vNor + vec3((fb.rg * 2.0 - 1.0) * (0.72 + 0.30 * uDry), 0.0));
  float backSide = step(N.z, 0.0);
  if (backSide > 0.5) {
    N = -N;
    // 簾の型が裏に残る
    float s = sin(vUv.y * uMatPitch * 6.2831853);
    N = normalize(N + vec3(0.0, s * 0.38, 0.0));
  }

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(uLight);
  float ndl = max(dot(N, L), 0.0);

  // --- アルベド ---
  float dryT = clamp(uDry * 0.85 + (1.0 - st.g) * 0.35, 0.0, 1.0);
  vec3 base = mix(uWetCol, uDryCol, dryT);
  base *= 0.74 + mottle * 0.30 + fb.b * 0.24 - clamp(st.r - 1.0, 0.0, 0.45) * 0.30;
  base *= mix(1.0, 0.72, wet);              // 濡れると暗く沈む
  base *= 1.0 - st.a * 0.42;                // 水が引いた跡（乾燥リング）
  if (backSide > 0.5) {
    base = base * 1.5 + vec3(0.020, 0.030, 0.018);   // 裏はマットで少し明るい
    float s = sin(vUv.y * uMatPitch * 6.2831853);
    base *= 0.88 + 0.18 * s;
  }

  vec3 col = base * (0.40 + 0.86 * ndl);
  // 逆光のときは表側が沈む。透過だけが残るのでシルエットが立つ。
  col *= 1.0 - clamp(uBacklight - 1.0, 0.0, 1.6) * 0.20;
  // 面が寝てくるほど拡散反射は落ちる。めくれの立体感が出て、
  // 真横を向いた所が白っぽくのっぺりするのを防ぐ。
  col *= 0.52 + 0.48 * abs(N.z);

  // --- 面の反射（乾くと艶消し、濡れると鋭い） ---
  // 海苔は艶消し。GGX の D 項をそのまま足すと白飛びするので、弱く抑えて上限を切る。
  float rough = mix(mix(0.80, 0.62, uDry), 0.24, wet) * (1.0 - st.b * 0.14);
  float spec = min(ggx(N, L, V, rough) * 0.09, 0.42);
  col += vec3(0.78, 0.88, 0.80) * spec * mix(0.50, 1.40, wet);

  // --- 水玉のハイライト ---
  if (bead > 0.001) {
    vec3 Nb = normalize(mix(N, Nw, bead * 0.85));
    float wr = mix(0.30, 0.16, clamp(1.0 - wet, 0.0, 1.0));
    col += vec3(1.0, 1.0, 0.96) * min(ggx(Nb, L, V, wr) * 0.05, 0.26) * bead * wet * 1.05;
    col *= 1.0 - bead * wet * 0.10;          // 玉のふちは接触で暗い
  }

  // --- 剥離線のふち ---
  // 曲がりはじめは曲率が高く、光を線状に拾う。ここが光ると
  // 「いま剥がれている境目」がはっきり見える。
  float rim = vLift < 0.0 ? 0.0 : exp(-pow(vLift / 0.05, 2.0));
  col += vec3(0.50, 0.58, 0.46) * rim * 0.5;

  // --- 透過（持ち上がった所だけ、薄い部分が透けて光る。海苔の決定打） ---
  // 一様に光らせない。厚みの薄い所だけがレース状に抜ける。
  // 3乗して薄い所だけを際立たせる。線形だと面全体が一様に光ってしまう。
  float th0 = smoothstep(uThinMax, 0.02, thick);
  float thin = th0 * 0.22 + pow(th0, 3.0) * 0.78;
  // 逆光でも面全体は光らせない。厚い所は黒いまま残さないとレースにならない。
  float trans = min(uBacklight * lift * thin * (0.55 + 0.45 * max(dot(-N, L), 0.0)), 1.15);
  col += vec3(0.54, 0.56, 0.21) * trans;

  gl_FragColor = vec4(col, alpha);
}`;

function sh(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

export class SheetGL {
  constructor(canvas, tier) {
    this.canvas = canvas;
    this.ok = false;
    this.lost = false;
    const opts = {
      alpha: true, premultipliedAlpha: false, antialias: true,
      depth: false, stencil: false,
      // 通常は false（毎フレームのコピーを避ける）。?pdb=1 のときだけ true にして
      // スクリーンショット検証がバッファのスワップと競合しないようにする。
      preserveDrawingBuffer: /[?&]pdb=1/.test(location.search),
      powerPreference: 'high-performance',
    };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) return;
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });

    try {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error('link: ' + gl.getProgramInfoLog(p));
      }
      this.prog = p;
    } catch (e) {
      console.warn('WebGL 初期化に失敗:', e.message);
      return;
    }

    const g = this.gl, p = this.prog;
    this.loc = {
      aPos: g.getAttribLocation(p, 'aPos'),
      aUv: g.getAttribLocation(p, 'aUv'),
      aNor: g.getAttribLocation(p, 'aNor'),
      aLift: g.getAttribLocation(p, 'aLift'),
      uCam: g.getUniformLocation(p, 'uCam'),
      uScale: g.getUniformLocation(p, 'uScale'),
      uShadowOff: g.getUniformLocation(p, 'uShadowOff'),
      uShadow: g.getUniformLocation(p, 'uShadow'),
      uFiber: g.getUniformLocation(p, 'uFiber'),
      uState: g.getUniformLocation(p, 'uState'),
      uLight: g.getUniformLocation(p, 'uLight'),
      uWetCol: g.getUniformLocation(p, 'uWetCol'),
      uDryCol: g.getUniformLocation(p, 'uDryCol'),
      uDry: g.getUniformLocation(p, 'uDry'),
      uTier: g.getUniformLocation(p, 'uTier'),
      uBacklight: g.getUniformLocation(p, 'uBacklight'),
      uMatPitch: g.getUniformLocation(p, 'uMatPitch'),
      uThinMax: g.getUniformLocation(p, 'uThinMax'),
      uAlpha: g.getUniformLocation(p, 'uAlpha'),
      uNoise: g.getUniformLocation(p, 'uNoise'),
    };

    this.posBuf = g.createBuffer();
    this.uvBuf = g.createBuffer();
    this.norBuf = g.createBuffer();
    this.liftBuf = g.createBuffer();
    this.idxBuf = g.createBuffer();

    this.buildNoise();
    this.setTier(tier);
    this.stateTex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.stateTex);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);

    g.disable(g.DEPTH_TEST);
    g.enable(g.BLEND);
    g.blendFuncSeparate(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA, g.ONE, g.ONE_MINUS_SRC_ALPHA);
    this.ok = true;
  }

  // 品質段階に応じて繊維テクスチャを焼き直す。
  // 起動を止めないよう、まず粗い版を焼いて、あとから精細版に差し替える。
  setTier(tier) {
    this.tier = tier;
    this.uploadFiber(512, 384, 6500);
    clearTimeout(this._upgrade);
    if (tier >= 2) {
      this._upgrade = setTimeout(() => {
        if (this.tier >= 2 && !this.lost) this.uploadFiber(1024, 768, 20000);
      }, 450);
    }
  }

  uploadFiber(w, h, strokes) {
    const g = this.gl;
    const tex = buildFiberTexture(w, h, strokes);
    if (!this.fiberTex) this.fiberTex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.fiberTex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, tex.width, tex.height, 0, g.RGBA, g.UNSIGNED_BYTE, tex.data);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  }

  // 128x128 の繰り返しノイズ（2の冪なので REPEAT が使える）
  buildNoise() {
    const g = this.gl;
    const N = 128;
    const d = new Uint8Array(N * N * 4);
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < N * N; i++) {
      const v = Math.round(rnd() * 255);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    this.noiseTex = g.createTexture();
    g.bindTexture(g.TEXTURE_2D, this.noiseTex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, N, N, 0, g.RGBA, g.UNSIGNED_BYTE, d);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
  }

  resize(w, h, dpr) {
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  // 格子の添字は毎回同じなので使い回す
  indices(gu, gv) {
    if (this._idxKey === gu + 'x' + gv) return this._idxCount;
    const idx = [];
    for (let j = 0; j < gv; j++) {
      for (let i = 0; i < gu; i++) {
        const a = j * (gu + 1) + i, b = a + 1, c = a + gu + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = this.gl;
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    g.bufferData(g.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), g.STATIC_DRAW);
    this._idxKey = gu + 'x' + gv;
    this._idxCount = idx.length;
    return this._idxCount;
  }

  uploadState(data, w, h) {
    const g = this.gl;
    g.bindTexture(g.TEXTURE_2D, this.stateTex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, data);
  }

  beginFrame(dpr) {
    const g = this.gl;
    g.viewport(0, 0, this.canvas.width, this.canvas.height);
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    this.dpr = dpr;
  }

  // mesh: {pos, uv, nor, lift, gu, gv}
  draw(mesh, cam, sw, sh_, opts) {
    const g = this.gl, L = this.loc;
    const n = this.indices(mesh.gu, mesh.gv);
    g.useProgram(this.prog);

    const bind = (buf, arr, loc, size, upload) => {
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      if (upload !== false) g.bufferData(g.ARRAY_BUFFER, arr, g.DYNAMIC_DRAW);
      g.enableVertexAttribArray(loc);
      g.vertexAttribPointer(loc, size, g.FLOAT, false, 0, 0);
    };
    bind(this.posBuf, mesh.pos, L.aPos, 2);
    // UV は割り方が変わらない限り同じなので毎フレーム送らない
    bind(this.uvBuf, mesh.uv, L.aUv, 2, this._uvKey !== mesh.uvKey);
    this._uvKey = mesh.uvKey;
    bind(this.norBuf, mesh.nor, L.aNor, 3);
    bind(this.liftBuf, mesh.lift, L.aLift, 1);
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, this.idxBuf);

    g.uniform2f(L.uCam, cam.x, cam.y);
    g.uniform2f(L.uScale, cam.scale * 2 / sw, -cam.scale * 2 / sh_);
    g.uniform2f(L.uShadowOff, opts.shadowOff[0], opts.shadowOff[1]);
    g.uniform3f(L.uLight, opts.light[0], opts.light[1], opts.light[2]);
    g.uniform3f(L.uWetCol, opts.wetCol[0], opts.wetCol[1], opts.wetCol[2]);
    g.uniform3f(L.uDryCol, opts.dryCol[0], opts.dryCol[1], opts.dryCol[2]);
    g.uniform1f(L.uDry, opts.dry);
    g.uniform1f(L.uTier, this.tier);
    g.uniform1f(L.uBacklight, opts.backlight);
    g.uniform1f(L.uMatPitch, opts.matPitch);
    g.uniform1f(L.uThinMax, opts.thinMax === undefined ? 0.34 : opts.thinMax);
    g.uniform1f(L.uAlpha, opts.alpha === undefined ? 1 : opts.alpha);

    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, this.fiberTex);
    g.uniform1i(L.uFiber, 0);
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, this.stateTex);
    g.uniform1i(L.uState, 1);
    g.activeTexture(g.TEXTURE2);
    g.bindTexture(g.TEXTURE_2D, this.noiseTex);
    g.uniform1i(L.uNoise, 2);

    // 影 → 本体 の順に2回描く。影は浮いている行だけでよい。
    if (opts.shadow) {
      g.uniform1f(L.uShadow, 1);
      const from = (opts.shadowFrom || 0) * 2;      // Uint16 のバイト単位
      g.drawElements(g.TRIANGLES, n - (opts.shadowFrom || 0), g.UNSIGNED_SHORT, from);
    }
    g.uniform1f(L.uShadow, 0);
    g.drawElements(g.TRIANGLES, n, g.UNSIGNED_SHORT, 0);
  }
}

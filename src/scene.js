// 庭（空・雲・草地・噴水・花）と、手にもつ霧吹き。
// 背景は半解像度の1パス、庭の飾りは instancing 1ドローにまとめる。
import { Program, FULLSCREEN_VS, PX_FROM_UV, PX_TO_CLIP, NOISE_GLSL, createQuad } from './glutil.js';

const PROP_STRIDE = 8;
const MAX_PROPS = 260;

export class Scene {
  constructor(gl) {
    this.gl = gl;
    this.quad = createQuad(gl);
    this.bg = new Program(gl, FULLSCREEN_VS, BG_FS, 'bg');
    this.props = new Program(gl, PROPS_VS, PROPS_FS, 'props');
    this.sprayer = new Program(gl, SPRAYER_VS, SPRAYER_FS, 'sprayer');
    this.sprayerVao = gl.createVertexArray();
    gl.bindVertexArray(this.sprayerVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.data = new Float32Array(MAX_PROPS * PROP_STRIDE);
    this.count = 0;
    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PROP_STRIDE * 4, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, PROP_STRIDE * 4, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    this.items = [];
    this.round = { seed: 0, grassHue: 0.30, fountainX: 0 };
  }

  /** 毎回ちがう庭をつくる（花の色、噴水の位置、木の並び、小物）。 */
  build(rng) {
    const items = [];
    const grassHue = rng.range(0.26, 0.34);
    const fountainX = rng.range(-120, 120);
    const palettes = [
      [0.02, 0.10, 0.92, 0.55],   // 赤〜桃
      [0.13, 0.16, 0.62, 0.58],   // 黄
      [0.75, 0.85, 0.55, 0.60],   // 紫
      [0.55, 0.62, 0.60, 0.62],   // 青
      [0.93, 0.99, 0.70, 0.58],   // ピンク
    ];
    const pal = [];
    const nPal = rng.int(2, 3);
    for (let i = 0; i < nPal; i++) pal.push(rng.pick(palettes));

    // 遠くの木立
    const nTrees = rng.int(4, 7);
    for (let i = 0; i < nTrees; i++) {
      const x = rng.range(-560, 560);
      items.push({ kind: 6, x, y: rng.range(4, 16), size: rng.range(52, 88), seed: rng(),
        h: grassHue + rng.range(-0.03, 0.02), s: rng.range(0.42, 0.6), v: rng.range(0.48, 0.62) });
    }

    // 噴水（広場のまんなか）
    items.push({ kind: 5, x: fountainX, y: 62, size: 46, seed: rng(), h: 0.55, s: 0.28, v: 0.98 });
    items.push({ kind: 4, x: fountainX, y: 70, size: 62, seed: rng(), h: 0.10, s: 0.10, v: 0.88 });

    // 草むらと花を、手前ほど大きく
    const bands = [
      { y: [22, 60], size: [12, 20], n: 26 },
      { y: [60, 130], size: [18, 30], n: 30 },
      { y: [130, 250], size: [26, 44], n: 30 },
      { y: [250, 430], size: [40, 70], n: 24 },
    ];
    for (const band of bands) {
      for (let i = 0; i < band.n; i++) {
        const x = rng.range(-660, 660);
        const y = rng.range(band.y[0], band.y[1]);
        const size = rng.range(band.size[0], band.size[1]);
        const roll = rng();
        if (roll < 0.42) {
          items.push({ kind: 0, x, y, size: size * 1.05, seed: rng(),
            h: grassHue + rng.range(-0.04, 0.04), s: rng.range(0.5, 0.72), v: rng.range(0.55, 0.8) });
        } else if (roll < 0.78) {
          const p = rng.pick(pal);
          items.push({ kind: 1, x, y, size: size * 0.78, seed: rng(),
            h: rng.range(p[0], p[1]), s: rng.range(p[2] - 0.12, p[2] + 0.06), v: rng.range(p[3] + 0.28, p[3] + 0.42) });
        } else if (roll < 0.92) {
          items.push({ kind: 2, x, y, size: size * 0.95, seed: rng(),
            h: grassHue + rng.range(-0.02, 0.05), s: rng.range(0.45, 0.66), v: rng.range(0.5, 0.72) });
        } else {
          items.push({ kind: 3, x, y, size: size * 0.55, seed: rng(),
            h: rng.range(0.08, 0.13), s: rng.range(0.06, 0.16), v: rng.range(0.72, 0.86) });
        }
      }
    }

    items.sort((a, b) => a.y - b.y);
    this.items = items.slice(0, MAX_PROPS);
    this.round = { grassHue, fountainX, cloud: rng.range(0, 100), hill: rng.range(0, 40) };
    return this.round;
  }

  drawBackground(camera, time, wet) {
    const p = this.bg.use();
    p.set('uRes', [camera.width, camera.height]);
    p.set('uHorizon', camera.horizonY);
    p.set('uTime', time);
    p.set('uScale', camera.scale);
    p.set('uPan', camera.panX);
    p.set('uGrassHue', this.round.grassHue);
    p.set('uCloudSeed', this.round.cloud);
    p.set('uHillSeed', this.round.hill);
    p.set('uWet', wet);
    p.set('uAntisolar', camera.antisolar);
  }

  drawProps(camera, time, wet) {
    const gl = this.gl;
    const arr = this.data;
    const sc = camera.scale;
    const cx = camera.width * 0.5;
    const hy = camera.horizonY;
    const pan = camera.panX;
    const W = camera.width;
    let o = 0, n = 0;
    for (const it of this.items) {
      const sx = cx + (it.x - pan) * sc;
      const size = it.size * sc;
      if (sx < -size * 2.5 || sx > W + size * 2.5) continue;
      const sy = hy + it.y * sc;
      if (sy < hy - size * 2) continue;
      arr[o] = sx; arr[o + 1] = sy; arr[o + 2] = size; arr[o + 3] = it.kind;
      arr[o + 4] = it.seed; arr[o + 5] = it.h; arr[o + 6] = it.s; arr[o + 7] = it.v;
      o += PROP_STRIDE; n++;
      if (n >= MAX_PROPS) break;
    }
    this.count = n;
    if (!n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr, 0, o);
    const p = this.props.use();
    p.set('uRes', [camera.width, camera.height]);
    p.set('uTime', time);
    p.set('uHorizon', camera.horizonY);
    p.set('uWet', wet);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }

  drawSprayer(camera, cfg) {
    const gl = this.gl;
    const p = this.sprayer.use();
    p.set('uRes', [camera.width, camera.height]);
    p.set('uCenter', cfg.center);
    p.set('uSize', cfg.size);
    p.set('uAngle', cfg.angle);
    p.set('uPress', cfg.press);
    p.set('uTime', cfg.time);
    p.set('uWater', cfg.water);
    gl.bindVertexArray(this.sprayerVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

/* ------------------------------------------------------------------ */

const BG_FS = `
in vec2 vUv;
${PX_FROM_UV}
${NOISE_GLSL}
uniform vec2 uRes;
uniform vec2 uAntisolar;
uniform float uHorizon;
uniform float uTime;
uniform float uScale;
uniform float uPan;
uniform float uGrassHue;
uniform float uCloudSeed;
uniform float uHillSeed;
uniform float uWet;

vec3 hsv(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  vec2 p = pxFromUv(vUv, uRes);
  float H = uRes.y;
  vec3 col;

  if (p.y < uHorizon) {
    // ---- 空 ----
    float t = clamp((uHorizon - p.y) / max(uHorizon, 1.0), 0.0, 1.0);
    vec3 zenith = vec3(0.30, 0.58, 0.87);
    vec3 low    = vec3(0.79, 0.89, 0.96);
    col = mix(low, zenith, pow(t, 0.85));

    // 背後の太陽の光が空気にまわりこんで、地平線ぎわが暖かい
    col += vec3(0.10, 0.07, 0.02) * pow(1.0 - t, 2.2);

    // 雲（虹と競わないように、うすく）
    vec2 cp = vec2((p.x + uPan * uScale) / H, p.y / H);
    cp.x += uTime * 0.006 + uCloudSeed;
    cp.y = pow(max(cp.y, 0.001), 0.62) * 1.6 + uCloudSeed * 0.3;
    float cl = fbm(cp * 2.6);
    cl = smoothstep(0.52, 0.86, cl) * smoothstep(0.0, 0.34, t) * (0.55 + 0.45 * t);
    vec3 cloudCol = mix(vec3(1.0, 0.99, 0.97), vec3(0.87, 0.91, 0.96), 0.35);
    col = mix(col, cloudCol, cl * 0.62);

    // 対日点のまわりは、ごくわずかに深い色（虹の内側との対比になる）
    float da = length(p - uAntisolar) / max(uRes.y, 1.0);
    col *= 1.0 - 0.035 * exp(-da * da * 3.0);
  } else {
    // ---- 草地 ----
    float d = (p.y - uHorizon) / max(H - uHorizon, 1.0);   // 0 = 遠く, 1 = 手前
    vec3 grassFar = hsv(vec3(uGrassHue + 0.02, 0.34, 0.86));
    vec3 grassNear = hsv(vec3(uGrassHue - 0.01, 0.62, 0.60));
    col = mix(grassFar, grassNear, pow(d, 0.7));

    vec2 gp = vec2((p.x + uPan * uScale) / H, (p.y - uHorizon) / H);
    float texv = fbm(vec2(gp.x * 7.0, gp.y * 12.0 + uHillSeed));
    col *= 0.90 + 0.20 * texv;
    // 木もれ日のような明るい斑
    float dapple = smoothstep(0.58, 0.86, fbm(vec2(gp.x * 3.0 + 4.0, gp.y * 4.2)));
    col += vec3(0.10, 0.11, 0.03) * dapple * (0.3 + 0.7 * d);

    // 背後の太陽 → 手前の草がいちばん明るい
    col += vec3(0.09, 0.08, 0.03) * pow(d, 1.8);

    // 濡れると色が深くなって、細かい反射が生まれる
    float glint = pow(max(0.0, vnoise(vec2(p.x * 0.35, p.y * 0.35 + uTime * 0.4))), 14.0);
    col = mix(col, col * 0.86, uWet * 0.5 * d);
    col += vec3(0.9, 0.97, 1.0) * glint * uWet * 0.55 * d;

    // 地平線ぎわは空気にとける
    col = mix(vec3(0.78, 0.86, 0.91), col, smoothstep(0.0, 0.042, d));
  }

  outColor = vec4(col, 1.0);
}
`;

const PROPS_VS = `
${PX_TO_CLIP}
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aA;   // x, y(base), size, kind
layout(location = 2) in vec4 aB;   // seed, h, s, v
uniform vec2 uRes;
uniform float uTime;
uniform float uHorizon;
out vec2 vP;
out vec4 vB;
out float vKind;
out float vDepth;
void main() {
  vec2 local = aQuad * 2.0 - 1.0;   // x:-1..1, y:-1(上)..1(根もと)
  float sway = sin(uTime * 1.15 + aB.x * 37.0) * 0.10 * (1.0 - (local.y * 0.5 + 0.5));
  float h = aA.z * 2.0;
  vec2 p;
  p.x = aA.x + local.x * aA.z + sway * aA.z;
  p.y = aA.y - h * (1.0 - (local.y * 0.5 + 0.5));
  vP = local;
  vB = aB;
  vKind = aA.w;
  vDepth = clamp((aA.y - uHorizon) / max(uRes.y - uHorizon, 1.0), 0.0, 1.0);
  gl_Position = pxToClip(p, uRes);
}`;

const PROPS_FS = `
in vec2 vP; in vec4 vB; in float vKind; in float vDepth;
uniform float uTime;
uniform float uWet;
vec3 hsv(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
float ellipse(vec2 p, vec2 r) { return length(p / r); }

void main() {
  vec2 p = vP;
  int kind = int(vKind + 0.5);
  float seed = vB.x;
  vec3 base = hsv(vec3(vB.y, vB.z, vB.w));
  float mask = 0.0;
  vec3 col = base;
  float spec = 0.0;

  // 根もとの小さな影（太陽は背後なので、影はほとんど見えない）
  float shadow = smoothstep(1.0, 0.0, ellipse(p - vec2(0.0, 0.86), vec2(0.78, 0.20)));

  if (kind == 0) {
    // 草むら（根もとがふくらんだ、やわらかい株）
    float t = p.y * 0.5 + 0.5;                 // 0 = 先, 1 = 根もと
    float w = 0.92 * (0.18 + 0.82 * pow(t, 0.7));
    float blades = abs(fract(p.x * 2.2 + seed * 3.0) - 0.5) * 2.0;
    float clump = smoothstep(w, w * 0.35, abs(p.x)) * smoothstep(-1.05, -0.75, p.y);
    mask = clump * (0.58 + 0.42 * smoothstep(0.05, 0.85, blades));
    col = mix(base * 0.86, base * 1.12, t);
    spec = smoothstep(0.6, 1.0, blades) * (1.0 - abs(p.x)) * 0.8;
  } else if (kind == 1) {
    // 花（茎 + 花びら + 芯）
    vec2 fp = p - vec2(0.0, -0.35);
    float a = atan(fp.y, fp.x) + seed * 6.28;
    float rr = 0.46 + 0.30 * cos(a * 5.0);
    float petal = smoothstep(rr, rr * 0.72, length(fp));
    float core = smoothstep(0.19, 0.10, length(fp));
    float stem = smoothstep(0.055, 0.02, abs(p.x - p.y * 0.06)) * smoothstep(-0.28, -0.1, p.y);
    mask = max(petal, max(core, stem));
    col = mix(base, base * 1.25 + 0.12, 0.5 + 0.5 * cos(a * 5.0));
    col = mix(col, vec3(0.36, 0.55, 0.30), stem * (1.0 - petal));
    col = mix(col, vec3(1.0, 0.92, 0.55), core);
    spec = core * 0.6 + petal * smoothstep(0.4, 0.0, length(fp - vec2(-0.16, -0.16))) * 0.8;
  } else if (kind == 2) {
    // 茂み
    float b1 = ellipse(p - vec2(-0.34, 0.20), vec2(0.62, 0.60));
    float b2 = ellipse(p - vec2(0.32, 0.26), vec2(0.58, 0.55));
    float b3 = ellipse(p - vec2(0.02, -0.22), vec2(0.66, 0.66));
    float d = min(min(b1, b2), b3);
    mask = smoothstep(1.0, 0.86, d);
    col = base * (1.15 - 0.35 * d);
    spec = smoothstep(0.55, 0.0, ellipse(p - vec2(-0.22, -0.30), vec2(0.38, 0.30)));
  } else if (kind == 3) {
    // 小石
    float d = ellipse(p - vec2(0.0, 0.45), vec2(0.78, 0.44));
    mask = smoothstep(1.0, 0.9, d);
    col = base * (1.2 - 0.4 * d);
    spec = smoothstep(0.6, 0.0, ellipse(p - vec2(-0.18, 0.28), vec2(0.34, 0.20)));
  } else if (kind == 4) {
    // 噴水の水盤
    float outer = ellipse(p - vec2(0.0, 0.55), vec2(0.95, 0.42));
    float inner = ellipse(p - vec2(0.0, 0.52), vec2(0.74, 0.30));
    mask = smoothstep(1.0, 0.94, outer);
    col = mix(base, vec3(0.62, 0.82, 0.92), smoothstep(1.0, 0.95, inner));
    float water = smoothstep(1.0, 0.96, inner);
    vec3 pool = vec3(0.58, 0.80, 0.92) * (1.0 + 0.07 * sin(p.x * 11.0 + uTime * 1.6));
    col = mix(col, pool, water);
    spec = water * smoothstep(0.35, 0.0, abs(p.y - 0.46 + sin(p.x * 5.0 + uTime) * 0.02)) * 0.5;
  } else if (kind == 5) {
    // 噴水の水しぶき
    float w = 0.16 + 0.42 * (p.y * 0.5 + 0.5);
    float f = exp(-pow(abs(p.x) / w, 2.0) * 2.2);
    float fall = smoothstep(-1.0, -0.75, p.y);
    mask = f * fall * (0.62 + 0.38 * sin(p.y * 9.0 - uTime * 6.0 + seed * 20.0));
    mask = clamp(mask, 0.0, 1.0) * 0.78;
    col = vec3(0.88, 0.96, 1.0);
    spec = mask * 0.8;
  } else {
    // 遠くの木
    float trunk = smoothstep(0.10, 0.05, abs(p.x)) * smoothstep(-0.1, 0.2, p.y);
    float c1 = ellipse(p - vec2(-0.30, -0.22), vec2(0.60, 0.56));
    float c2 = ellipse(p - vec2(0.30, -0.16), vec2(0.56, 0.52));
    float c3 = ellipse(p - vec2(0.0, -0.55), vec2(0.62, 0.48));
    float d = min(min(c1, c2), c3);
    float canopy = smoothstep(1.0, 0.88, d);
    mask = max(canopy, trunk);
    col = mix(vec3(0.45, 0.33, 0.24), base * (1.2 - 0.35 * d), canopy);
    spec = smoothstep(0.6, 0.0, ellipse(p - vec2(-0.24, -0.5), vec2(0.4, 0.3))) * canopy;
  }

  // 濡れると、小さな反射がふえる（主役の素材のひとつ）
  float sparkleN = fract(sin(seed * 91.7 + floor(uTime * 3.0)) * 43758.5453);
  col += vec3(0.85, 0.95, 1.0) * spec * (0.09 + uWet * (0.26 + 0.38 * sparkleN));
  col = mix(col, col * 0.88, uWet * 0.35);

  // 遠くほど空気の色にとける
  col = mix(vec3(0.82, 0.89, 0.93), col, 0.62 + 0.38 * smoothstep(0.0, 0.14, vDepth));

  float a = mask;
  vec3 outc = col * a;
  // 影は下に敷く
  float sa = shadow * 0.20 * (1.0 - a);
  outc += vec3(0.16, 0.22, 0.14) * sa;
  a += sa;
  if (a < 0.004) discard;
  outColor = vec4(outc, a);
}
`;

// 霧吹きは 1枚のクアッドだけ。ノズルの向き（+y）に合わせて回す。
const SPRAYER_VS = `
${PX_TO_CLIP}
layout(location = 0) in vec2 aQuad;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSize;
uniform float uAngle;
out vec2 vLocal;
void main() {
  vec2 local = (aQuad * 2.0 - 1.0) * 1.45;
  vec2 right = vec2(cos(uAngle), sin(uAngle));
  vec2 up = vec2(sin(uAngle), -cos(uAngle));
  vec2 p = uCenter + (right * local.x + up * local.y) * uSize;
  vLocal = local;
  gl_Position = pxToClip(p, uRes);
}`;

const SPRAYER_FS = `
in vec2 vLocal;
uniform float uPress;
uniform float uTime;
uniform float uWater;

float sdRound(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
float sdCircle(vec2 p, float r) { return length(p) - r; }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

void main() {
  // ローカル座標：+y がノズルの向き
  vec2 p = vLocal;
  float recoil = uPress * 0.035 * (1.0 + sin(uTime * 26.0));
  p.y -= recoil;

  // 本体
  float body = sdRound(p - vec2(0.0, -0.34), vec2(0.40, 0.52), 0.22);
  // 首
  float neck = sdRound(p - vec2(0.0, 0.24), vec2(0.19, 0.14), 0.06);
  // ヘッド
  float head = sdRound(p - vec2(-0.02, 0.50), vec2(0.32, 0.17), 0.10);
  // ノズル
  float noz = sdRound(p - vec2(0.0, 0.74), vec2(0.11, 0.16), 0.05);
  float shell = smin(smin(body, neck, 0.06), smin(head, noz, 0.05), 0.05);
  // 引き金と握り（本体につながるように、内側まで伸ばす）
  // 引き金の握り：首から横へ出て、そのまま下へ回りこむ L 字
  float grip = sdRound(p - vec2(0.36, 0.19), vec2(0.27, 0.080), 0.06);
  float trig = sdRound(p - vec2(0.52, -0.05), vec2(0.115, 0.29), 0.09);

  float aShell = smoothstep(0.02, -0.01, shell);
  float aGrip = smoothstep(0.02, -0.01, smin(grip, trig, 0.06));
  float a = max(aShell, aGrip);
  if (a < 0.004) { outColor = vec4(0.0); return; }

  // 中の水
  float level = -0.05 + 0.05 * sin(uTime * 2.4) - uWater * 0.15;
  float water = aShell * smoothstep(level + 0.03, level - 0.03, p.y)
              * smoothstep(0.02, -0.06, body);

  vec3 col = vec3(0.92, 0.97, 1.0);
  col = mix(col, vec3(0.42, 0.78, 0.94), water * 0.85);
  col = mix(col, vec3(1.0, 0.82, 0.42), smoothstep(0.02, -0.02, min(head, noz)) * 0.92);
  col = mix(col, vec3(1.0, 0.60, 0.66), aGrip * (1.0 - aShell) * 0.95);

  // ふちの輪郭と、つやのハイライト
  float outline = smoothstep(0.0, -0.045, shell) ;
  float rim = (1.0 - outline) * aShell;
  col = mix(col, vec3(0.30, 0.38, 0.48), rim * 0.55);
  float gloss = smoothstep(0.09, 0.0, abs(p.x + 0.24)) * smoothstep(0.55, -0.6, p.y) * aShell;
  col += vec3(1.0) * gloss * 0.35;
  float topLight = smoothstep(0.0, 0.35, p.y) * aShell * 0.12;
  col += topLight;

  outColor = vec4(col * a, a);
}
`;

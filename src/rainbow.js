// 虹そのもの。
//
// 考えかた：
//   ・虹は「対日点（太陽の正反対）から 42°」に出る、という本物の関係だけは守る。
//   ・でも 4歳児に角度を合わせさせないので、当たり判定は実際よりずっと広い。
//   ・弧を角度で 192 個のビンに分け、そこへ届いた霧の量を貯める。
//     貯まった量 = 虹の濃さ・太さ。だから「噴いた分だけ虹が育つ」。
//   ・画面には、霧がある場所にだけ色を出す。最初は虹はどこにも無い。
import { Program, FULLSCREEN_VS, PX_FROM_UV } from './glutil.js';
import {
  ARC_BINS, ARC_GAIN, ARC_DECAY_TAU, ARC_DIFFUSE,
  RAINBOW_R, SECONDARY_R, ANTISOLAR_BELOW, BAND_TOLERANCE,
} from './config.js';

const COL_BUCKETS = 40;   // 画面の横幅を何本の柱で測るか

export class Rainbow {
  constructor(gl) {
    this.gl = gl;
    this.bins = new Float32Array(ARC_BINS);
    this.tmp = new Float32Array(ARC_BINS);
    this.pixels = new Uint8Array(ARC_BINS);
    this.max = 0;
    this.coverage = 0;
    this.mean = 0;
    this.fade = 1;          // リセット時に消していくための係数
    this.gainScale = 1;     // 画面の向きによる補正
    this.heroHue = 0.5;
    this.thickness = 1;
    this.antisolarWorld = [0, ANTISOLAR_BELOW];

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ARC_BINS, 1, 0, gl.RED, gl.UNSIGNED_BYTE, this.pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.program = new Program(gl, FULLSCREEN_VS, FS, 'rainbow');
  }

  setRound({ sunAzWorld, heroHue, thickness }) {
    this.antisolarWorld[0] = sunAzWorld;
    this.heroHue = heroHue;
    this.thickness = thickness;
  }

  reset() {
    this.bins.fill(0);
    this.max = 0;
    this.coverage = 0;
    this.mean = 0;
  }

  /**
   * 霧の粒を弧のビンへ積む。
   * onBand(x, y, w) は、虹の帯の中にいる粒を教える（きらめき用）。
   */
  accumulate(pools, dt, onBand, ramp = 1) {
    const ax = this.antisolarWorld[0], ay = this.antisolarWorld[1];
    const R = RAINBOW_R;
    const tol = R * BAND_TOLERANCE;
    const bins = this.bins;
    const N = ARC_BINS;
    const gain = ARC_GAIN * this.gainScale * ramp * dt;
    let banded = 0;

    for (let pi = 0; pi < pools.length; pi++) {
      const P = pools[pi].pool;
      const w0 = pools[pi].weight;
      for (let i = 0; i < P.n; i++) {
        const a = P.alpha[i];
        if (a <= 0.02) continue;
        const dx = P.x[i] - ax;
        const dy = P.y[i] - ay;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < R * 0.35) continue;
        const off = Math.abs(r - R) / tol;
        if (off >= 1) continue;
        if (dy > 0) continue;                 // 対日点より下（＝地面側）は数えない
        const ang = Math.atan2(-dy, dx);      // 0..π
        const soft = (1 - off) * (1 - off);
        const w = soft * a * w0;
        banded += w;
        // 粒の大きさの分だけ角度方向にも広げる（弧がぶつ切りにならない）
        const spreadBins = Math.max(N * 0.03, (P.size[i] / r) * (N / Math.PI) * 1.4);
        const center = (ang / Math.PI) * N;
        const lo = Math.max(0, Math.floor(center - spreadBins));
        const hi = Math.min(N - 1, Math.ceil(center + spreadBins));
        const norm = gain * w / (hi - lo + 1);
        for (let b = lo; b <= hi; b++) {
          const t = Math.abs(b - center) / (spreadBins + 0.001);
          bins[b] += norm * (1 - t * t) * 2.2;
        }
        if (onBand && soft > 0.45 && Math.random() < w * 0.55) onBand(P.x[i], P.y[i], soft);
      }
    }

    // 隣へにじませる（虹はつながって見えてほしい）
    const k = Math.min(0.5, ARC_DIFFUSE * dt);
    const tmp = this.tmp;
    tmp[0] = bins[0] + (bins[1] - bins[0]) * k;
    tmp[N - 1] = bins[N - 1] + (bins[N - 2] - bins[N - 1]) * k;
    for (let b = 1; b < N - 1; b++) {
      tmp[b] = bins[b] + (bins[b - 1] + bins[b + 1] - 2 * bins[b]) * k;
    }
    const decay = Math.exp(-dt / ARC_DECAY_TAU) * (this.fade >= 1 ? 1 : Math.exp(-dt / 0.35));
    let mx = 0, sum = 0;
    for (let b = 0; b < N; b++) {
      let v = tmp[b] * decay;
      if (v > 1) v = 1;
      if (v < 0.0004) v = 0;
      bins[b] = v;
      if (v > mx) mx = v;
      sum += v;
    }
    this.max = mx;
    this.mean = sum / N;
    this.bandedNow = banded;
    return banded;
  }

  /**
   * 「虹が画面をどれだけ横切っているか」を測る。
   * 角度ではなく画面の横幅で測るのがだいじ。縦画面と横画面で
   * 見える弧の長さがまるで違うので、角度で測ると横画面がいつまでも
   * 完成しないことになってしまう。
   */
  updateCoverage(camera, reachLimit = Infinity) {
    const N = ARC_BINS;
    const B = COL_BUCKETS;
    const ax = camera.antisolar[0], ay = camera.antisolar[1];
    const R = camera.radius;
    const W = camera.width, H = camera.height;
    const my = H * 0.06;
    const reach = this._reach || (this._reach = new Uint8Array(B));
    const lit = this._lit || (this._lit = new Uint8Array(B));
    reach.fill(0); lit.fill(0);
    let vis = 0;
    for (let b = 0; b < N; b++) {
      const ang = ((b + 0.5) / N) * Math.PI;
      const x = ax + Math.cos(ang) * R;
      const y = ay - Math.sin(ang) * R;
      // 地平線より下（＝草地の上）の足もとは、完成の条件には数えない。
      // そこへ霧を届かせるのは 4歳児には難しいし、無くても虹は十分に大きい。
      if (x < 0 || x > W || y < -my || y > camera.horizonY) continue;
      if (Math.abs(x - ax) > reachLimit) continue;   // ねらえない範囲は数えない
      vis++;
      const col = Math.min(B - 1, Math.max(0, (x / W * B) | 0));
      reach[col] = 1;
      if (this.bins[b] > 0.3) lit[col] = 1;
    }
    let total = 0, filled = 0;
    for (let i = 0; i < B; i++) { if (reach[i]) { total++; if (lit[i]) filled++; } }
    this.visibleBins = vis;
    this.coverage = total > 0 ? filled / total : 0;
    // 横画面では弧が長い。同じだけ噴いたら同じくらい育つように少し補正する。
    this.gainScale = Math.max(0.85, Math.min(1.7, vis / 110));
    return this.coverage;
  }

  /** 弧のうち、いま一番色が濃いところの画面座標（ごほうびの粒を出す場所）。 */
  sampleArcPoint(camera, rng) {
    const N = ARC_BINS;
    let best = -1, bestV = 0.12;
    for (let i = 0; i < 24; i++) {
      const b = Math.min(N - 1, Math.floor(rng() * N));
      if (this.bins[b] > bestV) { bestV = this.bins[b]; best = b; }
    }
    if (best < 0) return null;
    const ang = ((best + 0.5) / N) * Math.PI;
    const rr = camera.radius * (1 + (rng() - 0.5) * 0.09);
    return {
      x: camera.antisolar[0] + Math.cos(ang) * rr,
      y: camera.antisolar[1] - Math.sin(ang) * rr,
      v: bestV,
      hue: 1 - ang / Math.PI,
    };
  }

  upload() {
    const gl = this.gl;
    const px = this.pixels;
    for (let i = 0; i < ARC_BINS; i++) px[i] = Math.min(255, (this.bins[i] * 255) | 0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ARC_BINS, 1, gl.RED, gl.UNSIGNED_BYTE, px);
  }

  draw(camera, densityTex, time, fade) {
    this.upload();
    const p = this.program.use();
    p.set('uRes', [camera.width, camera.height]);
    p.set('uAntisolar', camera.antisolar);
    p.set('uRadius', camera.radius);
    p.set('uRadius2', camera.radius * (SECONDARY_R / RAINBOW_R));
    p.set('uHorizon', camera.horizonY);
    p.set('uTime', time);
    p.set('uHero', this.heroHue);
    p.set('uThick', this.thickness);
    p.set('uFade', fade);
    p.set('uArc', { __texture: this.tex });
    p.set('uDensity', { __texture: densityTex });
  }
}

const FS = `
in vec2 vUv;
${PX_FROM_UV}
uniform vec2 uRes;
uniform vec2 uAntisolar;
uniform float uRadius;
uniform float uRadius2;
uniform float uHorizon;
uniform float uTime;
uniform float uHero;
uniform float uThick;
uniform float uFade;
uniform sampler2D uArc;
uniform sampler2D uDensity;

const float PI = 3.14159265;

// 飽和させすぎない、水彩のようなスペクトル。0 = 紫（内側）, 1 = 赤（外側）
vec3 spectrum(float x) {
  x = clamp(x, 0.0, 1.0);
  const vec3 c0 = vec3(0.55, 0.42, 0.86);
  const vec3 c1 = vec3(0.42, 0.55, 0.94);
  const vec3 c2 = vec3(0.40, 0.80, 0.94);
  const vec3 c3 = vec3(0.58, 0.91, 0.62);
  const vec3 c4 = vec3(0.99, 0.94, 0.56);
  const vec3 c5 = vec3(1.00, 0.76, 0.44);
  const vec3 c6 = vec3(1.00, 0.53, 0.49);
  float t = x * 6.0;
  vec3 c = mix(c0, c1, clamp(t, 0.0, 1.0));
  c = mix(c, c2, clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, c3, clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, c4, clamp(t - 3.0, 0.0, 1.0));
  c = mix(c, c5, clamp(t - 4.0, 0.0, 1.0));
  c = mix(c, c6, clamp(t - 5.0, 0.0, 1.0));
  return c;
}

void main() {
  vec2 p = pxFromUv(vUv, uRes);
  vec2 d = p - uAntisolar;
  float r = length(d);
  float ang = atan(-d.y, d.x);
  if (ang < 0.0 || r < uRadius * 0.25) { outColor = vec4(0.0); return; }

  float u = clamp(ang / PI, 0.0, 1.0);
  float s = texture(uArc, vec2(u, 0.5)).r;
  float dens = texture(uDensity, vUv).r;
  // なめらかに飽和させる（硬い縁ができると霧が板に見えてしまう）
  float m = 1.0 - exp(-dens * 3.2);

  // 空の部分では、霧が薄れても虹はしばらく残る（自分で作った虹が消えないように）
  float sky = smoothstep(uHorizon + 10.0, uHorizon - 60.0, p.y);
  float vis = max(m, 0.42 * sky);

  if (s < 0.004 && m < 0.02) { outColor = vec4(0.0); return; }

  // 霧が揺れるので、帯もほんの少し揺らぐ
  float wob = sin(ang * 9.0 + uTime * 0.7) * 0.004 + sin(ang * 23.0 - uTime * 1.1) * 0.002;

  // 濃くなるほど帯は太くなる（淡く細い → 太く鮮やか）
  float bw = uRadius * uThick * (0.021 + 0.052 * smoothstep(0.0, 0.85, s));
  float t = (r - uRadius * (1.0 + wob)) / bw;
  // 帯のまんなかを平らにして、赤から紫まで全部の色が見えるようにする。
  // （素直なガウス分布だと両端の赤と紫が消えて、黄緑の帯になってしまう）
  float env = exp(-pow(abs(t), 3.0) * 1.7);

  float x = clamp(t * 0.85 + 0.5, 0.0, 1.0);
  vec3 col = spectrum(x);
  // その回の“主役の色”をほんの少しだけ強くする
  float heroBoost = 1.0 + 0.34 * exp(-pow((x - uHero) / 0.16, 2.0));
  col *= heroBoost;
  // 淡いうちは白っぽく、濃くなるほど色がのる
  float sat = 0.30 + 0.70 * smoothstep(0.0, 0.7, s);
  col = mix(vec3(1.02, 1.01, 0.99), col, sat);

  float aPrimary = pow(clamp(s, 0.0, 1.0), 0.78) * env * vis * 0.92;

  // 副虹（条件が良いときだけ、とても淡く）
  float s2 = smoothstep(0.72, 1.0, s);
  float bw2 = bw * 1.7;
  float t2 = (r - uRadius2) / bw2;
  float env2 = exp(-pow(abs(t2), 2.2) * 1.7);
  vec3 col2 = mix(vec3(1.0), spectrum(clamp(0.5 - t2 * 0.5, 0.0, 1.0)), 0.55);
  float aSecondary = s2 * env2 * max(m, 0.32 * sky) * 0.13;

  // アレキサンダーの暗帯：主虹と副虹のあいだは少しだけ暗い
  float insideBand = smoothstep(uRadius + bw * 0.9, uRadius + bw * 2.0, r)
                   * smoothstep(uRadius2 + bw2, uRadius2 - bw2 * 0.4, r);
  float darken = insideBand * s2 * 0.09 * max(m, 0.5 * sky);

  // 色が出る前の“ここだよ”の合図：霧の中にごく淡い銀色の帯
  float hintEnv = exp(-pow(abs((r - uRadius) / (bw * 2.6)), 2.0) * 1.4);
  float aHint = hintEnv * m * (1.0 - smoothstep(0.02, 0.30, s)) * 0.13;

  // 白い霧の“上に足す”のではなく、霧を虹の色で“置きかえる”。
  // そうしないと濃い霧の中で色が白飛びしてしまう。
  // （premultiplied alpha なので dst = rgb + dst * (1 - alpha)）
  float alpha = clamp(aPrimary + aSecondary + darken, 0.0, 1.0);
  vec3 rgb = col * aPrimary + col2 * aSecondary + vec3(0.92, 0.97, 1.0) * aHint;
  // ほんのり自分で光る（にじみ・bloom のもと）
  rgb += col * aPrimary * 0.12;
  outColor = vec4(rgb * uFade, alpha * uFade);
}
`;

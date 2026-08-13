export const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/**
 * ニュートンリングの「それらしい」見た目をつくるフラグメントシェーダ。
 *
 * 物理そのものは解かない。空気層の厚み t = (r^2 - rc^2) / 2R を模した位相 ph を
 * 赤・緑・青の 3 波長ぶん sin^2 でサンプルするだけで、白色光の薄膜色に近い
 * 「中心が黒く、外に向かって虹が繰り返し、次第に白っぽくなる」帯が出る。
 *
 *   ph     … 赤い縞の本数 (uK * (r^2 - rc^2))
 *   uK     … 押すほど小さくなる → 縞が外へ広がる
 *   uContact … 接触面の半径。押すほど大きくなる → 中央の黒い点が育つ
 */
export const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;      // 画面のピクセル数
uniform float uPx;       // 1 単位あたりのピクセル数 (= 0.5 * min(w,h))
uniform float uTime;
uniform float uSquash;   // 斜め上から見たときの y 方向のつぶれ (cos の代わり)

uniform vec2  uPlateC;   // ガラス板の中心
uniform vec2  uPlateH;   // ガラス板の半径 (x, y)

uniform vec2  uCenter;   // レンズの中心
uniform float uLensR;    // レンズの見た目の半径
uniform float uLensOn;   // レンズが置かれているか 0..1

uniform float uLight;    // ライト 0..1
uniform float uReveal;   // 点灯時に中心から広がる演出 0..1.5
uniform float uPress;    // 押しぐあい 0..1.2 (ばねなので少し行き過ぎる)
uniform float uContact;  // 接触面の半径 (レンズ内 0..1)
uniform float uK;        // 縞の本数の係数
uniform float uGhostR;   // チャレンジの目標リング半径 (0 で非表示)
uniform float uGhostHit; // 目標にどれだけ近いか 0..1
uniform float uRingR;    // いま光っている一番内側のリング半径 (0 で非表示)
uniform float uFlash;    // 成功時の光 0..1

const float PI = 3.14159265;

float sdRound(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

float sinsq(float x) {
  float s = sin(PI * x);
  return s * s;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

// ---------- 机 ----------
vec3 background(vec2 p) {
  float t = clamp(p.y * 0.45 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.062, 0.050, 0.104), vec3(0.150, 0.120, 0.243), t);

  vec2 d = p - vec2(0.0, 0.10);
  float pool = exp(-dot(d, d) * 0.85);
  c += vec3(0.150, 0.120, 0.086) * pool * (0.22 + 0.90 * uLight);

  c += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.013;
  return c;
}

// ---------- 平らなガラス ----------
vec3 plate(vec3 c, vec2 p) {
  float px = 1.0 / uPx;
  vec2 q = vec2(p.x - uPlateC.x, (p.y - uPlateC.y) / uSquash);

  float ds = sdRound(q + vec2(0.0, 0.13), uPlateH, 0.16);
  c = mix(c, c * 0.40, smoothstep(0.26, -0.02, ds) * 0.8);

  float d = sdRound(q, uPlateH, 0.16);
  float inside = smoothstep(px * 1.5, -px * 1.5, d);

  vec3 glass = mix(vec3(0.082, 0.100, 0.158), vec3(0.128, 0.163, 0.232),
                   clamp(q.y / uPlateH.y * 0.5 + 0.5, 0.0, 1.0));
  glass += vec3(0.045, 0.062, 0.080) * uLight;
  c = mix(c, glass, inside);

  float streak = smoothstep(0.13, 0.0, abs(q.y - uPlateH.y * 0.52 + q.x * 0.18));
  c += vec3(0.085, 0.110, 0.140) * streak * inside * (0.30 + 0.85 * uLight);

  float rim = smoothstep(px * 3.0, 0.0, abs(d + px * 1.5));
  c += vec3(0.30, 0.40, 0.56) * rim * (0.25 + 0.65 * uLight);

  return c;
}

// ---------- レンズと虹の輪 ----------
vec3 lens(vec3 c, vec2 p) {
  float px = 1.0 / uPx;
  float R = max(uLensR, 1e-4);
  vec2 d = vec2(p.x - uCenter.x, (p.y - uCenter.y) / uSquash);
  float r = length(d) / R;

  // 落ち影 (押すと少しふくらむ)
  vec2 sd = vec2(d.x, d.y + R * 0.15);
  float rs = length(sd) / (R * (1.02 + 0.12 * uPress));
  c = mix(c, c * 0.32, smoothstep(1.30, 0.30, rs) * 0.55 * uLensOn);

  if (r > 1.2 || uLensOn < 0.01) return c;

  float aaw = px / R * 1.3;
  float body = smoothstep(1.0 + aaw, 1.0 - aaw, r);

  // --- ガラスの下地 ---
  vec3 col = mix(vec3(0.052, 0.058, 0.098), vec3(0.098, 0.112, 0.166),
                 clamp(d.y / R * 0.5 + 0.5, 0.0, 1.0));

  // --- 干渉のしま ---
  float rc = uContact;
  float rr = max(r * r - rc * rc, 0.0);
  float ph = uK * rr;

  // 1 ピクセルあたり何本の縞になるか → 細かすぎたら真珠色に溶かす
  float fpp = 2.0 * r * uK * 1.44 / (R * uPx);
  float aa = smoothstep(0.46, 0.10, fpp);

  vec3 I = vec3(sinsq(ph), sinsq(ph * 1.18), sinsq(ph * 1.44));
  I = mix(vec3(0.5), I, aa);
  vec3 ring = I * vec3(1.06, 1.00, 1.10);

  // 外側ほど少し落とす + 点灯時に中心から広がる
  float env = mix(1.0, 0.72, smoothstep(0.55, 1.0, r));
  float rev = smoothstep(uReveal, uReveal - 0.32, r);
  float mask = uLight * rev * env;

  col += ring * mask * 1.55;

  // 接触面 (中央の黒い点) のふちを光らせる
  float cb = smoothstep(0.040, 0.0, abs(r - rc)) * step(0.015, rc);
  col += vec3(0.55, 0.62, 0.80) * cb * (0.25 + 0.75 * uLight);
  col += vec3(0.075, 0.085, 0.120) * smoothstep(rc, rc * 0.72, r) * uLight;

  // チャレンジの めやすの輪
  if (uGhostR > 0.001) {
    float g = smoothstep(0.050, 0.006, abs(r - uGhostR));
    float ang = atan(d.y, d.x);
    float dash = smoothstep(0.42, 0.52, fract(ang * 2.55 + uTime * 0.16));
    float pulse = 0.62 + 0.38 * sin(uTime * 3.4);
    vec3 gc = mix(vec3(1.0, 0.98, 0.90), vec3(0.50, 1.0, 0.82), uGhostHit);
    col += gc * g * dash * pulse * (0.55 + 0.95 * uGhostHit);
  }

  // いま広がっている輪の位置
  if (uRingR > 0.001) {
    float w = smoothstep(0.026, 0.0, abs(r - uRingR));
    col += vec3(1.0) * w * 0.45 * uLight;
  }

  // ドームのてかり
  vec2 h1 = d / R - vec2(-0.30, 0.33);
  col += vec3(1.0, 0.98, 0.94) * exp(-dot(h1, h1) * 6.5) * (0.14 + 0.42 * uLight);
  vec2 h2 = d / R - vec2(-0.43, 0.46);
  col += vec3(1.0) * exp(-dot(h2, h2) * 95.0) * (0.35 + 0.65 * uLight);

  // ふち
  col += vec3(0.45, 0.55, 0.78) * smoothstep(0.84, 1.0, r) * (0.22 + 0.45 * uLight);
  col += vec3(0.85, 0.92, 1.0) * smoothstep(1.0 - aaw * 4.0, 1.0 - aaw, r) * 0.45;

  col += vec3(1.0, 0.95, 0.98) * uFlash * 0.9;

  return mix(c, col, body);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uPx;

  vec3 c = background(p);
  c = plate(c, p);
  c = lens(c, p);

  // ランプの こぼれ光
  vec2 lp = p - vec2(0.0, 1.05);
  c += vec3(0.20, 0.165, 0.095) * exp(-dot(lp, lp) * 1.15) * uLight;

  // まわりを少し暗く
  c *= mix(0.70, 1.0, smoothstep(2.15, 0.45, length(p)));

  gl_FragColor = vec4(c, 1.0);
}
`

// ビスマスらしさを作る GLSL。ライトは Three のライトを使わず、
// シーンに合わせて解析的に書いている（軽くて、色をコントロールしやすい）。

export const ENV_GLSL = /* glsl */ `
vec3 envColor(vec3 d){
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.045, 0.035, 0.075), vec3(0.30, 0.34, 0.55), h);
  c = mix(c, vec3(0.55, 0.42, 0.62), pow(h, 4.0));
  // メインの照明（上前方）
  float k = pow(max(dot(d, normalize(vec3(0.35, 0.86, 0.36))), 0.0), 26.0);
  c += vec3(1.0, 0.96, 0.88) * k * 2.6;
  // 左うしろの青いライト
  float k2 = pow(max(dot(d, normalize(vec3(-0.72, 0.34, -0.58))), 0.0), 12.0);
  c += vec3(0.30, 0.62, 1.0) * k2 * 0.85;
  // 右の桃色ライト
  float k3 = pow(max(dot(d, normalize(vec3(0.80, 0.20, -0.30))), 0.0), 14.0);
  c += vec3(1.0, 0.42, 0.72) * k3 * 0.6;
  // 床のはねかえり
  c += vec3(0.16, 0.13, 0.20) * pow(clamp(-d.y, 0.0, 1.0), 2.0);
  return c;
}

// 薄膜干渉っぽい虹色（酸化膜の厚みで色が変わる）
vec3 thinFilm(float t){
  return 0.5 + 0.5 * cos(6.28318 * (t * vec3(1.00, 0.83, 0.66) + vec3(0.00, 0.16, 0.33)));
}

float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash31(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
`;

/* ------------------------------------------------------------------ */
/* 結晶：カクカクの階段状ビスマス                                       */
/* ------------------------------------------------------------------ */

export const CRYSTAL_VERT = /* glsl */ `
attribute float aLayer;   // 何段目か
attribute vec3  aCenter;  // その段の中心（そこから育つ）
attribute float aRand;    // 面ごとのばらつき

uniform float uGrow;      // 育ちぐあい（0 → 段数+1）
uniform float uTime;
uniform float uMelt;      // 1.0 = まだ とろっとしている

varying vec3  vN;
varying vec3  vW;
varying float vLayer;
varying float vRand;
varying float vLocalY;
varying float vGrow;

void main(){
  float g = clamp(uGrow - aLayer, 0.0, 1.0);
  // ぽん、と出る動き（easeOutBack）
  float c1 = 1.70158;
  float c3 = c1 + 1.0;
  float gm = g - 1.0;
  float e = 1.0 + c3 * gm * gm * gm + c1 * gm * gm;

  vec3 p = mix(aCenter, position, e);

  // とけている間はすこし揺れる
  if (uMelt > 0.001) {
    float w = sin(uTime * 2.4 + aRand * 9.0 + p.y * 6.0) * 0.012 * uMelt;
    p.xz += w;
    p.y += cos(uTime * 1.9 + aRand * 5.0) * 0.006 * uMelt;
  }

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vLayer = aLayer;
  vRand = aRand;
  vLocalY = position.y;
  vGrow = g;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CRYSTAL_FRAG = /* glsl */ `

uniform vec3  uCam;
uniform float uTime;
uniform float uRainbow;   // 0 = くすんだ銀 / 1 = ぎらぎら虹
uniform float uHeat;      // 熱の赤み
uniform float uLayers;
uniform float uSpin;      // 回した勢い（きらめきが増える）
uniform float uSpotlight; // ライトの下 = 1

varying vec3  vN;
varying vec3  vW;
varying float vLayer;
varying float vRand;
varying float vLocalY;
varying float vGrow;

${ENV_GLSL}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  if (!gl_FrontFacing) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);

  vec3 R = reflect(-V, N);
  vec3 env = envColor(R);

  // --- 金属のベース（ビスマスはやや暗い銀にピンクがかる） ---
  vec3 base = mix(vec3(0.22, 0.23, 0.27), vec3(0.33, 0.27, 0.30), vRand);

  // --- 薄膜の厚み：段ごと・面ごとに変える ---
  float lay = vLayer / max(uLayers, 1.0);
  float thick =
      1.06
    + lay * 1.55                                  // 上の段ほど厚い＝色が回る
    + vRand * 0.30                                // 棒ごとのわずかなちがい
    + hash31(floor(N * 7.0)) * 0.28               // 面ごとのばらつき
    + sin(vW.y * 5.0 + uTime * 0.35) * 0.10;      // ゆっくり色が流れる

  // 見る角度で色が変わる（これが虹の気持ちよさ）
  float cosT = sqrt(max(0.0, 1.0 - (1.0 - ndv * ndv) / 2.6));
  float phase = thick / max(cosT, 0.28);
  vec3 irid = thinFilm(phase);
  // 金属の上の酸化膜なので、色はこいけれど「照りかえし」を残す
  irid = pow(clamp(irid, 0.0, 1.0), vec3(1.15));
  float ilum = dot(irid, vec3(0.299, 0.587, 0.114));
  irid = mix(vec3(ilum), irid, 0.55 + 0.55 * uRainbow);

  // フレネル：ふちほど虹が強い
  float fres = pow(1.0 - ndv, 2.6);
  float mixAmt = clamp((0.52 + 0.42 * fres) * uRainbow, 0.0, 1.0);

  // 上むきの面はライトをよく受け、下むきの面は暗い（かたちが見える）
  float form = 0.55 + 0.45 * (dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5);

  vec3 col = base * (0.30 + 0.75 * env) * form;
  col = mix(col, irid * (0.40 + 0.80 * env) * form * 1.35, mixAmt);

  // --- 鏡面ハイライト（2灯） ---
  vec3 L1 = normalize(vec3(0.35, 0.86, 0.36));
  vec3 L2 = normalize(vec3(-0.72, 0.34, -0.58));
  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);
  float s1 = pow(max(dot(N, H1), 0.0), 90.0);
  float s2 = pow(max(dot(N, H2), 0.0), 60.0);
  col += vec3(1.0, 0.97, 0.90) * s1 * (1.1 + 1.9 * uSpotlight);
  col += vec3(0.45, 0.72, 1.0) * s2 * 0.55;

  // --- 段のふちを光らせる（カクカク感） ---
  float edge = pow(1.0 - abs(dot(N, vec3(0.0, 1.0, 0.0))), 3.0);
  col += irid * edge * 0.18 * uRainbow;

  // --- 回すとちらちら光る ---
  float tw = hash31(floor(N * 23.0) + floor(vW * 11.0));
  float spark = pow(max(sin(uTime * 7.0 + tw * 30.0), 0.0), 42.0);
  col += vec3(1.0) * spark * (0.30 + 1.5 * uSpin) * uRainbow * (0.35 + fres);

  // --- 熱が残っているときの赤み ---
  col += vec3(1.0, 0.34, 0.06) * uHeat * (0.35 + 0.5 * fres);

  // 育ちたてはふわっと光る
  col += vec3(1.0, 0.85, 0.55) * (1.0 - smoothstep(0.55, 1.0, vGrow)) * 0.55 * step(0.001, vGrow);

  // やわらかいトーンマップ（色はとばさない）
  col = col / (col + vec3(0.9)) * 1.45;
  col = pow(max(col, 0.0), vec3(0.4545));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.0 + 0.22 * uRainbow);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* とけた金属（とろっ）                                                 */
/* ------------------------------------------------------------------ */

export const MELT_VERT = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform float uTopY;

varying vec3 vN;
varying vec3 vW;
varying float vTop;
varying vec2 vXZ;

void main(){
  vec3 p = position;
  float top = smoothstep(uTopY - 0.06, uTopY - 0.005, p.y);
  vTop = top;

  float r = length(p.xz);
  float ripple =
      sin(r * 11.0 - uTime * 1.9) * 0.016
    + sin(p.x * 7.5 + uTime * 1.35) * 0.011
    + cos(p.z * 8.5 - uTime * 1.1) * 0.010;
  p.y += ripple * top * uWobble;

  // ふちがとろっと盛り上がる（表面張力っぽく）
  p.y += top * uWobble * smoothstep(0.55, 1.0, r) * 0.02;

  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vXZ = p.xz;

  vec3 n = normal;
  if (top > 0.5) {
    float e = 0.035;
    float d1 = (sin((r + e) * 11.0 - uTime * 1.9) - sin((r - e) * 11.0 - uTime * 1.9)) * 0.016;
    n = normalize(vec3(-d1 * 12.0 * (p.x / max(r, 0.001)), 1.0, -d1 * 12.0 * (p.z / max(r, 0.001))));
  }
  vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const MELT_FRAG = /* glsl */ `

uniform vec3  uCam;
uniform float uTime;
uniform float uHeat;      // 0 = 銀のかたまり / 1 = まっ赤にとけている
uniform float uRainbow;

varying vec3 vN;
varying vec3 vW;
varying float vTop;
varying vec2 vXZ;

${ENV_GLSL}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 R = reflect(-V, N);
  vec3 env = envColor(R);

  vec3 silver = vec3(0.40, 0.41, 0.46);
  vec3 col = silver * (0.22 + 0.72 * env);

  // 熱で光る（内側から）。まっ白にとばさず、なみのかげが見えるようにする。
  float r = length(vXZ);
  vec3 L1 = normalize(vec3(0.35, 0.86, 0.36));
  float shade = 0.55 + 0.45 * max(dot(N, L1), 0.0);
  // まんなかほど熱く、ふちは るつぼに冷やされて 赤ぐろい
  float core = smoothstep(0.95, 0.05, r);
  vec3 hotEdge = vec3(0.34, 0.020, 0.002);
  vec3 hotCore = vec3(1.15, 0.34, 0.030);
  vec3 hot = mix(hotEdge, hotCore, core * (0.35 + 0.65 * uHeat));
  // なみのかたちに合わせて 明るさが動く（とろっとした ゆらぎ）
  float wave = 0.62
    + 0.48 * sin(r * 13.0 - uTime * 2.0 + vXZ.x * 2.0)
    * (0.45 + 0.55 * sin(uTime * 1.3 + vXZ.y * 5.0));
  col = mix(col, hot * wave * shade * 1.2, clamp(uHeat * 1.35, 0.0, 1.0));
  col += hot * uHeat * uHeat * 0.5 * wave;

  // 冷めてくると虹の膜が出る
  float fres = pow(1.0 - ndv, 3.0);
  vec3 irid = thinFilm(1.2 + vXZ.x * 1.4 + vXZ.y * 1.1 + uTime * 0.12);
  col = mix(col, irid * (0.6 + env), fres * uRainbow * 0.85);

  vec3 H1 = normalize(L1 + V);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(N, H1), 0.0), 70.0) * 1.1 * vTop * (1.0 - 0.75 * uHeat);

  col = col / (col + vec3(0.85)) * 1.42;
  col = pow(max(col, 0.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* るつぼ・台などの単純なマット面                                        */
/* ------------------------------------------------------------------ */

export const MATTE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const MATTE_FRAG = /* glsl */ `
uniform vec3  uCam;
uniform vec3  uColor;
uniform float uRough;    // 1 = ざらざら
uniform float uHeat;     // 下から熱で赤くなる
uniform float uTime;
uniform float uDim;      // 仕上げのとき、工房の明かりを おとす
varying vec3 vN;
varying vec3 vW;

${ENV_GLSL}

void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  vec3 L1 = normalize(vec3(0.35, 0.86, 0.36));
  vec3 L2 = normalize(vec3(-0.72, 0.34, -0.58));

  float d1 = max(dot(N, L1), 0.0);
  float d2 = max(dot(N, L2), 0.0);
  vec3 col = uColor * (0.16 + 0.85 * d1) + uColor * d2 * 0.30 * vec3(0.5, 0.7, 1.2);

  vec3 R = reflect(-V, N);
  col += envColor(R) * (1.0 - uRough) * 0.55;

  vec3 H = normalize(L1 + V);
  col += vec3(1.0) * pow(max(dot(N, H), 0.0), mix(180.0, 12.0, uRough)) * (1.0 - uRough) * 0.6;

  // 加熱：下のほうが赤くなる
  float low = smoothstep(0.65, -0.15, vW.y);
  col += vec3(1.0, 0.25, 0.05) * uHeat * low * (0.55 + 0.25 * sin(uTime * 3.1 + vW.x * 5.0));

  col *= uDim;
  col = col / (col + vec3(0.9)) * 1.42;
  col = pow(max(col, 0.0), vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* 背景（工房のふんいき）                                               */
/* ------------------------------------------------------------------ */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
uniform float uNiji;   // 仕上げのときだけ背景も虹がかる

${ENV_GLSL}

void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.055, 0.030, 0.085), vec3(0.16, 0.11, 0.26), h);
  col = mix(col, vec3(0.30, 0.16, 0.34), pow(h, 3.0));
  // ステージのスポットライトのにじみ
  float spot = pow(max(dot(d, normalize(vec3(0.0, 0.85, 0.5))), 0.0), 8.0);
  col += vec3(0.35, 0.30, 0.45) * spot * 0.5;

  if (uNiji > 0.001) {
    vec3 niji = thinFilm(d.x * 1.4 + d.y * 2.0 + uTime * 0.05);
    col = mix(col, col * 0.6 + niji * 0.30, uNiji * (0.35 + 0.45 * pow(h, 2.0)));
  }

  float g = hash31(floor(d * 260.0)) * 0.012;
  gl_FragColor = vec4(col + g, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* きらきら粒子                                                        */
/* ------------------------------------------------------------------ */

export const SPARK_VERT = /* glsl */ `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uLife;     // 0..1 で散っていく
uniform float uPix;
varying float vSeed;
varying float vFade;

${ENV_GLSL}

void main(){
  vec3 p = position;
  float t = fract(uLife + aSeed);
  p += normalize(vec3(hash11(aSeed) - 0.5, hash11(aSeed + 3.1) * 0.9, hash11(aSeed + 7.7) - 0.5))
       * t * (0.55 + aSeed * 0.5);
  p.y += sin(uTime * 1.6 + aSeed * 20.0) * 0.05;
  vFade = sin(t * 3.14159);
  vSeed = aSeed;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uPix * (1.0 / max(-mv.z, 0.15)) * vFade;
  gl_Position = projectionMatrix * mv;
}
`;

export const SPARK_FRAG = /* glsl */ `
varying float vSeed;
varying float vFade;
uniform float uOpacity;

${ENV_GLSL}

void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  // 十字のきらめき
  float cross = smoothstep(0.06, 0.0, abs(uv.x)) + smoothstep(0.06, 0.0, abs(uv.y));
  vec3 c = thinFilm(vSeed * 4.0 + 0.6);
  c = mix(vec3(1.0), c, 0.72);
  float a = (core * 0.8 + cross * 0.35 * core) * vFade * uOpacity;
  gl_FragColor = vec4(c * (1.0 + cross), a);
}
`;

/* ------------------------------------------------------------------ */
/* ほのお                                                              */
/* ------------------------------------------------------------------ */

export const FLAME_VERT = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec2 vUv;
varying float vY;
void main(){
  vUv = uv;
  vY = uv.y;
  vec3 p = position;
  float sway = sin(uTime * 6.0 + p.y * 4.0) * 0.05 + sin(uTime * 9.3 + p.x * 6.0) * 0.03;
  p.xz += sway * uv.y * uv.y;
  p.y *= 0.55 + 0.75 * uPower;
  p.xz *= 0.75 + 0.35 * uPower;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const FIRE_RING_VERT = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 p = position;
  p.y *= 0.45 + 0.75 * uPower;
  p.y -= (1.0 - uPower) * 0.12;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const FIRE_RING_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec2 vUv;

float h21b(vec2 p){
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

float vnoise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21b(i), h21b(i + vec2(1.0, 0.0)), f.x),
             mix(h21b(i + vec2(0.0, 1.0)), h21b(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main(){
  // 横に ならんだ 炎の舌。高さは ゆらゆら 変わる。
  float col1 = vUv.x * 16.0;
  float tall = 0.26 + 0.52 * vnoise2(vec2(col1, uTime * 1.9));
  float body = smoothstep(tall, tall * 0.05, vUv.y);
  float n = vnoise2(vec2(vUv.x * 34.0, vUv.y * 6.0 - uTime * 3.8));
  // ほそい舌にする（もやっとした かたまりにしない）
  float thin = smoothstep(0.28, 0.62, vnoise2(vec2(col1 * 1.7, uTime * 1.2 + 5.0)));
  float a = body * thin * (0.30 + 0.85 * n) * uPower;

  vec3 c = mix(vec3(1.0, 0.30, 0.02), vec3(1.0, 0.80, 0.28), smoothstep(0.45, 0.0, vUv.y));
  c = mix(c, vec3(0.45, 0.68, 1.0), smoothstep(0.09, 0.0, vUv.y) * 0.8);
  gl_FragColor = vec4(c * (0.9 + 0.6 * n), clamp(a, 0.0, 1.0) * 0.8);
}
`;

export const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uPower;
varying vec2 vUv;
varying float vY;

float h21(vec2 p){
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main(){
  float n = vnoise(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 2.2)) * 0.6
          + vnoise(vec2(vUv.x * 13.0, vUv.y * 7.0 - uTime * 3.6)) * 0.4;
  float body = smoothstep(0.85, 0.05, vY) * (0.55 + n * 0.85);
  float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5) * 2.0);
  float a = body * edge * uPower;
  vec3 c = mix(vec3(1.0, 0.28, 0.03), vec3(1.0, 0.86, 0.40), smoothstep(0.0, 0.55, 1.0 - vY));
  c = mix(c, vec3(0.55, 0.75, 1.0), smoothstep(0.10, 0.0, vY) * 0.75);
  gl_FragColor = vec4(c * (1.2 + n), clamp(a, 0.0, 1.0) * 0.9);
}
`;

/* ------------------------------------------------------------------ */
/* スポットライトの光の柱                                              */
/* ------------------------------------------------------------------ */

export const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vP;
void main(){
  vUv = uv;
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const BEAM_FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
uniform float uNiji;
varying vec2 vUv;
varying vec3 vP;

${ENV_GLSL}

void main(){
  float rim = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.5);
  float fade = smoothstep(0.0, 0.85, vUv.y);
  vec3 c = vec3(1.0, 0.95, 0.85);
  if (uNiji > 0.0) {
    c = mix(c, thinFilm(vUv.x * 3.0 + uTime * 0.25), uNiji * 0.55);
  }
  float a = rim * fade * uOpacity * 0.30;
  gl_FragColor = vec4(c, a);
}
`;

/* ------------------------------------------------------------------ */
/* しずく（流したときの粒）                                            */
/* ------------------------------------------------------------------ */

export const DROP_VERT = /* glsl */ `
attribute float aSize;
uniform float uPix;
varying vec3 vC;
attribute vec3 aColor;
void main(){
  vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPix * (1.0 / max(-mv.z, 0.15));
  gl_Position = projectionMatrix * mv;
}
`;

export const DROP_FRAG = /* glsl */ `
varying vec3 vC;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.15, d);
  gl_FragColor = vec4(vC * (1.4 - d), a);
}
`;

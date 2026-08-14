// GLSL。3 つの Hero Material（カラメル・プリン・銀の型）と液体のシェーダ。
//
// 質感の柱:
//   1. 環境マップ由来の鏡面反射（映り込みがあると素材は一気に本物になる）
//   2. Beer-Lambert 吸収（厚みで色が変わる = カラメルの正体）
//   3. 内部散乱と縁の透過（プリンが「詰まっている」のではなく「透けている」）
//   4. 背後を屈折で拾う 2 パス（皿がプリン越しに歪む）
import {
  KEY_DIR,
  KEY_COLOR,
  KEY_INTENSITY,
  FILL_DIR,
  FILL_COLOR,
  FILL_INTENSITY,
  BOUNCE_DIR,
  BOUNCE_COLOR,
  BOUNCE_INTENSITY,
  ENV_SCALE,
} from '../light.js';

const v3 = (a) => `vec3(${a[0].toFixed(5)}, ${a[1].toFixed(5)}, ${a[2].toFixed(5)})`;

export const PRELUDE = `#version 300 es
precision highp float;
precision highp sampler2D;

const float PI = 3.141592653589793;
const float ENV_SCALE = ${ENV_SCALE.toFixed(3)};

const vec3 L_KEY = ${v3(KEY_DIR)};
const vec3 C_KEY = ${v3(KEY_COLOR)} * ${KEY_INTENSITY.toFixed(3)};
const vec3 L_FILL = ${v3(FILL_DIR)};
const vec3 C_FILL = ${v3(FILL_COLOR)} * ${FILL_INTENSITY.toFixed(3)};
const vec3 L_BOUNCE = ${v3(BOUNCE_DIR)};
const vec3 C_BOUNCE = ${v3(BOUNCE_COLOR)} * ${BOUNCE_INTENSITY.toFixed(3)};

uniform sampler2D uEnv;
uniform float uEnvMaxLod;
uniform vec3 uV;

vec3 envAt(vec3 d, float lod) {
  float u = atan(d.x, d.z) / (2.0 * PI) + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return textureLod(uEnv, vec2(u, v), lod).rgb * ENV_SCALE;
}

vec3 fSchlick(float c, vec3 F0) { return F0 + (1.0 - F0) * pow(1.0 - c, 5.0); }

float dGGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-7);
}

float vSmith(float NoV, float NoL, float a) {
  float a2 = a * a;
  float gv = NoL * sqrt(NoV * NoV * (1.0 - a2) + a2);
  float gl2 = NoV * sqrt(NoL * NoL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl2, 1e-5);
}

// Karis のモバイル向け近似（BRDF LUT を持たずに済ませる）
vec3 envBRDF(vec3 F0, float rough, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r = rough * c0 + c1;
  float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
  return F0 * ab.x + ab.y;
}

// 1 灯ぶんの直接光
vec3 oneLight(vec3 N, vec3 V, vec3 L, vec3 C, vec3 albedo, vec3 F0,
              float rough, float metal, float wrap) {
  float NoL = dot(N, L);
  float diff = max(0.0, (NoL + wrap) / (1.0 + wrap));
  diff *= diff; // 端をやわらかく
  vec3 H = normalize(L + V);
  float NoH = max(0.0, dot(N, H));
  float NoV = max(1e-4, dot(N, V));
  float a = max(0.015, rough * rough);
  float spec = dGGX(NoH, a) * vSmith(NoV, max(NoL, 0.0), a) * max(NoL, 0.0);
  vec3 F = fSchlick(max(0.0, dot(H, V)), F0);
  return C * (albedo * (1.0 - metal) * diff / PI + F * spec);
}

vec3 shadeDirect(vec3 N, vec3 V, vec3 albedo, float rough, float metal, float wrap) {
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 c = oneLight(N, V, L_KEY, C_KEY, albedo, F0, rough, metal, wrap);
  c += oneLight(N, V, L_FILL, C_FILL, albedo, F0, rough, metal, wrap);
  c += oneLight(N, V, L_BOUNCE, C_BOUNCE, albedo, F0, rough, metal, wrap);
  return c;
}

vec3 shadeIBL(vec3 N, vec3 V, vec3 albedo, float rough, float metal, float occ) {
  float NoV = max(1e-4, dot(N, V));
  vec3 R = reflect(-V, N);
  vec3 pre = envAt(R, rough * uEnvMaxLod);
  vec3 irr = envAt(N, uEnvMaxLod * 0.8);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  return (albedo * (1.0 - metal) * irr * 0.30 + pre * envBRDF(F0, rough, NoV)) * occ;
}
`;

// --- 共通の頂点シェーダ（変形あり／なしを uniform で切替） -------------------
export const VS_LATHE = `${PRELUDE}
in vec3 aPos;
in vec3 aNrm;
in vec3 aTanU;
in vec3 aTanV;
in vec3 aUv;

uniform mat4 uProj;
uniform mat4 uModel;
uniform mat3 uNormal;
uniform float uHeight;
uniform float uWobble;
uniform float uPhase;
uniform float uSquash;
uniform float uStick;

out vec3 vW;
out vec3 vN;
out vec3 vUv;
out vec3 vTu;
out vec3 vTv;
out vec4 vClip;

vec3 deform(vec3 p) {
  float t = clamp(p.y / max(uHeight, 1e-3), 0.0, 1.0);
  float hs = (1.0 - uSquash * 0.55) * (1.0 + uStick * 0.06);
  float rs = 1.0 + uSquash * 0.34 * (1.0 - t * 0.45) - uStick * 0.035;
  float sway = uWobble * sin(uPhase - t * 2.15) * pow(t, 1.25)
             + uWobble * 0.30 * sin(uPhase * 2.0 + 1.1 - t * 3.4) * pow(t, 1.6);
  return vec3(p.x * rs + sway, p.y * hs, p.z * rs);
}

void main() {
  vec3 P = deform(aPos);
  float e = 0.8;
  vec3 du = deform(aPos + aTanU * e) - P;
  vec3 dv = deform(aPos + aTanV * e) - P;
  vec3 n = normalize(cross(du, dv) + 1e-6);
  if (dot(n, aNrm) < 0.0) n = -n;

  vW = (uModel * vec4(P, 1.0)).xyz;
  vN = normalize(uNormal * n);
  vTu = normalize(uNormal * normalize(du + 1e-6));
  vTv = normalize(uNormal * normalize(dv + 1e-6));
  vUv = aUv;
  vClip = uProj * vec4(vW, 1.0);
  gl_Position = vClip;
}
`;

// --- プリン + カラメル -------------------------------------------------------
export const FS_PUDDING = `${PRELUDE}
in vec3 vW;
in vec3 vN;
in vec3 vUv;
in vec3 vTu;
in vec3 vTv;
in vec4 vClip;

uniform sampler2D uField;    // カラメルの厚み場
uniform sampler2D uDetail;   // 微細ディテール
uniform sampler2D uScene;    // 背後（屈折用）
uniform float uRefract;      // 0..1
uniform float uCaramel;      // カラメルを乗せるか（0..1）
uniform float uHeightW;      // 高さ（ワールド単位、AO 用）

out vec4 outColor;

// カスタードの吸収係数（青を強く吸うので厚いほど濃い黄金色になる）
const vec3 SIG_CUSTARD = vec3(0.0072, 0.0182, 0.0520);
// カラメルの吸収係数。1 ワールド単位 ≒ 0.75mm 相当で調整してある。
// 薄い所は黄金色、厚い所は焦げ茶。真っ黒にはしない。
const vec3 SIG_CARAMEL = vec3(0.40, 0.80, 1.42);

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uV);
  float NoV = max(1e-3, dot(N, V));

  // --- カラメル層の厚み ---
  float ct = texture(uField, vUv.xy).r;
  ct *= uCaramel;
  float capMask = smoothstep(0.02, 0.30, vUv.z);
  ct = max(ct, capMask * uCaramel);

  // 厚みの勾配から法線を曲げる（垂れが盛り上がって見える）
  vec2 px = vec2(1.5 / 512.0, 1.5 / 256.0);
  float hx = texture(uField, vUv.xy + vec2(px.x, 0.0)).r
           - texture(uField, vUv.xy - vec2(px.x, 0.0)).r;
  float hy = texture(uField, vUv.xy + vec2(0.0, px.y)).r
           - texture(uField, vUv.xy - vec2(0.0, px.y)).r;
  hx = clamp(hx, -0.6, 0.6);
  hy = clamp(hy, -0.6, 0.6);
  vec3 Nc = normalize(N - (vTu * hx * 0.95 + vTv * hy * 0.55) * uCaramel);

  // --- プリン本体 ---
  // 気泡「す」。下ほど多い。
  float bub = texture(uDetail, vUv.xy * vec2(4.0, 2.4)).a;
  bub *= smoothstep(0.75, 0.1, vUv.y) * 0.8;
  vec3 Np = normalize(N + (vTu * (bub - 0.4) + vTv * (bub - 0.4)) * 0.09);

  // 視線方向の見かけの厚み。中心ほど厚く、シルエットで薄い。
  float bodyT = 3.0 + 30.0 * pow(NoV, 0.62);
  vec3 inner = exp(-SIG_CUSTARD * bodyT);

  vec3 albedo = vec3(1.0, 0.87, 0.56) * inner;
  float rough = 0.085 + bub * 0.08;

  vec3 col = shadeDirect(Np, V, albedo, rough, 0.0, 0.55);
  col += shadeIBL(Np, V, albedo, rough, 0.0, 1.0);

  // 内部で散った光の「戻り」。プリンが詰まっていないで透けている感じの正体。
  float back1 = max(0.0, dot(-Np, L_KEY)) * 0.5 + 0.5;
  vec3 sss = exp(-SIG_CUSTARD * (5.0 + 22.0 * NoV)) * vec3(1.25, 0.86, 0.34);
  col += sss * back1 * 0.55;

  // 縁の透過（薄いところは光が抜けて明るく光る）
  float edge = pow(1.0 - NoV, 2.0);
  vec3 thin = exp(-SIG_CUSTARD * (1.6 + 5.0 * NoV));
  col += thin * vec3(1.25, 0.92, 0.42) * edge * 2.3;

  // 下ほど光が回らない（縦の階調がないと「板」に見える）
  col *= mix(0.72, 1.06, smoothstep(0.0, 0.85, vUv.y));

  // 背後の屈折（皿の白がプリン越しに滲む）
  if (uRefract > 0.0) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec2 off = vec2(dot(N, vec3(1.0, 0.0, 0.0)), dot(N, vec3(0.0, 1.0, 0.0)));
    suv += off * 0.055 * (1.0 - NoV) * uRefract;
    vec3 back = texture(uScene, clamp(suv, vec2(0.001), vec2(0.999))).rgb;
    col = mix(col, col * 0.55 + back * inner * 1.1, edge * 0.55 * uRefract);
  }

  // 接地の暗がり
  float ao = mix(0.55, 1.0, smoothstep(0.0, 0.16, vUv.y));
  col *= ao;

  // --- カラメル層を上に乗せる ---
  if (ct > 0.001) {
    // 実寸の膜厚（頂上のたまりで 1.6 単位 ≒ 1.2mm）
    float T = ct * 1.75;
    float cNoV = clamp(dot(Nc, V), 0.40, 1.0);
    float path = T / cNoV;
    vec3 trans = exp(-SIG_CARAMEL * path);
    // 下のプリンはカラメル越しに見える（これが色の主役）
    col *= trans;
    // カラメルはほぼ透明な媒体なので、散乱はごく控えめに足すだけ
    vec3 scat = (1.0 - trans) * vec3(0.62, 0.27, 0.06) * 0.16;
    col += scat;
    // 濡れた表面の鏡面（ここが「照り」になる）
    float crough = 0.075 + 0.06 * (1.0 - ct);
    vec3 cs = shadeDirect(Nc, V, vec3(0.0), crough, 0.0, 0.0);
    cs += envAt(reflect(-V, Nc), crough * uEnvMaxLod) *
          envBRDF(vec3(0.048), crough, cNoV);
    col = mix(col, col + cs * 0.9, smoothstep(0.02, 0.18, ct));
  }

  outColor = vec4(col, 1.0);
}
`;

// --- 金属（プリン型・鍋・ボウルの金属部） -----------------------------------
export const FS_METAL = `${PRELUDE}
in vec3 vW;
in vec3 vN;
in vec3 vUv;
in vec3 vTu;
in vec3 vTv;
in vec4 vClip;

uniform sampler2D uDetail;
uniform float uRibs;        // 横リブの強さ
uniform float uFrost;       // 霜
uniform vec3 uTint;

out vec4 outColor;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uV);

  // 横リブ（プリン型の段）: 高さ方向の周期的な法線の起伏
  float ribs = sin(vUv.y * 26.0) * 0.5 + 0.5;
  ribs = pow(ribs, 3.0);
  float ribD = cos(vUv.y * 26.0) * 26.0;
  N = normalize(N + vTv * ribD * 0.0026 * uRibs);

  // 研磨傷（周方向）と曇り
  vec3 d = texture(uDetail, vec2(vUv.x * 1.0, vUv.y * 9.0)).rgb;
  vec3 dl = texture(uDetail, vec2(vUv.x * 0.7, vUv.y * 0.7)).rgb;
  // 周方向の細かい研磨傷 + ごく緩いうねり
  N = normalize(N + vTv * (d.r - 0.5) * 0.010 + vTu * (dl.b - 0.5) * 0.006);
  float rough = clamp(0.055 + d.r * 0.05 + dl.g * 0.035 + ribs * 0.015, 0.03, 0.35);

  vec3 albedo = uTint;
  vec3 col = shadeDirect(N, V, albedo, rough, 1.0, 0.0);
  col += shadeIBL(N, V, albedo, rough, 1.0, 1.0);

  // 接地の暗がり
  col *= mix(0.45, 1.0, smoothstep(0.0, 0.12, vUv.y));

  // 霜
  if (uFrost > 0.001) {
    float f = uFrost * (0.55 + d.g * 0.75);
    vec3 fr = shadeDirect(N, V, vec3(0.95, 0.97, 1.0), 0.75, 0.0, 0.4)
            + shadeIBL(N, V, vec3(0.95, 0.97, 1.0), 0.75, 0.0, 1.0);
    col = mix(col, fr, clamp(f, 0.0, 0.92));
  }

  outColor = vec4(col, 1.0);
}
`;

// --- 白い陶器（皿） ---------------------------------------------------------
export const FS_CERAMIC = `${PRELUDE}
in vec3 vW;
in vec3 vN;
in vec3 vUv;
in vec3 vTu;
in vec3 vTv;
in vec4 vClip;

uniform sampler2D uDetail;
uniform vec3 uBouncePos;    // プリンからの色移りの中心
uniform vec3 uBounceColor;
uniform float uBounceAmt;
uniform vec4 uOcc0;         // 接地影: xy = 位置, z = 半径, w = 強さ
uniform vec4 uOcc1;

out vec4 outColor;

// 円盤の遮蔽による接地影。皿の上に「置いてある」感を出す最短の手段。
float occlude(vec2 p, vec4 o) {
  if (o.w <= 0.0) return 1.0;
  float d = length(p - o.xy);
  return 1.0 - o.w * (1.0 - smoothstep(o.z * 0.78, o.z * 1.45, d));
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uV);
  vec3 d = texture(uDetail, vUv.xy * vec2(2.0, 1.0)).rgb;
  // 釉薬のわずかなうねり
  N = normalize(N + vTu * (d.b - 0.5) * 0.02 + vTv * (d.b - 0.5) * 0.02);
  float rough = 0.085 + d.g * 0.05;
  vec3 albedo = vec3(0.90, 0.905, 0.92);

  vec3 col = shadeDirect(N, V, albedo, rough, 0.0, 0.25);
  col += shadeIBL(N, V, albedo, rough, 0.0, 1.0);

  // プリンからの色移り（皿が黄色を拾う）
  float dist = length(vW.xz - uBouncePos.xz);
  float b = exp(-dist * dist / 3400.0) * uBounceAmt;
  col += uBounceColor * b * max(0.0, N.y) * 0.9;

  // 影になる内側の落ち込み
  col *= mix(0.86, 1.0, smoothstep(0.0, 0.4, vUv.z));
  // 接地影
  col *= occlude(vW.xz, uOcc0) * occlude(vW.xz, uOcc1);

  outColor = vec4(col, 1.0);
}
`;

// --- 液体（砂糖液・プリン液・カラメル） -------------------------------------
export const FS_LIQUID = `${PRELUDE}
in vec3 vW;
in vec3 vN;
in vec3 vUv;
in vec3 vTu;
in vec3 vTv;
in vec4 vClip;

uniform sampler2D uScene;
uniform sampler2D uDetail;
uniform float uRefract;
uniform vec3 uSigma;       // 吸収係数
uniform float uDepth;      // 液体の深さ（ワールド単位）
uniform float uRough;
uniform float uBoil;       // 沸き具合 0..1
uniform float uTime;

out vec4 outColor;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uV);

  // 沸騰による表面のさざなみ
  if (uBoil > 0.001) {
    float r = vUv.z;
    float w1 = sin(vUv.x * 44.0 + uTime * 5.1 + r * 9.0);
    float w2 = sin(vUv.x * 27.0 - uTime * 3.4 + r * 15.0);
    N = normalize(N + vTu * w1 * 0.05 * uBoil + vTv * w2 * 0.05 * uBoil);
  }

  float NoV = max(1e-3, dot(N, V));
  float path = uDepth / clamp(NoV, 0.28, 1.0);
  vec3 trans = exp(-uSigma * path);

  // 背後を屈折で拾う（ずらし量は液面の傾きぶんだけ。大きすぎると別の物が映る）
  vec3 back = vec3(0.35);
  if (uRefract > 0.0) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    vec2 off = vec2(N.x, N.y * 0.5) * (1.0 - NoV);
    suv += off * 0.045 * uRefract;
    back = texture(uScene, clamp(suv, vec2(0.002), vec2(0.998))).rgb;
  }

  // 液体そのものの色 = 透過スペクトルの正規化（色ベクトルに normalize は使えない）
  vec3 tint = exp(-uSigma * max(uDepth, 1.0) * 1.4);
  tint /= max(1e-3, max(tint.r, max(tint.g, tint.b)));

  float opac = 1.0 - dot(trans, vec3(0.3333));
  vec3 col = back * trans;
  // 内部で散った光。濃い液ほど「自分の色」で光る。
  col += opac * tint * 0.42;

  // 鏡面（濡れた液面）
  vec3 spec = shadeDirect(N, V, vec3(0.0), uRough, 0.0, 0.0);
  spec += envAt(reflect(-V, N), uRough * uEnvMaxLod) *
          envBRDF(vec3(0.043), uRough, NoV);
  col += spec;

  // メニスカス（ふちが盛り上がって明るい線になる）
  float men = smoothstep(0.35, 0.0, vUv.z) * smoothstep(0.0, 0.55, 1.0 - vUv.z);
  col += vec3(1.0, 0.96, 0.9) * men * 0.16;

  outColor = vec4(col, 1.0);
}
`;

// --- 注ぐ流れ（チューブ） ---------------------------------------------------
export const VS_TUBE = `${PRELUDE}
in vec3 aPos;
in vec3 aNrm;
in vec3 aUv;
uniform mat4 uProj;
out vec3 vN;
out vec3 vUv;
out vec4 vClip;
void main() {
  vN = aNrm;
  vUv = aUv;
  vClip = uProj * vec4(aPos, 1.0);
  gl_Position = vClip;
}
`;

export const FS_TUBE = `${PRELUDE}
in vec3 vN;
in vec3 vUv;
in vec4 vClip;
uniform sampler2D uScene;
uniform float uRefract;
uniform vec3 uSigma;
uniform float uRadius;
out vec4 outColor;

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uV);
  float NoV = max(1e-3, dot(N, V));
  float path = uRadius * 2.0 * pow(NoV, 0.5);
  vec3 trans = exp(-uSigma * path);

  vec3 back = vec3(0.4);
  if (uRefract > 0.0) {
    vec2 suv = vClip.xy / vClip.w * 0.5 + 0.5;
    suv += vec2(N.x, N.y * 0.5) * 0.055 * uRefract;
    back = texture(uScene, clamp(suv, vec2(0.002), vec2(0.998))).rgb;
  }
  vec3 tint = exp(-uSigma * uRadius * 2.2);
  tint /= max(1e-3, max(tint.r, max(tint.g, tint.b)));
  float opac = 1.0 - dot(trans, vec3(0.3333));
  vec3 col = back * trans + opac * tint * 0.52;

  float rough = 0.05;
  col += shadeDirect(N, V, vec3(0.0), rough, 0.0, 0.0);
  col += envAt(reflect(-V, N), rough * uEnvMaxLod) * envBRDF(vec3(0.045), rough, NoV);
  outColor = vec4(col, 1.0);
}
`;

// --- フルスクリーンのパス群 --------------------------------------------------
export const VS_FULL = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aP;
out vec2 vUv;
void main() {
  vUv = aP * 0.5 + 0.5;
  gl_Position = vec4(aP, 0.0, 1.0);
}
`;

// 背景（2D レイヤーの縮小コピー）を屈折用に敷く。alpha=0 なので合成では見えない。
export const FS_BACKDROP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  // sRGB -> linear（2D レイヤーは sRGB で描かれている）
  c = pow(c, vec3(2.2));
  outColor = vec4(c, 0.0);
}
`;

export const FS_THRESHOLD = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float k = max(0.0, l - uThreshold) / max(l, 1e-4);
  outColor = vec4(c.rgb * k, c.a * k);
}
`;

export const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  vec4 s = texture(uTex, vUv) * 0.227027;
  s += (texture(uTex, vUv + uDir * 1.3846) + texture(uTex, vUv - uDir * 1.3846)) * 0.316216;
  s += (texture(uTex, vUv + uDir * 3.2308) + texture(uTex, vUv - uDir * 3.2308)) * 0.070270;
  outColor = s;
}
`;

// トーンマップ + ブルーム合成 + わずかな粒状。プリマルチプライドで出力する。
export const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uBloom;
uniform float uBloomAmt;
uniform float uExposure;
uniform float uGrain;
uniform float uTime;
out vec4 outColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 s = texture(uTex, vUv);
  vec4 b = texture(uBloom, vUv);
  vec3 c = s.rgb + b.rgb * uBloomAmt;
  float a = clamp(s.a + b.a * uBloomAmt * 0.85, 0.0, 1.0);
  c = aces(c * uExposure);
  // linear -> sRGB
  c = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
  c += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
  outColor = vec4(clamp(c, 0.0, 1.0) * a, a);
}
`;

// カラメルの厚み場を焼くパス
export const FS_FIELD = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uFlow;
out vec4 outColor;

const int NDRIP = 7;

float angD(float a, float b) { return abs(fract(a - b + 0.5) - 0.5); }

void main() {
  float u = vUv.x;
  float v = vUv.y;

  // 頂上のたまり（ふちに向かってわずかに薄い）
  float th = smoothstep(0.958, 0.990, v) * 0.94;
  // 上部を覆う薄い膜
  th = max(th, smoothstep(0.87, 0.975, v) * 0.24);

  vec4 drips[NDRIP];
  drips[0] = vec4(0.10, 0.00, 0.72, 0.019);
  drips[1] = vec4(0.33, 0.05, 0.86, 0.022);
  drips[2] = vec4(0.55, 0.14, 0.58, 0.016);
  drips[3] = vec4(0.72, 0.22, 0.44, 0.014);
  drips[4] = vec4(0.87, 0.30, 0.50, 0.015);
  drips[5] = vec4(0.02, 0.40, 0.34, 0.013);
  drips[6] = vec4(0.46, 0.48, 0.26, 0.012);

  for (int i = 0; i < NDRIP; i++) {
    vec4 d = drips[i];
    float g = clamp((uFlow - d.y) / max(1e-3, 1.0 - d.y), 0.0, 1.0);
    g = g * g * (3.0 - 2.0 * g);
    float reach = g * d.z;
    if (reach < 1e-4) continue;
    float tEnd = 1.0 - reach;
    if (v < tEnd - 0.04) continue;
    float s = clamp((1.0 - v) / max(reach, 1e-4), 0.0, 1.0);
    float wander = sin(d.x * 57.0 + s * 4.6) * 0.008 * s;
    float w = d.w * (0.82 + 0.42 * smoothstep(0.62, 1.0, s));
    float dist = angD(u, d.x + wander);
    // 断面は半円（液体のビード）。平らな帯にすると一気に嘘くさくなる。
    float q = clamp(dist / max(w, 1e-4), 0.0, 1.0);
    float lat = sqrt(max(0.0, 1.0 - q * q));
    // 先端のしずかな膨らみ
    float tip = exp(-pow((v - tEnd) / max(w * 0.9, 1e-3), 2.0));
    float amt = lat * (0.50 + 0.34 * s) + lat * tip * 0.5;
    th = max(th, amt);
  }
  outColor = vec4(clamp(th, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

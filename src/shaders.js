// GLSL ES 3.00 シェーダ群。
// 干渉像の計算は「視線方向を光軸座標系へ移す」という一つの関数に集約してある。
// 結晶の中を覗く描画とフルスクリーン描画がまったく同じ式を使うので、
// カメラが結晶へ入っていくときに模様が途切れない。

const HEAD = `#version 300 es
precision highp float;
`;

/* ------------------------------------------------------------------ */
/* 共通：干渉像                                                        */
/* ------------------------------------------------------------------ */
const PATTERN = `
const float TAU = 6.283185307179586;

uniform float uRings;      // 同心円の密度
uniform float uRingMul;    // 内部へ入るときに同心円が増えていく
uniform float uOrderMax;   // 見える干渉次数の上限（高次はぼやけて色を失う）
uniform float uCross;      // 黒い十字の太さ
uniform float uStreakN;    // 放射模様の本数
uniform float uStreakAmt;
uniform vec3  uFreq;       // 色ごとの周期比
uniform vec3  uPhase;
uniform vec3  uTintA;      // 太く柔らかな色領域 A
uniform vec3  uTintB;      // 同 B
uniform vec3  uTintC;      // 同 C
uniform float uBandPhase;
uniform float uPolAngle;   // 偏光リングの角度（＝黒い十字の向き）
uniform float uGain;       // 全体の強さ
uniform float uSpin;
uniform float uTime;
uniform float uCenterKind; // 中心のかたち
uniform float uWarp;       // 傾けたときの歪み
uniform vec2  uWarpDir;
uniform float uPatScale;   // 図形の見かけの大きさ（小さいほど拡大）
uniform float uOpen;       // 目の開き 0..1
uniform float uBurst;      // 最後に虹の輪が広がる量

// 傾けたときに図形をゆがめる
vec2 warpP(vec2 p){
  float w = uWarp;
  vec2 d = uWarpDir;
  float proj = dot(p, d);
  p += d * proj * w * 0.40;
  p *= 1.0 + w * 0.10 * dot(p, p);
  return p;
}

// 干渉色（波長ごとに周期が違う）。位相差ゼロの中心では真っ暗になる。
vec3 spectrum(float d){
  return 0.5 - 0.5 * cos(TAU * d * uFreq + uPhase);
}

// p は光軸座標系での面内成分（中心が光軸）
vec3 conoscopic(vec2 p, out float amp){
  float r = length(p);
  float a = atan(p.y, p.x);
  float rings = uRings * uRingMul;

  // 放射模様：同心円を花びらのようにゆるく変形させる
  float wob = 1.0 + uStreakAmt * sin(uStreakN * a + uSpin * 0.5 + uTime * 0.05)
                  * (1.0 - 0.65 * smoothstep(0.45, 1.30, r));

  // 位相差：外へ向かって輪がゆっくり細かくなり、高次では頭打ちになる。
  // （実際の干渉色も高次では淡くなる。細かすぎる模様が出ないので画面も静か）
  float dr = rings * pow(r, 1.30) * wob;
  float d = dr / (1.0 + dr / uOrderMax) - uBurst;

  // 画面上で細かくなりすぎた縞と、遠くの高次の縞はやわらげる。
  // （中心から遠いところは淡くなめらかな色になり、ちらつかない）
  float fw = fwidth(d) + 1e-5;
  float far = 1.0 - 0.88 * smoothstep(0.50, 1.35, r);
  float sharp = far / (1.0 + 9.0 * fw);
  float sharpB = far / (1.0 + 2.5 * fw);

  // 明暗の輪＋波長ごとにずれた細い干渉色
  float base = 0.5 - 0.5 * cos(TAU * d) * sharpB;
  vec3 thin = mix(vec3(base), spectrum(d), 0.62 * sharp);

  // 太く柔らかな色領域（主役色をはっきり出す）
  float bp = TAU * d * 0.17 + uBandPhase;
  vec3 wv = 0.5 + 0.5 * cos(bp + vec3(0.0, 2.0944, 4.1888));
  wv = wv * wv * wv;   // 主役色をはっきり分ける
  float wA = wv.x, wB = wv.y, wC = wv.z;
  vec3 soft = (uTintA * wA + uTintB * wB + uTintC * wC) / (0.06 + wA + wB + wC);

  // 明暗の帯：暗い領域があるから虹が際立つ
  float bo = 0.5 + 0.5 * cos(bp - 1.1);
  float band = 0.22 + 0.78 * sqrt(bo);

  // 黒い十字（消光位）
  float s = sin(2.0 * (a - uPolAngle));
  float crossMask = smoothstep(0.0, uCross, s * s);

  // 中心付近の明暗（位相差ゼロの点はもともと暗い＝瞳になる）
  float iris = exp(-pow((r - (0.075 + 0.065 * uCenterKind)) / 0.021, 2.0));

  // 外側はゆっくり暗くなっていく（遠くにも淡い色は残す）
  float outer = mix(0.35, 1.0, 1.0 - smoothstep(0.30, 1.05, r));

  amp = crossMask * band * outer;

  // 明るいところはしっかり明るく、暗いところは沈める
  vec3 tv = max(thin, vec3(0.0));
  vec3 shade = tv * tv * sqrt(tv);   // ≒ thin^2.5：明暗の差を強くする
  vec3 tint = mix(vec3(1.0), soft * 1.30, 0.90);
  vec3 col = tint * shade * 2.30 * amp;
  col += uTintA * 0.85 * iris * crossMask * outer * (0.35 + 0.65 * uOpen);
  col += vec3(1.0, 0.90, 0.74) * exp(-r * r * 2600.0) * (0.10 + 0.30 * uOpen);

  return col * uGain;
}

// まぶた（フルスクリーン時だけ使う）
float eyelid(vec2 q, float open, float w, float hgt){
  float x = clamp(q.x / w, -1.0, 1.0);
  float hw = sqrt(max(0.0, 1.0 - x * x));
  float h = (0.02 + 1.06 * pow(open, 1.7)) * pow(hw, 0.62) * hgt;
  float lid = smoothstep(-0.010, 0.050, h - abs(q.y));
  return mix(lid, 1.0, smoothstep(0.92, 1.0, open));
}
`;

/* ------------------------------------------------------------------ */
/* フルスクリーン三角形                                                */
/* ------------------------------------------------------------------ */
export const VS_FULLSCREEN = HEAD + `
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* 背景（暗く美しい光学台）                                            */
/* ------------------------------------------------------------------ */
export const FS_BG = HEAD + `
in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uLight;
out vec4 frag;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(uv);

  vec3 col = mix(vec3(0.022, 0.026, 0.055), vec3(0.005, 0.006, 0.016), smoothstep(0.0, 0.95, r));

  // 台の上のやわらかな光だまり
  float pool = exp(-pow(length(uv - vec2(0.0, -0.16)) * 1.9, 2.0));
  col += vec3(0.13, 0.17, 0.28) * pool * uLight;

  // 淡い光の筋
  float beam = exp(-pow((uv.x - 0.34) * 5.5, 2.0)) * smoothstep(0.62, -0.2, uv.y);
  col += vec3(0.05, 0.07, 0.12) * beam * uLight * 0.55;

  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.006;
  frag = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* 台座と偏光リング                                                    */
/* ------------------------------------------------------------------ */
export const VS_STAGE = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in float aExtra;
uniform mat4 uProj, uView, uModel;
out float vExtra;
out vec3 vWorld;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vExtra = aExtra;
  gl_Position = uProj * uView * w;
}
`;

export const FS_DISC = HEAD + `
in float vExtra;
in vec3 vWorld;
uniform float uTime;
uniform float uLight;
out vec4 frag;
void main(){
  float r = vExtra;
  float fade = 1.0 - smoothstep(0.20, 0.95, r);
  vec3 col = mix(vec3(0.085, 0.105, 0.165), vec3(0.010, 0.012, 0.028), r);
  // 光学台のうっすらした同心円（遠くではぼかしてちらつかせない）
  float aa = 1.0 / (1.0 + 40.0 * fwidth(r));
  col += vec3(0.030, 0.045, 0.075) * (0.5 + 0.5 * sin(r * 24.0)) * fade * 0.30 * aa;
  frag = vec4(col * uLight * fade, 1.0);
}
`;

export const FS_RING = HEAD + `
in float vExtra;
in vec3 vWorld;
uniform float uRingAngle;
uniform float uCharge;
uniform float uTime;
uniform float uAlpha;
out vec4 frag;
void main(){
  float ang = vExtra * 6.283185307 + uRingAngle;

  // 目盛り（斜めから見たときにちらつかないようぼかす）
  float aa = 1.0 / (1.0 + 26.0 * fwidth(vExtra) * 28.0);
  float tick = mix(0.45, smoothstep(0.72, 1.0, abs(sin(ang * 28.0))), aa);

  // 偏光方向を示す明るい印（十字と同じ向き）
  float axis = pow(max(0.0, cos(2.0 * ang)), 26.0);

  vec3 base = vec3(0.055, 0.080, 0.135);
  vec3 col = base * (0.35 + 0.65 * tick);
  col += mix(vec3(0.20, 0.45, 0.62), vec3(0.95, 0.68, 0.32), uCharge) * axis * (0.30 + 1.1 * uCharge);
  col += vec3(0.10, 0.20, 0.34) * uCharge * 0.30;

  frag = vec4(col * uAlpha * 0.85, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* 結晶本体                                                            */
/* ------------------------------------------------------------------ */
export const VS_CRYSTAL = HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in float aExtra;
uniform mat4 uProj, uView, uModel;
uniform mat3 uNrmMat;
out vec3 vWorld;
out vec3 vNrm;
out float vH;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNrm = normalize(uNrmMat * aNrm);
  vH = aExtra;
  gl_Position = uProj * uView * w;
}
`;

export const FS_CRYSTAL = HEAD + PATTERN + `
in vec3 vWorld;
in vec3 vNrm;
in float vH;
uniform vec3 uCamPos;
uniform mat3 uAxisBasis;   // ワールド → 光軸座標系（z が光軸）
uniform float uFront;      // 1.0 = 前面パス
uniform float uFade;       // 結晶の見え方（内部へ入るとき 0 へ）
uniform float uGlass;      // ガラスらしさ
out vec4 frag;

void main(){
  vec3 dir = normalize(vWorld - uCamPos);
  vec3 N = normalize(vNrm) * (uFront > 0.5 ? 1.0 : -1.0);

  vec3 da = uAxisBasis * dir;
  vec2 p = warpP(da.xy * uPatScale);
  float amp;
  vec3 inner = conoscopic(p, amp);

  float ndv = abs(dot(N, -dir));
  float fres = pow(clamp(1.0 - ndv, 0.0, 1.0), 3.0);

  // 面の向きでうつろう、うすい虹色。回すと結晶の中の色がゆっくり変わる。
  vec3 sh = 0.5 + 0.5 * cos(TAU * (ndv * 1.35 + vH * 0.55) + vec3(0.0, 2.0944, 4.1888) + uBandPhase);
  sh = sh * sh;
  vec3 sheen = (uTintA * sh.x + uTintB * sh.y + uTintC * sh.z) / (0.25 + sh.x + sh.y + sh.z);

  vec3 col = vec3(0.0);

  if (uFront > 0.5) {
    // 前面：面のきらめきと縁の光
    vec3 L1 = normalize(vec3(-0.45, 0.8, 0.45));
    vec3 L2 = normalize(vec3(0.6, 0.25, 0.7));
    vec3 R = reflect(dir, N);
    float s1 = pow(max(dot(R, L1), 0.0), 46.0);
    float s2 = pow(max(dot(R, L2), 0.0), 22.0);

    col += vec3(0.055, 0.085, 0.145) * (0.35 + 0.65 * vH) * uGlass;
    col += vec3(0.55, 0.80, 1.00) * s1 * 0.85 * uGlass;
    col += vec3(1.00, 0.55, 0.80) * s2 * 0.30 * uGlass;
    col += vec3(0.35, 0.62, 0.95) * fres * 0.55 * uGlass;
    col += inner * 0.40;
    col += sheen * 0.10 * uGlass * (0.25 + 0.75 * uGain);
  } else {
    // 背面：結晶の中に見える干渉像
    float transmit = 0.60 + 0.40 * (1.0 - fres);
    col += inner * transmit * 1.75;
    col += sheen * transmit * 0.34 * uGlass * (0.25 + 0.75 * uGain);
    col += vec3(0.030, 0.050, 0.090) * transmit * uGlass * 0.7;
  }

  frag = vec4(col * uFade, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* フルスクリーンの虹の目                                              */
/* ------------------------------------------------------------------ */
export const FS_EYE = HEAD + PATTERN + `
in vec2 vUv;
uniform vec2 uRes;
uniform mat3 uAxisBasis;
uniform mat3 uInvViewRot;  // ビュー → ワールド
uniform float uTanHalf;    // 短辺方向の半画角 tan
uniform float uAlpha;
uniform float uLidW;
uniform float uLidH;
uniform vec3  uFwdW;
uniform float uVign;
out vec4 frag;

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  vec3 dv = normalize(vec3(uv * 2.0 * uTanHalf, -1.0));
  vec3 dir = uInvViewRot * dv;

  vec3 da = uAxisBasis * dir;
  vec2 p = warpP(da.xy * uPatScale);

  float amp;
  vec3 col = conoscopic(p, amp);

  // まぶた。目が画面の中にいるあいだは目そのものに、
  // 遠くへ行ったときは画面の中心に寄り添うので、見失うことがない。
  vec3 dc = uAxisBasis * uFwdW;
  vec2 pc = warpP(dc.xy * uPatScale);
  vec2 lidC = pc * smoothstep(0.06, 0.30, length(pc));
  float lid = eyelid((p - lidC) * 1.15, uOpen, uLidW, uLidH);

  // まぶたの縁のあたたかい光
  float edge = smoothstep(0.02, 0.55, lid) * (1.0 - smoothstep(0.55, 0.98, lid));
  col *= mix(0.10, 1.0, lid);
  col += vec3(1.0, 0.60, 0.40) * edge * 0.55 * (1.0 - smoothstep(0.88, 1.0, uOpen));

  // 完全に開いたときの放射のきらめき
  float r = length(p);
  float a = atan(p.y, p.x);
  float star = pow(max(0.0, cos(a * 6.0 + uSpin * 0.3)), 26.0) * exp(-r * 9.0);
  col += vec3(1.0, 0.92, 0.78) * star * 0.30 * smoothstep(0.93, 1.0, uOpen);

  // 画面周辺を少し落として虹を際立たせる
  float v = 1.0 - uVign * smoothstep(0.35, 1.15, length(uv));
  col *= v;

  frag = vec4(col, 1.0) * uAlpha;
}
`;

/* ------------------------------------------------------------------ */
/* ブルーム                                                            */
/* ------------------------------------------------------------------ */
export const FS_BRIGHT = HEAD + `
in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 frag;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = max(0.0, l - uThreshold) / max(l, 1e-4);
  frag = vec4(c * k, 1.0);
}
`;

export const FS_BLUR = HEAD + `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;   // テクセル単位の方向
out vec4 frag;
void main(){
  vec3 s = texture(uTex, vUv).rgb * 0.227027;
  s += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.316216;
  s += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.070270;
  frag = vec4(s, 1.0);
}
`;

/* ------------------------------------------------------------------ */
/* 合成                                                                */
/* ------------------------------------------------------------------ */
export const FS_PRESENT = HEAD + `
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uBloomAmt;
uniform float uPass;    // 結晶の表面を通り抜ける演出 0..1
uniform float uFlash;
uniform float uExposure;
out vec4 frag;

vec3 tonemap(vec3 x){
  x *= uExposure;
  return (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
}

void main(){
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r = length(c);

  // 表面を通るときのゆらぎ＋色収差
  float ripple = uPass * 0.035 * sin(r * 26.0 - uPass * 9.0);
  vec2 dir = (r > 1e-4) ? c / r : vec2(0.0);
  vec2 base = uv + dir * ripple;
  float ca = uPass * 0.005 + 0.0012;

  vec3 col;
  col.r = texture(uScene, base + dir * ca).r;
  col.g = texture(uScene, base).g;
  col.b = texture(uScene, base - dir * ca).b;

  vec3 bloom = texture(uBloom, base).rgb;
  col += bloom * uBloomAmt;
  col += vec3(1.0, 0.94, 0.86) * uFlash;

  col = tonemap(col);
  // 結晶へ入るあいだは周囲をぐっと落として、まん中へ吸い込まれる感じにする
  col *= 1.0 - (0.28 + 0.55 * uPass) * smoothstep(mix(0.45, 0.08, uPass), mix(0.95, 0.58, uPass), r);

  // わずかなディザで階調の縞を消す
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (d - 0.5) / 255.0;

  frag = vec4(col, 1.0);
}
`;

// All GLSL for the game (WebGL2 / GLSL ES 3.00).

const HEAD = `#version 300 es
precision highp float;
`;

const NOISE = `
uniform sampler2D u_noise;
float nz(vec2 p){ return texture(u_noise, p).r; }
float fbm(vec2 p){
  vec4 s = texture(u_noise, p * 0.5);
  vec4 s2 = texture(u_noise, p * 1.37 + vec2(0.31, 0.17));
  return clamp(s.r * 0.45 + s2.g * 0.28 + s.b * 0.17 + s2.a * 0.10, 0.0, 1.0);
}
`;

// Fullscreen triangle; no vertex buffer needed.
export const FS_TRI_VS = HEAD + `
out vec2 v_uv;
void main(){
  vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/* ---------------------------------------------------------------- sky --- */

export const SKY_FS = HEAD + NOISE + `
in vec2 v_uv;
uniform mat4 u_invVP;
uniform vec3 u_camPos;
uniform vec3 u_sunDir;      // from scene toward the sun
uniform vec3 u_skyTop;
uniform vec3 u_skyMid;
uniform vec3 u_skyHaze;
uniform vec3 u_sunCol;
uniform float u_time;
out vec4 frag;

void main(){
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec4 a = u_invVP * vec4(ndc, -1.0, 1.0);
  vec4 b = u_invVP * vec4(ndc,  1.0, 1.0);
  vec3 dir = normalize(b.xyz / b.w - a.xyz / a.w);

  float h = dir.y;
  vec3 col = mix(u_skyHaze, u_skyMid, smoothstep(0.0, 0.22, h));
  col = mix(col, u_skyTop, smoothstep(0.16, 0.75, h));
  // Below the horizon the air is deeper and cooler than the glowing band.
  col = mix(col, u_skyHaze * vec3(0.72, 0.74, 0.86), smoothstep(0.0, -0.22, h));

  // Warm glow banked around the sun, and a broad haze near the horizon.
  float sd = max(dot(dir, u_sunDir), 0.0);
  col += u_sunCol * pow(sd, 9.0) * 0.22;
  col += u_sunCol * pow(sd, 320.0) * 0.55;
  float disc = smoothstep(0.99955, 0.99982, sd);
  col += u_sunCol * disc * 1.5;
  col += u_skyHaze * 0.22 * pow(max(1.0 - abs(dir.y), 0.0), 8.0);

  // Soft high cloud streaks so the sky is never flat.
  float streak = fbm(vec2(dir.x * 0.55 + u_time * 0.004, dir.y * 1.8 + 0.3));
  col += vec3(0.07, 0.06, 0.09) * smoothstep(0.5, 0.95, streak) * smoothstep(0.05, 0.5, h);

  // Ordered-ish dither kills banding in the gradient.
  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (d - 0.5) * 0.006;

  frag = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------ fog floor --- */

export const FLOOR_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_vp;
uniform vec2 u_extent;   // half size in x and z
uniform vec2 u_origin;   // kept centred on the camera so it has no visible edge
out vec3 v_world;
out vec2 v_uv;
void main(){
  vec3 w = vec3(a_pos.x * u_extent.x + u_origin.x, 0.0, a_pos.y * u_extent.y + u_origin.y);
  v_world = w;
  v_uv = a_uv;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const FLOOR_FS = HEAD + NOISE + `
in vec3 v_world;
in vec2 v_uv;
uniform float u_time;
uniform float u_fog;        // 0..1 how much fog has gathered
uniform vec3 u_fogCol;
uniform vec3 u_fogLit;
uniform vec3 u_skyHaze;
uniform vec3 u_camPos;
uniform vec2 u_glory;       // world xz of the anti-solar point
uniform float u_glow;       // brightness of the backscatter patch
out vec4 frag;

void main(){
  // Three scales of drift: big swells, ripples, and a fine grain.
  vec2 p = v_world.xz;
  float n = fbm(p * 0.055 + vec2(u_time * 0.010, -u_time * 0.006));
  n = n * 0.55 + fbm(p * 0.17 - vec2(u_time * 0.018, u_time * 0.004)) * 0.32
        + fbm(p * 0.52 + vec2(0.0, u_time * 0.03)) * 0.13;

  float dist = length(v_world.xz - u_camPos.xz);
  float far = smoothstep(150.0, 30.0, dist);        // fade into the horizon
  float near = smoothstep(0.8, 5.0, dist);          // no hard edge under the camera

  // Sunlit crests, cool troughs. Thicker fog lifts the whole surface brighter.
  float lit = smoothstep(0.34, 0.78, n + u_fog * 0.10);
  vec3 col = mix(u_fogCol, u_fogLit, lit);
  col = mix(col, u_fogCol * 0.88, smoothstep(0.34, 0.05, n) * 0.6);
  col = mix(col, u_skyHaze, smoothstep(18.0, 110.0, dist) * 0.92);

  // Gentle backscatter around the anti-solar point (the real heiligenschein).
  float gd = length(v_world.xz - u_glory);
  col += u_fogLit * u_glow * exp(-gd * gd * 0.02) * 0.22;

  float a = (0.80 + 0.18 * u_fog) * far * near;
  frag = vec4(col, clamp(a, 0.0, 1.0));
}`;

/* ---------------------------------------------------------- fog cards --- */

export const CARD_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 i_data0;   // xyz = center, w = size
layout(location=3) in vec4 i_data1;   // x = rot, y = seed, z = alpha, w = warm
uniform mat4 u_vp;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform vec3 u_camPos;
out vec2 v_uv;
out float v_alpha;
out float v_seed;
out float v_warm;
out float v_dist;
void main(){
  float c = cos(i_data1.x), s = sin(i_data1.x);
  vec2 p = vec2(a_pos.x * c - a_pos.y * s, a_pos.x * s + a_pos.y * c) * i_data0.w;
  vec3 w = i_data0.xyz + u_camRight * p.x + u_camUp * p.y * 0.62;
  v_uv = a_uv;
  v_alpha = i_data1.z;
  v_seed = i_data1.y;
  v_warm = i_data1.w;
  v_dist = length(w - u_camPos);
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const CARD_FS = HEAD + NOISE + `
in vec2 v_uv;
in float v_alpha;
in float v_seed;
in float v_warm;
in float v_dist;
uniform sampler2D u_puff;
uniform float u_time;
uniform vec3 u_cloudLit;
uniform vec3 u_cloudDark;
uniform vec3 u_skyHaze;
out vec4 frag;

void main(){
  vec2 uv = v_uv;
  // Slow internal churn keeps the fog alive without any flicker.
  vec2 flow = vec2(nz(vec2(v_seed, u_time * 0.02)), nz(vec2(v_seed + 3.1, u_time * 0.017)));
  uv += (flow - 0.5) * 0.06;
  float m = texture(u_puff, uv).a;
  float n = fbm(uv * 1.6 + vec2(v_seed, u_time * 0.01));
  m *= 0.55 + 0.75 * n;
  if (m <= 0.003) discard;

  vec3 col = mix(u_cloudDark, u_cloudLit, smoothstep(0.10, 0.72, v_uv.y * 0.7 + n * 0.5));
  col = mix(col, u_skyHaze, clamp(v_dist / 170.0, 0.0, 0.7));
  col = mix(col, u_cloudLit, v_warm * 0.35);

  float fadeNear = smoothstep(0.5, 2.6, v_dist);
  float a = clamp(m * v_alpha * fadeNear * 1.4, 0.0, 1.0);
  frag = vec4(col, a);
}`;

/* ------------------------------------------------------------- shadow --- */

export const SHADOW_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_vp;
uniform vec3 u_c00; // foot-left
uniform vec3 u_c10; // foot-right
uniform vec3 u_c01; // head-left
uniform vec3 u_c11; // head-right
out vec2 v_uv;
out vec3 v_world;
void main(){
  vec3 bottom = mix(u_c00, u_c10, a_uv.x);
  vec3 top    = mix(u_c01, u_c11, a_uv.x);
  vec3 w = mix(bottom, top, a_uv.y);
  v_uv = a_uv;
  v_world = w;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const SHADOW_FS = HEAD + NOISE + `
in vec2 v_uv;
in vec3 v_world;
uniform sampler2D u_silh;
uniform float u_time;
uniform float u_clarity;   // how well the fog is holding the shadow
uniform vec3 u_shadowCol;
uniform vec3 u_camPos;
out vec4 frag;

void main(){
  // The far end of the shadow (the head) is softer than the feet.
  float lod = mix(0.2, 2.6, pow(v_uv.y, 1.3));
  float a = textureLod(u_silh, vec2(v_uv.x, v_uv.y), lod).a;
  if (a <= 0.002) discard;

  // The fog eats into the silhouette in patches.
  vec2 np = v_world.xz * 0.16 + v_world.y * 0.1;
  float n = fbm(np + vec2(u_time * 0.015, -u_time * 0.01));
  a *= mix(0.74, 1.20, n);

  float dist = length(v_world - u_camPos);
  a *= smoothstep(70.0, 26.0, dist);

  a *= u_clarity;
  frag = vec4(u_shadowCol, clamp(a, 0.0, 0.95));
}`;

/* ---------------------------------------------------------- character --- */

export const CHAR_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_vp;
uniform vec3 u_center;    // feet position
uniform vec3 u_camRight;
uniform vec2 u_size;      // width, height in world units
out vec2 v_uv;
void main(){
  vec3 w = u_center + u_camRight * (a_pos.x * u_size.x * 0.5) + vec3(0.0, a_uv.y * u_size.y, 0.0);
  v_uv = a_uv;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const CHAR_FS = HEAD + `
in vec2 v_uv;
uniform sampler2D u_atlas;
uniform float u_tileA;    // 0,1,2 -> front, side, back
uniform float u_tileB;
uniform float u_mix;
uniform vec3 u_rim;
uniform float u_rimAmt;
out vec4 frag;

vec4 sampleTile(float t){
  vec2 uv = vec2((v_uv.x + t) / 3.0, v_uv.y);
  return texture(u_atlas, uv);
}


void main(){
  vec4 a = sampleTile(u_tileA);
  vec4 b = sampleTile(u_tileB);
  vec4 c = mix(a, b, u_mix);
  if (c.a <= 0.004) discard;
  c.rgb += u_rim * u_rimAmt * (1.0 - c.a) * 1.6;   // glow spills at the edges
  frag = c;
}`;

/* ------------------------------------------------------------- terrace --- */

// A flat quad lying in the XZ plane: the rock ledge the child stands on.
export const GROUND_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_vp;
uniform vec3 u_center;
uniform vec2 u_size;
out vec2 v_uv;
out vec3 v_world;
void main(){
  vec3 w = u_center + vec3(a_pos.x * u_size.x, 0.0, a_pos.y * u_size.y);
  v_uv = a_uv;
  v_world = w;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const GROUND_FS = HEAD + NOISE + `
in vec2 v_uv;
in vec3 v_world;
uniform sampler2D u_tex;
uniform vec3 u_tint;
uniform vec3 u_rim;
uniform float u_time;
out vec4 frag;
void main(){
  vec4 t = texture(u_tex, v_uv);
  if (t.a <= 0.004) discard;
  float n = fbm(v_world.xz * 0.45);
  vec3 col = t.rgb * u_tint * (0.82 + 0.36 * n);
  // v = 0 is the far edge, and the sun is out that way: it catches a warm line.
  col += u_rim * smoothstep(0.30, 0.02, v_uv.y) * 0.85 * t.a;
  // Edges dissolve into the cloud rather than ending in a cut.
  float edge = smoothstep(0.0, 0.16, v_uv.y) * smoothstep(1.0, 0.62, v_uv.y)
             * smoothstep(0.0, 0.18, v_uv.x) * smoothstep(1.0, 0.82, v_uv.x);
  edge *= 0.65 + 0.5 * n;
  frag = vec4(col, t.a * clamp(edge, 0.0, 1.0));
}`;

/* -------------------------------------------------------------- glory --- */

export const GLORY_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
uniform mat4 u_vp;
uniform vec3 u_center;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform float u_size;
out vec2 v_p;
void main(){
  vec3 w = u_center + u_camRight * (a_pos.x * u_size) + u_camUp * (a_pos.y * u_size);
  v_p = a_pos;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const GLORY_FS = HEAD + NOISE + `
in vec2 v_p;
uniform float u_time;
uniform float u_glow;     // overall strength 0..1
uniform float u_sat;      // 0 = pale white halo, 1 = full ring colours
uniform float u_rings;    // continuous ring count, 0..4
uniform float u_thick;    // per-run band thickness
uniform float u_seed;
uniform float u_r0;       // radius of the innermost ring
uniform float u_gap;      // spacing between rings
out vec4 frag;

// Hero palette: violet -> sky blue -> white -> gold -> pale pink.
vec3 spectrum(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 violet = vec3(0.56, 0.44, 1.00);
  vec3 sky    = vec3(0.42, 0.84, 1.00);
  vec3 white  = vec3(1.00, 0.99, 0.95);
  vec3 gold   = vec3(1.00, 0.82, 0.44);
  vec3 pink   = vec3(1.00, 0.56, 0.74);
  vec3 c = mix(violet, sky, smoothstep(0.02, 0.30, t));
  c = mix(c, white, smoothstep(0.32, 0.48, t));
  c = mix(c, gold,  smoothstep(0.50, 0.70, t));
  c = mix(c, pink,  smoothstep(0.72, 0.98, t));
  return c;
}

void main(){
  float r = length(v_p);
  if (r > 1.0) discard;
  float ang = atan(v_p.y, v_p.x);

  // A slow breath, never a blink.
  float breath = 1.0 + 0.020 * sin(u_time * 0.55 + u_seed) + 0.009 * sin(u_time * 0.31 + 2.1);
  r /= breath;

  // Break the perfect circle a little so it feels like light in vapour.
  float wob = fbm(vec2(ang * 0.55 + u_seed, u_time * 0.02)) - 0.5;
  r *= 1.0 + wob * 0.055;

  vec3 col = vec3(0.0);

  // Central aureole: brightest at the middle, as a real glory is, but kept
  // tight so it never swallows the rings around it.
  float aur = exp(-r * r * 17.0);
  col += mix(vec3(1.0), vec3(1.0, 0.93, 0.95), 0.6) * aur * (0.05 + 0.20 * u_glow);

  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float gate = clamp(u_rings - fi, 0.0, 1.0);
    if (gate <= 0.001) continue;
    float R = u_r0 + fi * u_gap;
    float w = u_thick * (0.085 + fi * 0.018);
    float d = (r - R) / w;
    float band = exp(-d * d * 1.5);
    float pos = clamp(d * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = spectrum(pos);
    col += c * band * gate * (0.80 - fi * 0.13);
  }

  // Toward the pale end early on: desaturate instead of fading out.
  float luma = dot(col, vec3(0.32, 0.52, 0.16));
  col = mix(vec3(luma) * 1.06, col, clamp(u_sat, 0.0, 1.0));

  // Brighter toward the centre, patchy where the fog is thin.
  col *= 1.0 + 0.30 * exp(-r * 2.6);
  float haze = 0.66 + 0.46 * fbm(v_p * 0.9 + vec2(u_seed, u_time * 0.015));
  col *= haze;

  col *= smoothstep(1.0, 0.72, r);
  col *= u_glow;
  col = max(col, vec3(0.0));

  // Premultiplied "over": strong parts of a band take over the pixel so the
  // colour survives against bright fog, faint parts only add a little light.
  float a = clamp(max(max(col.r, col.g), col.b) * 0.85, 0.0, 0.90);
  frag = vec4(col, a);
}`;

/* ------------------------------------------------------------ sparkle --- */

export const SPARK_VS = HEAD + `
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 i_data;  // xyz = pos, w = size
layout(location=3) in vec4 i_col;   // rgb, a
uniform mat4 u_vp;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
out vec2 v_uv;
out vec4 v_col;
void main(){
  vec3 w = i_data.xyz + u_camRight * (a_pos.x * i_data.w) + u_camUp * (a_pos.y * i_data.w);
  v_uv = a_uv;
  v_col = i_col;
  gl_Position = u_vp * vec4(w, 1.0);
}`;

export const SPARK_FS = HEAD + `
in vec2 v_uv;
in vec4 v_col;
uniform sampler2D u_spark;
out vec4 frag;
void main(){
  float m = texture(u_spark, v_uv).a;
  frag = vec4(v_col.rgb * m * v_col.a, 1.0);
}`;

/* ----------------------------------------------------------------- post --- */

export const BRIGHT_FS = HEAD + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform float u_threshold;
out vec4 frag;
void main(){
  vec3 c = texture(u_src, v_uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float k = max(l - u_threshold, 0.0) / max(l, 0.0001);
  frag = vec4(c * k, 1.0);
}`;

export const BLUR_FS = HEAD + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_dir;      // texel-sized step
out vec4 frag;
void main(){
  vec3 c = texture(u_src, v_uv).rgb * 0.2270270270;
  c += texture(u_src, v_uv + u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_src, v_uv - u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_src, v_uv + u_dir * 3.2307692308).rgb * 0.0702702703;
  c += texture(u_src, v_uv - u_dir * 3.2307692308).rgb * 0.0702702703;
  frag = vec4(c, 1.0);
}`;

export const COMPOSITE_FS = HEAD + `
in vec2 v_uv;
uniform sampler2D u_src;
uniform sampler2D u_bloom;
uniform float u_bloomAmt;
uniform float u_vignette;
uniform float u_fade;      // screen fade for transitions
uniform float u_time;
out vec4 frag;

void main(){
  vec3 c = texture(u_src, v_uv).rgb;
  vec3 b = texture(u_bloom, v_uv).rgb;
  c += b * u_bloomAmt;

  // Soft shoulder so highlights bloom into pastel instead of clipping.
  c = c / (1.0 + c * 0.26);
  c = pow(c, vec3(0.95));
  // Give the pastels back a little life after the shoulder.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.16);

  vec2 d = v_uv - 0.5;
  float vig = 1.0 - u_vignette * dot(d, d) * 1.5;
  c *= vig;

  float g = fract(sin(dot(gl_FragCoord.xy + u_time, vec2(12.9898, 78.233))) * 43758.5453);
  c += (g - 0.5) * 0.008;

  c *= u_fade;
  frag = vec4(c, 1.0);
}`;

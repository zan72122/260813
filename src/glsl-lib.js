// Shared GLSL snippets.
//
// Every simulation buffer holds two signed values per texel (height/prev,
// flow x/y, slope x/y). On normal hardware that is an RG16F texture. On the
// rare WebGL2 device without renderable float textures we fall back to RGBA8
// with two 16-bit fixed-point values packed by hand, which also means manual
// bilinear filtering — hence the shared accessor pair below.

export const RG_LIB = `
#ifdef PACKED
vec2 pack16(float v) {
  float t = clamp(v * 0.5 + 0.5, 0.0, 1.0) * 65535.0;
  float hi = floor(t / 256.0);
  float lo = floor(t - hi * 256.0);
  return vec2(hi / 255.0, lo / 255.0);
}
float unpack16(vec2 p) {
  return ((p.x * 255.0 * 256.0 + p.y * 255.0) / 65535.0) * 2.0 - 1.0;
}
vec4 rgStore(vec2 v) {
  return vec4(pack16(v.x), pack16(v.y));
}
vec2 rgFetch(sampler2D tex, vec2 uv) {
  vec4 c = texture(tex, uv);
  return vec2(unpack16(c.xy), unpack16(c.zw));
}
vec2 rgLoad(sampler2D tex, vec2 uv, vec2 res) {
  vec2 p = uv * res - 0.5;
  vec2 f = fract(p);
  vec2 b = (floor(p) + 0.5) / res;
  vec2 t = 1.0 / res;
  vec2 s00 = rgFetch(tex, b);
  vec2 s10 = rgFetch(tex, b + vec2(t.x, 0.0));
  vec2 s01 = rgFetch(tex, b + vec2(0.0, t.y));
  vec2 s11 = rgFetch(tex, b + t);
  return mix(mix(s00, s10, f.x), mix(s01, s11, f.x), f.y);
}
#else
vec4 rgStore(vec2 v) { return vec4(v, 0.0, 1.0); }
vec2 rgFetch(sampler2D tex, vec2 uv) { return texture(tex, uv).xy; }
vec2 rgLoad(sampler2D tex, vec2 uv, vec2 res) { return texture(tex, uv).xy; }
#endif
`;

// Cheap value noise / hash utilities used by the floor, bubbles and sparkle.
export const NOISE_LIB = `
float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash22(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1, 0));
  float c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`;

/**
 * Rounded-rectangle pool footprint. Everything is in world units, including the
 * returned distance and the corner radius, so a long shallow pool keeps proper
 * quarter-circle corners instead of being rounded into a lozenge.
 */
export const POOL_LIB = `
float poolSdf(vec2 p, vec2 half_, float radius) {
  float r = min(radius, min(half_.x, half_.y) * 0.7);
  vec2 q = abs(p) - (half_ - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
`;

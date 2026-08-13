/**
 * The card is drawn as a single quad rotated in 3D. The fragment shader fakes a
 * security hologram: an angle-dependent diffraction rainbow, a directional
 * highlight that sweeps across the foil, micro-glints, and a hidden emblem that
 * parallaxes and flips between bright and dark as the card turns.
 *
 * None of this is real holography - it just has to feel like the sticker on a
 * passport when a 4-year-old tips it toward the light.
 */

export const CARD_VERT = `#version 300 es
precision highp float;

in vec2 aPos;                 // unit quad, -1..1

uniform vec2  uHalfSize;      // card half-extent, css px
uniform vec2  uCenter;        // card centre in css px, y down
uniform vec2  uViewport;      // css px
uniform vec2  uTilt;          // -1..1
uniform float uFocal;
uniform float uDist;
uniform float uSpin;          // extra yaw for the finish flourish

out vec2 vUv;
out vec3 vTan;                // view direction in the card's tangent frame

mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }

void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);

  float yaw   = uTilt.x * 0.66 + uSpin;
  float pitch = uTilt.y * 0.52;
  float roll  = uTilt.x * 0.06;

  mat3 R = rotY(yaw) * rotX(pitch) * rotZ(roll);
  vec3 T = R * vec3(1.0, 0.0, 0.0);
  vec3 B = R * vec3(0.0, 1.0, 0.0);
  vec3 N = R * vec3(0.0, 0.0, 1.0);

  vec3 local = R * vec3(aPos * uHalfSize, 0.0);
  vec2 originOffset = vec2(uCenter.x - uViewport.x * 0.5, uViewport.y * 0.5 - uCenter.y);
  vec3 world = vec3(local.xy + originOffset, local.z - uDist);

  vec3 V = normalize(-world);
  vTan = vec3(dot(V, T), dot(V, B), dot(V, N));

  vec2 proj = world.xy * (uFocal / -world.z);
  gl_Position = vec4(proj / (uViewport * 0.5), 0.0, 1.0);
}
`;

export const CARD_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vTan;
out vec4 outColor;

uniform sampler2D uBase;      // card artwork, alpha = rounded corners
uniform sampler2D uRelief;    // R = emboss height, G = decorative shape mask
uniform sampler2D uFoil;      // R = foil coverage painted by the roller
uniform sampler2D uHidden;    // R = secret picture mask

uniform float uEmboss;        // 0..1, how deeply the micro-pattern is pressed
uniform float uTime;
uniform int   uPattern;       // 0 burst, 1 rings, 2 diagonal
uniform float uQuality;       // 1 = full, 0 = reduced (E2E / low power)
uniform float uReveal;        // 0..1 extra shine on the finished card

const float TAU = 6.28318530718;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Spatial phase of the ruling plus the in-plane grating vector.
// The phase must advance by a whole number of cycles around any seam,
// otherwise a hard colour break shows up.
void grating(vec2 uv, out float phase, out vec2 dir) {
  vec2 d = uv - 0.5;
  d.x *= 0.7;                       // card is taller than wide - keep rings round
  float r = length(d);
  float a = atan(d.y, d.x);

  // Chunky rulings on purpose: bold bands read as "rainbow" to a small child,
  // where a fine grating just shimmers into grey.
  if (uPattern == 0) {
    phase = a * (16.0 / TAU) + r * 6.0;
    dir = normalize(vec2(-d.y, d.x) + 1e-5);
  } else if (uPattern == 1) {
    phase = r * 30.0;
    dir = normalize(d + 1e-5);
  } else {
    vec2 g = normalize(vec2(0.62, 0.78));
    phase = dot(uv, g) * 22.0;
    dir = g;
  }
}

void main() {
  vec4 base = texture(uBase, vUv);
  if (base.a < 0.02) discard;

  // How obliquely we are looking at this point of the card. Everything
  // angle-dependent is driven by this one vector.
  vec2 ev = vTan.xy / max(vTan.z, 0.28);

  // Keep a printed margin free of foil, the way a real hologram patch sits
  // inside the card's border rather than running off the edge.
  vec2 marg = min(vUv, 1.0 - vUv);
  float patchMask = smoothstep(0.03, 0.075, min(marg.x, marg.y));
  float foil = texture(uFoil, vUv).r * patchMask;

  vec4 rel = texture(uRelief, vUv);
  float shape = rel.g;

  // ---- pressed micro-relief -------------------------------------------
  vec2 texel = 1.0 / vec2(textureSize(uRelief, 0));
  float hx = texture(uRelief, vUv + vec2(texel.x, 0.0)).r
           - texture(uRelief, vUv - vec2(texel.x, 0.0)).r;
  float hy = texture(uRelief, vUv + vec2(0.0, texel.y)).r
           - texture(uRelief, vUv - vec2(0.0, texel.y)).r;

  // The press only touches the patch, so the printed border stays crisp.
  float relief = uEmboss * (0.55 + 0.45 * shape) * patchMask;
  vec3 nrm = normalize(vec3(-hx * 11.0 * relief, hy * 11.0 * relief, 1.0));
  vec3 L = normalize(vec3(0.34 - ev.x * 0.8, 0.52 - ev.y * 0.8, 0.95));
  float diff = max(dot(nrm, L), 0.0);
  float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 26.0);

  vec3 col = base.rgb * (0.84 + 0.3 * diff) + vec3(spec) * 0.4 * relief;

  // ---- diffraction rainbow --------------------------------------------
  float phase;
  vec2 gdir;
  grating(vUv, phase, gdir);

  float order = phase + dot(ev, gdir) * 5.5;

  // Once the ruling gets finer than a pixel the fringes alias into muddy moire.
  // Fading them toward neutral silver is both stable and physically right:
  // a grating you cannot resolve just reflects white light.
  float aa = clamp(1.0 - fwidth(order) * 1.15, 0.0, 1.0);

  // Each channel stands in for a wavelength, and they diffract at slightly
  // different rates. That drift is what smears white light into a spectrum -
  // tinting one shared band envelope only ever yields two alternating hues.
  vec3 orders = order * vec3(1.0, 1.13, 1.28) + uTime * 0.01;
  vec3 fringes = pow(0.5 + 0.5 * cos(TAU * orders), vec3(1.55));
  fringes = mix(vec3(0.42), fringes, aa);
  float bandLum = dot(fringes, vec3(0.3333));

  // Broad highlight bar that physically travels across the card on tilt.
  vec2 sd = normalize(vec2(0.3, 0.95));
  float sweepPos = dot(vUv - 0.5, sd) * 2.4 + dot(ev, sd) * 2.3;
  float sweep = exp(-sweepPos * sweepPos * 2.8);

  // Individual foil facets catching the light. Each cell holds one round
  // sparkle at a random spot - flashing whole cells reads as blocky noise.
  float glint = 0.0;
  if (uQuality > 0.5) {
    vec2 gscale = vec2(24.0, 34.0);   // ~square cells given the card's aspect
    vec2 gp = vUv * gscale;
    vec2 cell = floor(gp);
    vec2 f = fract(gp);
    float h1 = hash21(cell);
    vec2 pt = vec2(hash21(cell + 1.7), hash21(cell + 9.1));
    float dot0 = smoothstep(0.32, 0.02, length(f - pt));
    vec2 gd = normalize(vec2(hash21(cell + 3.1) - 0.5, hash21(cell + 7.7) - 0.5) + 1e-4);
    float sp = dot(ev, gd) * 5.0 + h1 * TAU + uTime * 0.4;
    glint = dot0 * pow(max(cos(sp), 0.0), 40.0);
  }

  // ---- hidden picture --------------------------------------------------
  // Parallax shift plus a tilt window: bright on one side, dark on the other.
  vec2 hidUv = clamp(vUv + ev * 0.05, 0.0, 1.0);
  float hid = texture(uHidden, hidUv).r;
  vec2 hidDir = normalize(vec2(0.7, 0.72));
  float hidMix = smoothstep(0.08, 0.5, dot(ev, hidDir))
               - smoothstep(0.08, 0.5, dot(-ev, hidDir)) * 0.9;

  // ---- composite -------------------------------------------------------
  float lit = 0.5 + 0.5 * smoothstep(0.0, 0.8, length(ev));

  // Near-black gaps between the fringes are what make this read as a ruled
  // grating rather than a pastel wash.
  vec3 holo = (0.05 + 0.95 * fringes) * (0.72 + 0.28 * shape) * (0.55 + 0.55 * lit);
  holo += vec3(1.0, 0.98, 0.92) * sweep * 0.3;
  holo += vec3(1.0) * glint * 0.9;

  vec3 foilSilver = mix(vec3(0.15, 0.16, 0.21), vec3(0.42, 0.44, 0.53), sweep);

  // The foil is a holographic overlay, not opaque metal: the chosen mascot has
  // to stay recognisable underneath, or the child loses the card they picked.
  // Letting it show through the dark gaps keeps the fringes saturated, and the
  // artwork peeks in and out as the bands travel.
  vec3 underArt = base.rgb * 0.75 * (1.0 - 0.8 * bandLum);
  vec3 foilCol = underArt + foilSilver * 0.5 + holo;
  foilCol += fringes.zyx * hid * hidMix * 0.8;
  foilCol *= 1.0 + 0.18 * uReveal;

  // Filmic roll-off. Additive shine stacks well past 1.0 wherever a band peak
  // meets the sweep; hard clipping turns those areas into flat white blobs.
  foilCol = 1.0 - exp(-foilCol * 1.3);

  float amt = foil * mix(0.3, 1.0, uEmboss);
  col = mix(col, foilCol, amt);

  // ---- laminate gloss + edge -------------------------------------------
  vec2 gd2 = normalize(vec2(-0.4, 0.9));
  float glossPos = dot(vUv - 0.5, gd2) * 3.0 + dot(ev, gd2) * 2.6;
  col += vec3(1.0) * exp(-glossPos * glossPos * 2.0) * 0.08;

  vec2 q = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.9, 1.0, max(q.x, q.y));
  col += vec3(1.0) * edge * 0.12 * (0.4 + 0.6 * sweep);

  outColor = vec4(clamp(col, 0.0, 1.0), base.a);
}
`;

export const SPRITE_VERT = `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform vec2 uViewport;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  vec2 px = uCenter + aPos * uHalfSize * vec2(1.0, -1.0);
  vec2 ndc = (px / uViewport) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
`;

export const SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec4 uTint;
void main() {
  vec4 t = texture(uTex, vUv);
  outColor = t * uTint;
}
`;

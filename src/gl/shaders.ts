import { PITCH_MAX, PITCH_MIN } from '../core/field';

/**
 * The card is drawn as a single quad rotated in 3D. The fragment shader fakes a
 * security hologram: an angle-dependent diffraction rainbow whose grooves run
 * whichever way the child rolled them, a directional highlight that sweeps
 * across the foil, micro-glints, a four-frame kinegram that plays as the card
 * turns, and a UV lamp mode that reveals invisible ink.
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
uniform sampler2D uField;     // RG = director (cos2t, sin2t), B = ruling pitch
uniform sampler2D uKine;      // 2x2 atlas of the secret picture's four frames

uniform float uEmboss;        // 0..1, how deeply the micro-pattern is pressed
uniform float uTime;
uniform float uQuality;       // 1 = full, 0 = reduced (E2E / low power)
uniform float uReveal;        // 0..1 extra shine on the finished card
uniform float uUvMode;        // 0..1 blend into the UV lamp view
uniform vec3  uLight;         // uv.xy of the lamp, z = radius

const float TAU = 6.28318530718;
const float PITCH_MIN = ${PITCH_MIN.toFixed(1)};
const float PITCH_MAX = ${PITCH_MAX.toFixed(1)};

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
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

  // ---- the ruling the child rolled ------------------------------------
  // The field stores the groove direction as a doubled angle, because a groove
  // is an axis and not an arrow. The blended length is the local coherence:
  // strokes that agree give a crisp grating, crossed strokes give silver.
  vec3 fld = texture(uField, vUv).rgb;
  vec2 dbl = fld.rg * 2.0 - 1.0;
  float coh = clamp(length(dbl), 0.0, 1.0);
  vec2 axis = dbl / max(length(dbl), 1e-3);
  float theta = 0.5 * atan(axis.y, axis.x);
  vec2 gdir = vec2(cos(theta), sin(theta));
  float pitch = mix(PITCH_MIN, PITCH_MAX, fld.b);

  // Recovering the axis leaves gdir's sign arbitrary, so 'order' may flip sign
  // from pixel to pixel. That is harmless as long as it is only ever consumed
  // by cosines, which are even - so never put it in an odd function, and
  // never add a phase offset to it.
  float order = dot(vUv - 0.5, gdir) * pitch + dot(ev, gdir) * 5.5;

  // Bands-per-pixel, estimated from the ruling rather than from fwidth(order):
  // order jumps across the curve where the axis flips sign, and fwidth would
  // read that as infinite frequency and paint a false seam along it.
  float pxUv = max(fwidth(vUv.x), fwidth(vUv.y));
  float aa = clamp(1.0 - pitch * pxUv * 2.4, 0.0, 1.0) * smoothstep(0.05, 0.32, coh);

  // Each channel stands in for a wavelength, and they diffract at slightly
  // different rates. That drift is what smears white light into a spectrum -
  // tinting one shared band envelope only ever yields two alternating hues.
  vec3 fringes = pow(0.5 + 0.5 * cos(TAU * order * vec3(1.0, 1.13, 1.28)), vec3(1.55));
  fringes = mix(vec3(0.42), fringes, aa);
  float bandLum = dot(fringes, vec3(0.3333));

  // Broad highlight bar that physically travels across the card on tilt.
  vec2 sd = normalize(vec2(0.3, 0.95));
  float sweepPos = dot(vUv - 0.5, sd) * 2.4 + dot(ev, sd) * 2.3;
  float sweep = exp(-sweepPos * sweepPos * 2.8);

  // Individual foil facets catching the light. Each cell holds one round
  // sparkle at a random spot - flashing whole cells reads as blocky noise.
  // Incoherent, scribbled areas sparkle harder, which is what makes a scribble
  // read as glitter rather than as a mistake.
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
    glint = dot0 * pow(max(cos(sp), 0.0), 40.0) * (0.55 + 0.9 * (1.0 - coh));
  }

  // ---- kinegram --------------------------------------------------------
  // Tilting left to right steps the frames; tilting up and down swings the
  // picture between glowing and sunk-dark, the way a real switch effect does.
  float fsel = clamp(ev.x * 0.8 + 0.5, 0.0, 0.9999);
  float fi = floor(fsel * 4.0);
  vec2 quad = vec2(mod(fi, 2.0), floor(fi * 0.5));
  vec2 kuv = clamp(vUv + ev * 0.05, 0.004, 0.996);
  float hid = texture(uKine, (quad + kuv) * 0.5).r;

  float appear = smoothstep(0.04, 0.38, length(ev));
  float pol = clamp(ev.y * 2.4, -1.0, 1.0);
  float hidMix = appear * (0.35 + 0.65 * max(pol, 0.0) - 1.2 * max(-pol, 0.0));

  // ---- composite -------------------------------------------------------
  float lit = 0.5 + 0.5 * smoothstep(0.0, 0.8, length(ev));

  vec3 holo = (0.04 + 1.05 * fringes) * (0.72 + 0.28 * shape) * (0.55 + 0.55 * lit);
  holo += vec3(1.0, 0.98, 0.92) * sweep * 0.3;
  holo += vec3(1.0) * glint * 0.9;

  vec3 foilSilver = mix(vec3(0.15, 0.16, 0.21), vec3(0.42, 0.44, 0.53), sweep);

  // The foil is a holographic overlay, not opaque metal: the chosen mascot has
  // to stay recognisable underneath, or the child loses the card they picked.
  // Letting it show through the dark gaps keeps the fringes saturated, and the
  // artwork peeks in and out as the bands travel.
  vec3 underArt = base.rgb * 0.62 * (1.0 - 0.85 * bandLum);
  vec3 foilCol = underArt + foilSilver * 0.5 + holo;
  foilCol += fringes.zyx * hid * hidMix * 0.9;
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

  // ---- secret lamp ------------------------------------------------------
  // Security documents carry ink that only shows under UV. Here the ink is the
  // child's own rolled path, so their handiwork comes back a second way.
  if (uUvMode > 0.001) {
    vec2 dl = (vUv - uLight.xy) * vec2(0.7, 1.0);
    float lamp = smoothstep(uLight.z, uLight.z * 0.18, length(dl));
    float ink = smoothstep(0.12, 0.55, texture(uFoil, vUv).r) * 0.8
              + shape * 0.7
              + hid * 0.45;
    ink *= patchMask;
    vec3 glow = mix(vec3(0.3, 0.62, 1.0), vec3(0.85, 0.45, 1.0), clamp(ink, 0.0, 1.0));
    vec3 uvCol = base.rgb * 0.07
               + glow * clamp(ink, 0.0, 1.4) * lamp * 1.35
               + vec3(0.06, 0.08, 0.2) * lamp * 0.6;
    col = mix(col, uvCol, uUvMode);
  }

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

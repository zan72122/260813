// Small math / easing / color helpers. No dependencies.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));

export const smooth = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeIn = (t) => Math.pow(clamp01(t), 3);
export const easeInOut = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  t = clamp01(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeElastic = (t) => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
};

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

/** Frame-rate independent exponential approach. */
export const damp = (cur, target, lambda, dt) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt));

/** Deterministic PRNG (mulberry32) so every playthrough looks the same. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rr = (rng, a, b) => a + (b - a) * rng();

/** Cheap smooth pseudo-noise, good enough for wobble. */
export function wobble(t, seed = 0) {
  return (
    Math.sin(t * 1.0 + seed * 1.7) * 0.6 +
    Math.sin(t * 2.3 + seed * 4.1) * 0.3 +
    Math.sin(t * 4.7 + seed * 2.9) * 0.1
  );
}

// --- colour -----------------------------------------------------------

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  t = clamp01(t);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp01(alpha)})`;
}

/** Rounded rectangle path (Safari lacks ctx.roundRect on older versions). */
export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

/** Draw a smooth curve through a flat [x0,y0,x1,y1,...] point list. */
export function strokeThrough(ctx, pts, from = 0, to = pts.length / 2) {
  const n = to - from;
  if (n < 2) return;
  if (ctx.beginPath) ctx.beginPath(); // Path2D has no beginPath

  ctx.moveTo(pts[from * 2], pts[from * 2 + 1]);
  for (let i = from; i < to - 2; i++) {
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
    const x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.quadraticCurveTo(
    pts[(to - 2) * 2], pts[(to - 2) * 2 + 1],
    pts[(to - 1) * 2], pts[(to - 1) * 2 + 1]
  );
}

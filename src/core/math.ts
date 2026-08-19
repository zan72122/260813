/** Small math helpers shared across the game. */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : clamp01((v - a) / (b - a)));
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
/** Very soft S-curve, nicer than smoothstep for long camera moves. */
export const smootherstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t: number) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
export const easeOutBounceSoft = (t: number) => {
  // gentle single bounce - used for the bulb dropping into the hole
  if (t < 0.72) { const u = t / 0.72; return u * u; }
  const u = (t - 0.72) / 0.28;
  return 1 - 0.12 * Math.sin(u * Math.PI) * (1 - u);
};

/** Frame-rate independent exponential damping. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/** Deterministic PRNG (mulberry32) so replays with the same seed look identical. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap smooth 2D value noise, deterministic, good enough for colour bands. */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => {
    let n = a * 374761393 + b * 668265263 + seed * 1442695040888963407;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const n00 = h(xi, yi), n10 = h(xi + 1, yi), n01 = h(xi, yi + 1), n11 = h(xi + 1, yi + 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
}

export function fbm2(x: number, y: number, octaves = 3, seed = 0): number {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += a * valueNoise2(x * f, y * f, seed + i * 17);
    norm += a; a *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

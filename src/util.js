// Shared math / random helpers. A seeded RNG keeps the scene deterministic
// (required for E2E runs and for reproducible ambient motion).

export function makeRng(seed = 12345) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Exponential smoothing factor that is stable across variable frame times.
export function damp(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export function isE2E() {
  try {
    const p = new URLSearchParams(location.search);
    return p.get('e2e') === '1' || p.get('E2E_FAST') === '1';
  } catch (_) {
    return false;
  }
}

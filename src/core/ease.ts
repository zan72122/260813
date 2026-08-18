// The easing vocabulary of the piece. Names match docs/STYLE_LOCK.json timing.easings.
export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const sineInOut: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const cubicOut: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const cubicInOut: Ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const quartOut: Ease = (t) => 1 - Math.pow(1 - t, 4);
export const backOut = (s = 1.2): Ease => (t) => {
  const c = s + 1;
  return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Damped-spring style wobble that starts at 1 and settles to 0. */
export function wobble(t: number, cycles = 3): number {
  return Math.cos(t * Math.PI * 2 * cycles) * Math.exp(-4 * t) * (1 - t);
}

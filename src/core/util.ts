export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Frame-rate independent exponential approach. `rate` ~ how much of the gap closes per second. */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  b + (a - b) * Math.exp(-rate * dt)

export const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

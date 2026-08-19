export type Vec3 = { x: number; y: number; z: number }
export type Vec2 = { x: number; y: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t)
})
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})
export const len = (a: Vec3) => Math.sqrt(dot(a, a))
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

/** smoothstep 0..1 */
export const smooth = (t: number) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
export const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
export const easeOutBack = (t: number, s = 1.7) => {
  const x = t - 1
  return 1 + (s + 1) * x * x * x + s * x * x
}
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t: number) => t * t * t
export const easeOutElastic = (t: number) => {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const p = 0.35
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (Math.PI * 2)) / p) + 1
}

/** frame-rate independent exponential approach */
export const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt))

/** deterministic small PRNG */
export class Rng {
  private s: number
  constructor(seed = 12345) { this.s = seed >>> 0 || 1 }
  next() {
    this.s ^= this.s << 13; this.s >>>= 0
    this.s ^= this.s >> 17
    this.s ^= this.s << 5; this.s >>>= 0
    return this.s / 4294967296
  }
  range(a: number, b: number) { return a + (b - a) * this.next() }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length) % arr.length] }
}

export const TAU = Math.PI * 2

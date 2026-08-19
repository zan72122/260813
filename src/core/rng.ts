/** Small deterministic PRNG (mulberry32) so terrain patterns are reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cheap value-noise on a lattice, smooth enough for gentle sand undulation. */
export class ValueNoise2D {
  private readonly perm: Uint8Array
  constructor(seed: number) {
    const rng = makeRng(seed)
    const p = new Uint8Array(512)
    const base = new Uint8Array(256)
    for (let i = 0; i < 256; i++) base[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = base[i]
      base[i] = base[j]
      base[j] = t
    }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255]
    this.perm = p
  }

  private hash(x: number, y: number): number {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255
  }

  /** Value noise in [0,1]. */
  at(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = this.hash(xi, yi)
    const b = this.hash(xi + 1, yi)
    const c = this.hash(xi, yi + 1)
    const d = this.hash(xi + 1, yi + 1)
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v
  }

  /** Two octaves is plenty for a sandbox surface. */
  fbm(x: number, y: number): number {
    return this.at(x, y) * 0.65 + this.at(x * 2.17 + 11.3, y * 2.17 - 4.7) * 0.35
  }
}

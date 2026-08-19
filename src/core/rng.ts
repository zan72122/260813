/** Small deterministic PRNG so a session can be replayed / tested. */
export class Rng {
  private s: number
  constructor(seed = 1337) {
    this.s = seed >>> 0 || 1
  }
  next(): number {
    // xorshift32
    let x = this.s
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.s = x >>> 0
    return (this.s & 0xffffff) / 0xffffff
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  sign(): number {
    return this.next() < 0.5 ? -1 : 1
  }
}

export const rng = new Rng(20260813)

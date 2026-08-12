/**
 * Deterministic seeded RNG (mulberry32). Pure function of its internal state —
 * no Math.random anywhere in game logic so replay/tests are exactly reproducible.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Normalize to a 32-bit unsigned integer seed.
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Float in [min, max). */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Picks a random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('SeededRng.pick: empty array');
    const item = arr[this.int(0, arr.length - 1)];
    if (item === undefined) throw new Error('SeededRng.pick: unreachable');
    return item;
  }

  /** Fisher-Yates shuffle, returns a new array, does not mutate input. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i]!;
      out[i] = out[j]!;
      out[j] = tmp!;
    }
    return out;
  }
}

export function createRng(seed: number): SeededRng {
  return new SeededRng(seed);
}

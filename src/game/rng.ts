/**
 * mulberry32 — the ONLY randomness source in `src/game` (MATH_CONTRACT §6).
 * A tiny, fast, seedable PRNG. Deterministic: the same seed always produces
 * the same sequence of `next()` values, which is what makes `?det=1&seed=N`
 * mode (and the replay/seed-determinism tests) possible.
 *
 * Reference algorithm: Tommy Ettinger's mulberry32, widely used for exactly
 * this "small, seedable, good-enough, no dependency" niche.
 */

/** One 32-bit step of mulberry32 given the current state word. */
function mulberry32Step(state: number): { value: number; nextState: number } {
  let a = (state + 0x6d2b79f5) | 0;
  const nextState = a;
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  const value = ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

/**
 * Seedable PRNG. `seed` is coerced to a 32-bit unsigned integer (any finite
 * number is accepted; non-integers are truncated). `next()` returns a float
 * in `[0, 1)`. `reset(seed)` rewinds the generator to a fresh sequence.
 */
export class Mulberry32 {
  private state: number;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** The seed this generator was constructed (or last reset) with, as a uint32. */
  get currentSeed(): number {
    return this.seed;
  }

  /** Next pseudo-random float in `[0, 1)`. */
  next(): number {
    const { value, nextState } = mulberry32Step(this.state);
    this.state = nextState;
    return value;
  }

  /** Next pseudo-random float in `[min, max)`. */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Rewind to a fresh sequence seeded by `seed` (defaults to the original seed). */
  reset(seed: number = this.seed): void {
    this.state = seed >>> 0;
  }
}

/** Functional convenience wrapper: `mulberry32(seed)` returns a `() => number` generator. */
export function mulberry32(seed: number): () => number {
  const rng = new Mulberry32(seed);
  return () => rng.next();
}

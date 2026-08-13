import type { Rng } from "./types";

// mulberry32: 小さく高速な32bit seeded PRNG。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字列labelをFNV-1aで32bit整数化し、forkの子seedに混ぜ込む。
function hashLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h ^= label.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class Mulberry32Rng implements Rng {
  readonly seed: number;
  private nextFn: () => number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.nextFn = mulberry32(this.seed);
  }

  next(): number {
    return this.nextFn();
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error("Rng.pick: empty array");
    }
    const idx = this.int(0, arr.length - 1);
    return arr[idx] as T;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const result = arr.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = result[i] as T;
      result[i] = result[j] as T;
      result[j] = tmp;
    }
    return result;
  }

  fork(label: string): Rng {
    const childSeed = (this.seed ^ hashLabel(label)) >>> 0;
    // 親列の位置にも依存させ、同一labelの複数forkでも独立性を持たせる。
    const mixed = (childSeed + Math.floor(this.next() * 0xffffffff)) >>> 0;
    return new Mulberry32Rng(mixed);
  }
}

export function createRng(seed: number): Rng {
  return new Mulberry32Rng(seed);
}

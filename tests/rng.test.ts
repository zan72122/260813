import { describe, expect, it } from 'vitest';
import { SeededRng, createRng } from '../src/game/rng.ts';

describe('SeededRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() stays within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) is inclusive on both ends over many draws', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(0, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  it('shuffle is a permutation and deterministic per seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7];
    const a = new SeededRng(5).shuffle(input);
    const b = new SeededRng(5).shuffle(input);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...input].sort());
  });

  it('handles seed 0 without degenerating', () => {
    const rng = createRng(0);
    const values = Array.from({ length: 5 }, () => rng.next());
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

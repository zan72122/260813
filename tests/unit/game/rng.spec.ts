import { describe, expect, it } from 'vitest';

import { Mulberry32, mulberry32 } from '../../../src/game/rng.ts';

describe('Mulberry32 — the only randomness source in src/game (MATH_CONTRACT §6)', () => {
  it('produces values in [0, 1)', () => {
    const rng = new Mulberry32(12345);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('is deterministic: the same seed always produces the same sequence', () => {
    const a = new Mulberry32(42);
    const b = new Mulberry32(42);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqB).toEqual(seqA);
  });

  it('different seeds produce different sequences', () => {
    const a = new Mulberry32(1);
    const b = new Mulberry32(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqB).not.toEqual(seqA);
  });

  it('reset(seed) rewinds to a fresh identical sequence', () => {
    const rng = new Mulberry32(7);
    const first = Array.from({ length: 10 }, () => rng.next());
    rng.reset(7);
    const second = Array.from({ length: 10 }, () => rng.next());
    expect(second).toEqual(first);
  });

  it('reset() with no argument rewinds to the ORIGINAL construction seed', () => {
    const rng = new Mulberry32(99);
    const first = Array.from({ length: 5 }, () => rng.next());
    rng.next();
    rng.next(); // advance state further
    rng.reset();
    const second = Array.from({ length: 5 }, () => rng.next());
    expect(second).toEqual(first);
  });

  it('coerces the seed to a uint32 (negative/float seeds do not throw or produce NaN)', () => {
    for (const seed of [-1, -12345, 3.7, 2 ** 40, 0]) {
      const rng = new Mulberry32(seed);
      const v = rng.next();
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('exposes the normalized uint32 seed via currentSeed', () => {
    expect(new Mulberry32(5).currentSeed).toBe(5);
    expect(new Mulberry32(-1).currentSeed).toBe(0xffffffff);
  });

  it('nextRange(min, max) stays within [min, max)', () => {
    const rng = new Mulberry32(555);
    for (let i = 0; i < 200; i++) {
      const v = rng.nextRange(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('does not degenerate to a constant sequence (basic sanity, not a statistical test)', () => {
    const rng = new Mulberry32(2024);
    const values = new Set(Array.from({ length: 100 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(90);
  });
});

describe('mulberry32() functional wrapper', () => {
  it('matches the class-based generator bit-for-bit for the same seed', () => {
    const fn = mulberry32(2026);
    const cls = new Mulberry32(2026);
    for (let i = 0; i < 20; i++) {
      expect(fn()).toBe(cls.next());
    }
  });
});

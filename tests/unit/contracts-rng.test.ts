import { describe, expect, it } from 'vitest';
import { legScenario, mulberry32 } from '../../src/contracts/rng';
import type { LegId } from '../../src/contracts/types';
import {
  INITIAL_OFFSET_MAX,
  INITIAL_OFFSET_MIN,
  SAND_UNDERSHOOT_MAX,
  SAND_UNDERSHOOT_MIN,
} from '../../src/contracts/constants';

const LEGS: LegId[] = [0, 1, 2, 3];

describe('mulberry32', () => {
  it('is deterministic: same seed produces the identical sequence', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces values within [0,1)', () => {
    const rng = mulberry32(987654321);
    for (let i = 0; i < 2000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge (not literally the same generator)', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('each call to mulberry32(seed) returns an independent generator (no shared hidden state)', () => {
    const gen1 = mulberry32(42);
    const first1 = gen1();
    const second1 = gen1();
    const gen2 = mulberry32(42);
    const first2 = gen2();
    // gen2's first draw matches gen1's first draw, not gen1's second — proves
    // there is no module-level counter bleeding between generator instances.
    expect(first2).toBe(first1);
    expect(first2).not.toBe(second1);
  });
});

describe('legScenario', () => {
  it('is a pure function: repeated calls with the same (seed,leg) deep-equal', () => {
    for (const seed of [0, 1, 42, 999999, 2 ** 31 - 1]) {
      for (const leg of LEGS) {
        const a = legScenario(seed, leg);
        const b = legScenario(seed, leg);
        expect(a).toEqual(b);
      }
    }
  });

  it('keeps every field within its documented range across many seeds/legs', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const leg of LEGS) {
        const s = legScenario(seed, leg);
        expect(s.initialOffset).toBeGreaterThanOrEqual(INITIAL_OFFSET_MIN);
        expect(s.initialOffset).toBeLessThanOrEqual(INITIAL_OFFSET_MAX);
        expect(s.sandUndershoot).toBeGreaterThanOrEqual(SAND_UNDERSHOOT_MIN);
        expect(s.sandUndershoot).toBeLessThanOrEqual(SAND_UNDERSHOOT_MAX);
        expect(s.pumpGain).toBeGreaterThanOrEqual(0.8);
        expect(s.pumpGain).toBeLessThanOrEqual(1.2);
        expect(s.cameraYaw).toBeGreaterThanOrEqual(0);
        expect(s.cameraYaw).toBeLessThan(Math.PI * 2);
        expect([0, 1, 2, 3]).toContain(s.propVariant);
        expect(s.pitchShift).toBeGreaterThanOrEqual(-1);
        expect(s.pitchShift).toBeLessThanOrEqual(1);
      }
    }
  });

  it('decorrelates legs: the 4 legs under one seed are not all identical', () => {
    let anyDifferent = 0;
    for (let seed = 0; seed < 50; seed++) {
      const offsets = LEGS.map((leg) => legScenario(seed, leg).initialOffset);
      const allSame = offsets.every((o) => o === offsets[0]);
      if (!allSame) anyDifferent++;
    }
    expect(anyDifferent).toBe(50);
  });

  it('same seed reproduces identical scenarios for all 4 legs (determinism, ARCHITECTURE_CONTRACT invariant 8)', () => {
    const seed = 20260812;
    const run1 = LEGS.map((leg) => legScenario(seed, leg));
    const run2 = LEGS.map((leg) => legScenario(seed, leg));
    expect(run1).toEqual(run2);
  });
});

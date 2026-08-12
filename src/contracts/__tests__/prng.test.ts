import { describe, expect, it } from 'vitest';
import { beamShapeFor, mulberry32 } from '../machine';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('always returns values in [0, 1)', () => {
    const rand = mulberry32(999);
    for (let i = 0; i < 200; i += 1) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('beamShapeFor', () => {
  it('is deterministic for the same seed and towerLevel', () => {
    expect(beamShapeFor(42, 0)).toBe(beamShapeFor(42, 0));
    expect(beamShapeFor(7, 3)).toBe(beamShapeFor(7, 3));
  });

  it('only ever returns a known BeamShape', () => {
    const valid = new Set(['girder', 'xpanel', 'curved']);
    for (let seed = 0; seed < 50; seed += 1) {
      for (let level = 0; level < 5; level += 1) {
        expect(valid.has(beamShapeFor(seed, level))).toBe(true);
      }
    }
  });

  it('varies across towerLevel for a fixed seed (not constant)', () => {
    const shapes = new Set<string>();
    for (let level = 0; level < 12; level += 1) {
      shapes.add(beamShapeFor(1, level));
    }
    expect(shapes.size).toBeGreaterThan(1);
  });
});

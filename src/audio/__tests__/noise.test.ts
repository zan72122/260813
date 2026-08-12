import { describe, expect, it } from 'vitest';
import { generateCrackleGate, generateWhiteNoise } from '../noise';

describe('generateWhiteNoise', () => {
  it('produces the requested length, all samples within [-1, 1]', () => {
    const noise = generateWhiteNoise(256, 7);
    expect(noise.length).toBe(256);
    for (const sample of noise) {
      expect(sample).toBeGreaterThanOrEqual(-1);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateWhiteNoise(64, 42);
    const b = generateWhiteNoise(64, 42);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('differs across seeds (not a constant buffer)', () => {
    const a = generateWhiteNoise(64, 1);
    const b = generateWhiteNoise(64, 2);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe('generateCrackleGate', () => {
  it('produces the requested length within [0, 1]', () => {
    const gate = generateCrackleGate(1000, 3);
    expect(gate.length).toBe(1000);
    for (const sample of gate) {
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = generateCrackleGate(500, 9);
    const b = generateCrackleGate(500, 9);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('is mostly quiet (sparse bursts, not constant noise)', () => {
    const gate = generateCrackleGate(5000, 5, 0.02);
    const nonZero = Array.from(gate).filter((v) => v > 0).length;
    expect(nonZero).toBeLessThan(gate.length * 0.5);
  });
});

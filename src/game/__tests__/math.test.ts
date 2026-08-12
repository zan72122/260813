import { describe, expect, it } from 'vitest';
import { HOIST_SWAY_MAX_RAD, SwayOscillator, approachGain, clamp, dist } from '../math';

describe('clamp', () => {
  it('clamps below/above the range and passes through inside it', () => {
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

describe('dist', () => {
  it('computes euclidean distance', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });
});

describe('approachGain', () => {
  it('is 1 far from the target and clamps to a 0.25 floor near it', () => {
    expect(approachGain(1000, 1000)).toBe(1);
    expect(approachGain(0, 1000)).toBe(0.25);
  });

  it('scales linearly with remaining/initial distance in between', () => {
    expect(approachGain(500, 1000)).toBeCloseTo(0.5, 5);
  });

  it('never divides by zero when initial distance is 0', () => {
    expect(approachGain(0, 0)).toBe(1);
  });
});

describe('SwayOscillator', () => {
  it('starts at zero and stays zero with no perturbing input', () => {
    const sway = new SwayOscillator();
    for (let i = 0; i < 10; i += 1) {
      expect(sway.update(1 / 60, 0)).toBe(0);
    }
  });

  it('is hard-clamped to +-6 degrees even after a very large jerk', () => {
    const sway = new SwayOscillator();
    sway.update(1 / 60, 20000); // one huge jerk saturates amplitude at the clamp
    let maxAbs = 0;
    for (let i = 0; i < 120; i += 1) {
      // Constant velocity afterwards -> no further jerks, just the decaying envelope.
      const value = sway.update(1 / 60, 20000);
      maxAbs = Math.max(maxAbs, Math.abs(value));
      expect(Math.abs(value)).toBeLessThanOrEqual(HOIST_SWAY_MAX_RAD + 1e-9);
    }
    // It should actually have been perturbed at some point, not just idle at 0.
    expect(maxAbs).toBeGreaterThan(0);
  });

  it('always damps toward zero once perturbation stops (never un-damps)', () => {
    const sway = new SwayOscillator();
    // One sharp jerk...
    sway.update(1 / 60, 3000);
    // ...then let the envelope run with a steady velocity (no further jerks).
    const samples: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      samples.push(Math.abs(sway.update(1 / 60, 3000)));
    }
    const earlyPeak = Math.max(...samples.slice(0, 50));
    const latePeak = Math.max(...samples.slice(-50));
    expect(latePeak).toBeLessThan(earlyPeak);
    expect(latePeak).toBeLessThan(0.01);
  });

  it('reset() clears amplitude and envelope state', () => {
    const sway = new SwayOscillator();
    sway.update(1 / 60, 4000);
    sway.reset();
    expect(sway.update(1 / 60, 0)).toBe(0);
  });
});

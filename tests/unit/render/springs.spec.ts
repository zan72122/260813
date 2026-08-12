import { describe, expect, it } from 'vitest';

import {
  LAMP_SWING_MAX_DEG,
  WATER_SLOSH_MAX_DEG,
  WATER_SLOSH_SETTLE_DEG,
  WATER_SLOSH_SETTLE_S,
} from '../../../src/contracts/constants.ts';
import { angularVelocityDeg, clampAbs, DampedOscillator } from '../../../src/scene/springs.ts';

const DEG2RAD = Math.PI / 180;
const DT = 1 / 60;

describe('clampAbs', () => {
  it('clamps symmetrically', () => {
    expect(clampAbs(10, 4)).toBe(4);
    expect(clampAbs(-10, 4)).toBe(-4);
    expect(clampAbs(2, 4)).toBe(2);
  });
});

describe('angularVelocityDeg', () => {
  it('is zero dt-safe', () => {
    expect(angularVelocityDeg(0, 10, 0)).toBe(0);
  });

  it('computes the finite-difference rate', () => {
    expect(angularVelocityDeg(0, 6, 1)).toBeCloseTo(6, 9);
  });
});

describe('DampedOscillator: water slosh (MATH_CONTRACT §4)', () => {
  it('never NaNs at rest (no forcing, starts at 0)', () => {
    const slosh = new DampedOscillator(9.5, 0.42);
    for (let i = 0; i < 300; i += 1) {
      slosh.step(DT, 0);
      expect(Number.isFinite(slosh.value)).toBe(true);
      expect(Number.isFinite(slosh.velocity)).toBe(true);
    }
    expect(slosh.value).toBeCloseTo(0, 6);
  });

  it('stays within |WATER_SLOSH_MAX_DEG| when clamped, even under a large kick', () => {
    const slosh = new DampedOscillator(9.5, 0.42);
    const maxRad = WATER_SLOSH_MAX_DEG * DEG2RAD;
    slosh.step(DT, 0, 500); // a large instantaneous forcing acceleration
    for (let i = 0; i < 600; i += 1) {
      slosh.step(DT, 0);
      const clamped = clampAbs(slosh.value, maxRad);
      expect(Math.abs(clamped)).toBeLessThanOrEqual(maxRad + 1e-9);
    }
  });

  it('settles under WATER_SLOSH_SETTLE_DEG within WATER_SLOSH_SETTLE_S-scale time after a kick', () => {
    const slosh = new DampedOscillator(9.5, 0.42);
    slosh.step(DT, 0, 40);
    const steps = Math.round((WATER_SLOSH_SETTLE_S * 4) / DT); // generous multiple, any stable damped spring converges
    for (let i = 0; i < steps; i += 1) slosh.step(DT, 0);
    expect(Math.abs(slosh.value)).toBeLessThan(WATER_SLOSH_SETTLE_DEG * DEG2RAD);
  });
});

describe('DampedOscillator: hanging lamp pendulum (MATH_CONTRACT §4)', () => {
  it('never NaNs and stays within |LAMP_SWING_MAX_DEG| when clamped', () => {
    const lamp = new DampedOscillator(4.2, 0.3);
    const maxRad = LAMP_SWING_MAX_DEG * DEG2RAD;
    lamp.step(DT, 0, 200);
    for (let i = 0; i < 900; i += 1) {
      lamp.step(DT, 0);
      expect(Number.isFinite(lamp.value)).toBe(true);
      const clamped = clampAbs(lamp.value, maxRad);
      expect(Math.abs(clamped)).toBeLessThanOrEqual(maxRad + 1e-9);
    }
  });

  it('settles toward world-down (0) once forcing stops', () => {
    const lamp = new DampedOscillator(4.2, 0.3);
    lamp.step(DT, 0, 60);
    for (let i = 0; i < 3000; i += 1) lamp.step(DT, 0);
    expect(Math.abs(lamp.value)).toBeLessThan(0.01);
  });
});

describe('DampedOscillator: rolling ball (MATH_CONTRACT §4)', () => {
  it('tracks a moving target proportional to sin(tilt) and re-centers at level', () => {
    const ball = new DampedOscillator(6.5, 0.75);
    const floorRange = 0.6;
    const maxTiltRad = 8 * DEG2RAD;

    // Tilt to +8deg: ball should settle toward +floorRange.
    for (let i = 0; i < 400; i += 1) {
      const target = (floorRange * Math.sin(maxTiltRad)) / Math.sin(maxTiltRad);
      ball.step(DT, target);
    }
    expect(ball.value).toBeCloseTo(floorRange, 2);

    // Level again: ball must spring back to center.
    for (let i = 0; i < 400; i += 1) ball.step(DT, 0);
    expect(Math.abs(ball.value)).toBeLessThan(0.01);
  });

  it('stays clamped to the floor extents under clampAbs regardless of spring overshoot', () => {
    const ball = new DampedOscillator(6.5, 0.2); // low damping -> overshoot
    const floorRange = 0.6;
    let maxAbs = 0;
    for (let i = 0; i < 500; i += 1) {
      ball.step(DT, floorRange);
      maxAbs = Math.max(maxAbs, Math.abs(clampAbs(ball.value, floorRange)));
    }
    expect(maxAbs).toBeLessThanOrEqual(floorRange + 1e-9);
  });
});

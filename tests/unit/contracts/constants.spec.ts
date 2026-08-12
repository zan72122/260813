import { describe, expect, it } from 'vitest';

import {
  BLEND_END_S,
  BLEND_START_S,
  CABIN_MAX_WORLD_TILT_DEG,
  CARRIER_MAX_SPEED,
  LEVEL_SNAP_BAND_DEG,
  MECH_ADVANTAGE,
  PALETTE,
  PISTON_MAX_SPEED,
  PISTON_STROKE,
  PULLEY_RADIUS,
  QUALITY_TIERS,
  SIM_DT,
  STATION_BOTTOM_S,
  STATION_TOP_S,
  TAU_ASSIST,
  THETA_LOWER_DEG,
  THETA_LOWER_RAD,
  THETA_UPPER_DEG,
  THETA_UPPER_RAD,
  TRACK_LENGTH,
} from '../../../src/contracts/constants.ts';

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

describe('MATH_CONTRACT §1 track geometry constants', () => {
  it('anchors the two canonical inclination angles in degrees', () => {
    expect(THETA_LOWER_DEG).toBe(54);
    expect(THETA_UPPER_DEG).toBe(74);
    expect(THETA_LOWER_DEG).toBeLessThan(THETA_UPPER_DEG);
  });

  it('converts degrees to radians exactly', () => {
    expect(THETA_LOWER_RAD).toBeCloseTo((54 * Math.PI) / 180, 12);
    expect(THETA_UPPER_RAD).toBeCloseTo((74 * Math.PI) / 180, 12);
  });

  it('orders the blend region strictly within the track', () => {
    expect(STATION_BOTTOM_S).toBe(0);
    expect(STATION_TOP_S).toBe(TRACK_LENGTH);
    expect(BLEND_START_S).toBeGreaterThan(STATION_BOTTOM_S);
    expect(BLEND_START_S).toBeLessThan(BLEND_END_S);
    expect(BLEND_END_S).toBeLessThan(STATION_TOP_S);
  });
});

describe('MATH_CONTRACT §2 drive pipeline constants', () => {
  it('makes the full piston stroke traverse exactly the full track length', () => {
    // s = c = MECH_ADVANTAGE * p; a full stroke must reach TRACK_LENGTH
    // exactly, or the carrier could never reach the station platform.
    expect(MECH_ADVANTAGE * PISTON_STROKE).toBe(TRACK_LENGTH);
  });

  it('keeps the pulley radius positive and finite', () => {
    expect(PULLEY_RADIUS).toBeGreaterThan(0);
    expect(Number.isFinite(PULLEY_RADIUS)).toBe(true);
  });
});

describe('MATH_CONTRACT §5 motion feel constants', () => {
  it('sizes PISTON_MAX_SPEED so a full stroke takes ~45s', () => {
    expect(PISTON_STROKE / PISTON_MAX_SPEED).toBeCloseTo(45, 6);
  });

  it('derives a carrier speed within the documented ~2.9 m/s anchor', () => {
    expect(Math.abs(CARRIER_MAX_SPEED - 2.9)).toBeLessThan(0.1);
    expect(CARRIER_MAX_SPEED).toBe(MECH_ADVANTAGE * PISTON_MAX_SPEED);
  });
});

describe('MATH_CONTRACT §3/clamps — child-safety invariants', () => {
  it('keeps the leveling snap band inside the hard tilt clamp', () => {
    expect(LEVEL_SNAP_BAND_DEG).toBeLessThanOrEqual(CABIN_MAX_WORLD_TILT_DEG);
  });

  it('gives the assist a positive, finite time constant', () => {
    expect(TAU_ASSIST).toBeGreaterThan(0);
    expect(Number.isFinite(TAU_ASSIST)).toBe(true);
  });
});

describe('§6 determinism', () => {
  it('fixes the simulation step to 60 Hz', () => {
    expect(SIM_DT).toBeCloseTo(1 / 60, 12);
  });
});

describe('quality tiers', () => {
  it('lists exactly the three PERFORMANCE_BUDGET tiers', () => {
    expect(QUALITY_TIERS).toEqual(['high', 'medium', 'low']);
  });
});

describe('VISUAL_ACCEPTANCE palette anchors', () => {
  it('defines every palette color as a 6-digit hex string', () => {
    for (const value of Object.values(PALETTE)) {
      expect(value).toMatch(HEX_COLOR_RE);
    }
  });

  it('includes every named anchor from the visual acceptance doc', () => {
    expect(Object.keys(PALETTE).sort()).toEqual(
      [
        'brass',
        'cabinOchre',
        'iron',
        'skyHorizon',
        'skyZenith',
        'undergroundLamplight',
        'waterTeal',
      ].sort(),
    );
  });
});

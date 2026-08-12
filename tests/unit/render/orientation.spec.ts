import { describe, expect, it } from 'vitest';

import {
  cabinLocalQuaternion,
  carrierQuaternion,
  composedWorldTiltRad,
  zRotationOf,
} from '../../../src/scene/orientation.ts';

const DEG2RAD = Math.PI / 180;

describe('carrier/cabin quaternion composition (MATH_CONTRACT §3)', () => {
  it('carrier quaternion is a pure +Z rotation equal to carrierAngleRad', () => {
    for (const deg of [-90, -36, -20, 0, 15, 36, 90]) {
      const rad = deg * DEG2RAD;
      const q = carrierQuaternion(rad);
      expect(zRotationOf(q)).toBeCloseTo(rad, 9);
      // Pure Z-axis rotation: x and y components must be ~0.
      expect(Math.abs(q.x)).toBeLessThan(1e-9);
      expect(Math.abs(q.y)).toBeLessThan(1e-9);
    }
  });

  it('cabin local quaternion matches -(carrierAngle) + error', () => {
    const carrierAngleRad = 36 * DEG2RAD;
    const errorRad = 2 * DEG2RAD;
    const q = cabinLocalQuaternion(carrierAngleRad, errorRad);
    expect(zRotationOf(q)).toBeCloseTo(-carrierAngleRad + errorRad, 9);
  });

  it('composed world tilt equals the residual error for a sweep of carrier angles and errors', () => {
    const carrierAnglesDeg = [-36, -16, 0, 16, 36]; // covers theta 54deg..90deg..126deg range
    const errorsDeg = [-8, -4, -0.25, 0, 0.25, 4, 8]; // within CABIN_MAX_WORLD_TILT_DEG
    for (const carrierDeg of carrierAnglesDeg) {
      for (const errorDeg of errorsDeg) {
        const worldTiltRad = composedWorldTiltRad(carrierDeg * DEG2RAD, errorDeg * DEG2RAD);
        expect(worldTiltRad).toBeCloseTo(errorDeg * DEG2RAD, 9);
      }
    }
  });

  it('composed world tilt is independent of carrier angle when error is held constant', () => {
    const errorRad = 3 * DEG2RAD;
    const results = [-40, -10, 0, 10, 40].map((deg) => composedWorldTiltRad(deg * DEG2RAD, errorRad));
    for (const r of results) {
      expect(r).toBeCloseTo(errorRad, 9);
    }
  });

  it('never produces NaN across the full carrier sweep', () => {
    for (let deg = -90; deg <= 90; deg += 5) {
      const t = composedWorldTiltRad(deg * DEG2RAD, 1 * DEG2RAD);
      expect(Number.isFinite(t)).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  BLEND_END_S,
  BLEND_START_S,
  STATION_BOTTOM_S,
  STATION_TOP_S,
  THETA_LOWER_RAD,
  THETA_UPPER_RAD,
  TOLERANCE_TANGENT_CONTINUITY,
  TRACK_LENGTH,
} from '../../../src/contracts/constants.ts';
import {
  arcLengthFromT,
  clampArcLength,
  tFromArcLength,
  trackPoint,
  trackTangent,
  trackTheta,
} from '../../../src/game/track.ts';

// MATH_CONTRACT §1 + §7: verifying the FROZEN track curve's invariants.
// No bug found in src/game/track.ts (see this session's final report) — this
// file only tests it, never edits it.

describe('track.ts §1 — inclination profile', () => {
  it('holds THETA_LOWER for every s <= BLEND_START_S', () => {
    for (const s of [0, 1, 35, BLEND_START_S]) {
      expect(trackTheta(s)).toBeCloseTo(THETA_LOWER_RAD, 12);
    }
  });

  it('holds THETA_UPPER for every s >= BLEND_END_S', () => {
    for (const s of [BLEND_END_S, 90, 128]) {
      expect(trackTheta(s)).toBeCloseTo(THETA_UPPER_RAD, 12);
    }
  });

  it('is monotonic non-decreasing across the whole track', () => {
    let prev = trackTheta(STATION_BOTTOM_S);
    for (let s = STATION_BOTTOM_S; s <= STATION_TOP_S; s += 0.25) {
      const theta = trackTheta(s);
      expect(theta).toBeGreaterThanOrEqual(prev - 1e-15);
      prev = theta;
    }
  });

  it('is linear in s across the blend (constant slope = a circular arc)', () => {
    const dTheta = (BLEND_END_S - BLEND_START_S) / 4;
    const slopes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const s0 = BLEND_START_S + i * dTheta;
      const s1 = s0 + dTheta;
      slopes.push((trackTheta(s1) - trackTheta(s0)) / dTheta);
    }
    for (const slope of slopes) {
      expect(slope).toBeCloseTo(slopes[0]!, 10);
    }
  });
});

describe('track.ts §1 — position & tangent', () => {
  it('places the ground station portal at the origin', () => {
    const [x, y, z] = trackPoint(STATION_BOTTOM_S);
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBe(0);
  });

  it('keeps the lateral (Z) axis at zero everywhere on the centerline', () => {
    for (const s of [0, 10, 40, 70, 78, 86, 100, 128]) {
      expect(trackPoint(s)[2]).toBe(0);
    }
  });

  it('is strictly ascending in Y as s increases (dy/ds = sin(theta) > 0)', () => {
    let prevY = trackPoint(0)[1];
    for (let s = 1; s <= TRACK_LENGTH; s += 1) {
      const y = trackPoint(s)[1];
      expect(y).toBeGreaterThan(prevY);
      prevY = y;
    }
  });

  it('produces a unit tangent at every point on the track', () => {
    for (let s = 0; s <= TRACK_LENGTH; s += 2) {
      const [tx, ty, tz] = trackTangent(s);
      const mag = Math.sqrt(tx * tx + ty * ty + tz * tz);
      expect(mag).toBeCloseTo(1, 12);
      expect(tz).toBe(0);
    }
  });

  it('keeps the tangent direction consistent with theta at every point', () => {
    for (const s of [0, 40, 70, 78, 86, 128]) {
      const [tx, ty] = trackTangent(s);
      const theta = trackTheta(s);
      expect(tx).toBeCloseTo(Math.cos(theta), 12);
      expect(ty).toBeCloseTo(Math.sin(theta), 12);
    }
  });

  it('is C1-continuous (tangent matches) at both blend joints', () => {
    const eps = 1e-6;
    const belowStart = trackTangent(BLEND_START_S - eps);
    const atStart = trackTangent(BLEND_START_S);
    const aboveStart = trackTangent(BLEND_START_S + eps);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(belowStart[i]! - atStart[i]!)).toBeLessThan(TOLERANCE_TANGENT_CONTINUITY * 1e3); // eps-scaled numerical neighborhood
      expect(Math.abs(aboveStart[i]! - atStart[i]!)).toBeLessThan(1e-5);
    }
    const belowEnd = trackTangent(BLEND_END_S - eps);
    const atEnd = trackTangent(BLEND_END_S);
    const aboveEnd = trackTangent(BLEND_END_S + eps);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(belowEnd[i]! - atEnd[i]!)).toBeLessThan(1e-5);
      expect(Math.abs(aboveEnd[i]! - atEnd[i]!)).toBeLessThan(TOLERANCE_TANGENT_CONTINUITY * 1e3);
    }
  });

  it('the exact-joint tangent equals both the LOWER and UPPER analytic tangent at BLEND_START_S/BLEND_END_S', () => {
    // The strongest form of the C1 check: at the joint itself, tangent(joint)
    // must equal the closed-form tangent from EITHER adjoining piece, to
    // within TOLERANCE_TANGENT_CONTINUITY (MATH_CONTRACT §7).
    const atStart = trackTangent(BLEND_START_S);
    expect(Math.abs(atStart[0] - Math.cos(THETA_LOWER_RAD))).toBeLessThan(TOLERANCE_TANGENT_CONTINUITY);
    expect(Math.abs(atStart[1] - Math.sin(THETA_LOWER_RAD))).toBeLessThan(TOLERANCE_TANGENT_CONTINUITY);
    const atEnd = trackTangent(BLEND_END_S);
    expect(Math.abs(atEnd[0] - Math.cos(THETA_UPPER_RAD))).toBeLessThan(TOLERANCE_TANGENT_CONTINUITY);
    expect(Math.abs(atEnd[1] - Math.sin(THETA_UPPER_RAD))).toBeLessThan(TOLERANCE_TANGENT_CONTINUITY);
  });

  it('position is continuous across both blend joints (no seam/gap)', () => {
    const eps = 1e-6;
    for (const joint of [BLEND_START_S, BLEND_END_S]) {
      const before = trackPoint(joint - eps);
      const at = trackPoint(joint);
      const after = trackPoint(joint + eps);
      for (let i = 0; i < 2; i++) {
        expect(Math.abs(before[i]! - at[i]!)).toBeLessThan(1e-4);
        expect(Math.abs(after[i]! - at[i]!)).toBeLessThan(1e-4);
      }
    }
  });
});

describe('track.ts — arc-length clamping & normalization', () => {
  it('clamps arc length to [0, TRACK_LENGTH]', () => {
    expect(clampArcLength(-50)).toBe(0);
    expect(clampArcLength(TRACK_LENGTH + 50)).toBe(TRACK_LENGTH);
    expect(clampArcLength(64)).toBe(64);
  });

  it('round-trips t <-> s exactly at the endpoints', () => {
    expect(tFromArcLength(STATION_BOTTOM_S)).toBe(0);
    expect(tFromArcLength(STATION_TOP_S)).toBe(1);
    expect(arcLengthFromT(0)).toBe(STATION_BOTTOM_S);
    expect(arcLengthFromT(1)).toBe(STATION_TOP_S);
  });

  it('never produces a non-finite result for any out-of-range or in-range arc length', () => {
    for (let s = -10; s <= TRACK_LENGTH + 10; s += 5) {
      expect(Number.isFinite(trackTheta(s))).toBe(true);
      expect(trackPoint(s).every((n) => Number.isFinite(n))).toBe(true);
      expect(trackTangent(s).every((n) => Number.isFinite(n))).toBe(true);
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  CABIN_MAX_WORLD_TILT_DEG,
  CABIN_STEADY_HOLD_S,
  CABIN_STEADY_TILT_DEG,
  LEVEL_ASSIST_BOOST_MAX,
  LEVEL_ASSIST_SETTLE_ERROR_DEG,
  LEVEL_ASSIST_SETTLE_S,
  LEVEL_SNAP_BAND_DEG,
  SIM_DT,
} from '../../../src/contracts/constants.ts';
import {
  cabinFloorNormal,
  cabinWorldTiltDegFromError,
  cabinWorldTiltRadFromQuaternion,
  carrierAngleDegFromTheta,
  carrierQuaternion,
  INITIAL_LEVELING_STATE,
  stepLeveling,
  type LevelingState,
} from '../../../src/game/leveling.ts';

const DEG_TO_RAD = Math.PI / 180;

/** Feed a constant thetaRate for `seconds` of fixed steps, then hold theta constant for `holdSeconds` more. */
function runRampThenHold(
  rampRateDegPerS: number,
  rampSeconds: number,
  holdSeconds: number,
  wheelInputMagnitudeRad = 0,
): { atRampEnd: LevelingState; series: LevelingState[] } {
  let state = INITIAL_LEVELING_STATE;
  const rampRateRad = rampRateDegPerS * DEG_TO_RAD;
  const rampSteps = Math.round(rampSeconds / SIM_DT);
  for (let i = 0; i < rampSteps; i++) {
    state = stepLeveling(state, { thetaRateRadPerS: rampRateRad, dt: SIM_DT, wheelInputMagnitudeRad });
  }
  const atRampEnd = state;
  const series: LevelingState[] = [];
  const holdSteps = Math.round(holdSeconds / SIM_DT);
  for (let i = 0; i < holdSteps; i++) {
    state = stepLeveling(state, { thetaRateRadPerS: 0, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
    series.push(state);
  }
  return { atRampEnd, series };
}

describe('leveling.ts §3 — hard clamp: never exceeds CABIN_MAX_WORLD_TILT_DEG', () => {
  it('holds |cabinWorldTiltDeg| <= 8 deg under a realistic blend-speed theta ramp', () => {
    const { atRampEnd, series } = runRampThenHold(20 / 5.6, 5.6, 3); // ~20deg over ~5.6s, similar order to full-throttle blend traversal
    expect(Math.abs(cabinWorldTiltDegFromError(atRampEnd.errorRad))).toBeLessThanOrEqual(CABIN_MAX_WORLD_TILT_DEG);
    for (const s of series) {
      expect(Math.abs(cabinWorldTiltDegFromError(s.errorRad))).toBeLessThanOrEqual(CABIN_MAX_WORLD_TILT_DEG);
    }
  });

  it('holds the clamp even under an extreme, unrealistic theta rate (torture test)', () => {
    let state = INITIAL_LEVELING_STATE;
    let maxAbs = 0;
    for (let i = 0; i < 1000; i++) {
      state = stepLeveling(state, { thetaRateRadPerS: 500, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
      maxAbs = Math.max(maxAbs, Math.abs(cabinWorldTiltDegFromError(state.errorRad)));
      expect(Number.isFinite(state.errorRad)).toBe(true);
    }
    expect(maxAbs).toBeLessThanOrEqual(CABIN_MAX_WORLD_TILT_DEG + 1e-9);
  });

  it('holds the clamp for a sign-flipped extreme rate too (symmetric safety)', () => {
    let state = INITIAL_LEVELING_STATE;
    for (let i = 0; i < 1000; i++) {
      state = stepLeveling(state, { thetaRateRadPerS: -500, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
      expect(cabinWorldTiltDegFromError(state.errorRad)).toBeGreaterThanOrEqual(-CABIN_MAX_WORLD_TILT_DEG - 1e-9);
    }
  });

  it('never produces NaN under a zero or negative dt guard rejection', () => {
    expect(() => stepLeveling(INITIAL_LEVELING_STATE, { thetaRateRadPerS: 1, dt: -1, wheelInputMagnitudeRad: 0 })).toThrow(
      RangeError,
    );
  });
});

describe('leveling.ts §3 — steady-state & assist-settle timing', () => {
  it('settles to < LEVEL_ASSIST_SETTLE_ERROR_DEG within LEVEL_ASSIST_SETTLE_S of theta going constant, with ZERO input', () => {
    const { series } = runRampThenHold(20 / 5.6, 5.6, LEVEL_ASSIST_SETTLE_S);
    const last = series[series.length - 1]!;
    expect(Math.abs(cabinWorldTiltDegFromError(last.errorRad))).toBeLessThan(LEVEL_ASSIST_SETTLE_ERROR_DEG);
  });

  it('settles to < 0.25 deg within 3s of theta going constant (explicit MATH_CONTRACT §3 numeric restatement)', () => {
    const { series } = runRampThenHold(20 / 5.6, 5.6, 3);
    const last = series[series.length - 1]!;
    expect(Math.abs(cabinWorldTiltDegFromError(last.errorRad))).toBeLessThan(0.25);
  });

  it('is < CABIN_STEADY_TILT_DEG once theta has been constant for >= CABIN_STEADY_HOLD_S', () => {
    const { series } = runRampThenHold(20 / 5.6, 5.6, CABIN_STEADY_HOLD_S);
    const last = series[series.length - 1]!;
    expect(last.steadyHoldS).toBeGreaterThanOrEqual(CABIN_STEADY_HOLD_S - SIM_DT);
    expect(Math.abs(cabinWorldTiltDegFromError(last.errorRad))).toBeLessThan(CABIN_STEADY_TILT_DEG);
  });

  it('marks `settled` true once |errorRad| drops under the settle threshold, false while still large', () => {
    let state = INITIAL_LEVELING_STATE;
    expect(state.settled).toBe(true); // fresh/at-rest state starts settled
    // Force a large error via an extreme single-step rate, then verify settled flips false immediately.
    state = stepLeveling(state, { thetaRateRadPerS: 500, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
    expect(Math.abs(cabinWorldTiltDegFromError(state.errorRad))).toBeGreaterThan(LEVEL_ASSIST_SETTLE_ERROR_DEG);
    expect(state.settled).toBe(false);
  });

  it('steadyHoldS resets to 0 the instant theta starts changing again', () => {
    let state = INITIAL_LEVELING_STATE;
    for (let i = 0; i < 200; i++) {
      state = stepLeveling(state, { thetaRateRadPerS: 0, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
    }
    expect(state.steadyHoldS).toBeGreaterThan(0);
    state = stepLeveling(state, { thetaRateRadPerS: 1, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
    expect(state.steadyHoldS).toBe(0);
  });
});

describe('leveling.ts §3 — level-wheel boost & magnetic snap band', () => {
  it('wheel input activity converges the error faster than zero input, for the same ramp', () => {
    const zeroInput = runRampThenHold(20 / 5.6, 5.6, 0.5, 0);
    const wheelInput = runRampThenHold(20 / 5.6, 5.6, 0.5, 0.05);
    const zeroTilt = Math.abs(cabinWorldTiltDegFromError(zeroInput.series[zeroInput.series.length - 1]!.errorRad));
    const wheelTilt = Math.abs(cabinWorldTiltDegFromError(wheelInput.series[wheelInput.series.length - 1]!.errorRad));
    expect(wheelTilt).toBeLessThanOrEqual(zeroTilt + 1e-9);
  });

  it('wheel activity snaps to 1 the instant input arrives and decays back down once input stops', () => {
    let state = INITIAL_LEVELING_STATE;
    state = stepLeveling(state, { thetaRateRadPerS: 0, dt: SIM_DT, wheelInputMagnitudeRad: 0.1 });
    expect(state.wheelActivity).toBe(1);
    for (let i = 0; i < 30; i++) {
      state = stepLeveling(state, { thetaRateRadPerS: 0, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
    }
    expect(state.wheelActivity).toBeLessThan(1);
    expect(state.wheelActivity).toBeGreaterThanOrEqual(0);
  });

  it('the snap band engages LEVEL_ASSIST_BOOST_MAX convergence once |e| is within LEVEL_SNAP_BAND_DEG, even with zero player input', () => {
    // Start from a small error, just inside the snap band, and verify it
    // converges at least as fast as the boosted omega would predict versus
    // the un-boosted baseline (baseline omega would take noticeably longer).
    const smallErrorDeg = LEVEL_SNAP_BAND_DEG - 1;
    let boosted: LevelingState = { ...INITIAL_LEVELING_STATE, errorRad: smallErrorDeg * DEG_TO_RAD, settled: false };
    const boostedSteps = Math.round(1.5 / SIM_DT);
    for (let i = 0; i < boostedSteps; i++) {
      boosted = stepLeveling(boosted, { thetaRateRadPerS: 0, dt: SIM_DT, wheelInputMagnitudeRad: 0 });
    }
    expect(Math.abs(cabinWorldTiltDegFromError(boosted.errorRad))).toBeLessThan(LEVEL_ASSIST_SETTLE_ERROR_DEG);

    // Cross-check the snap band is actually doing the work: at baseline
    // (un-boosted, omega = 1/TAU_ASSIST) the SAME starting error over the
    // SAME duration would NOT yet be settled — proving the snap band's
    // LEVEL_ASSIST_BOOST_MAX materially speeds convergence rather than the
    // baseline dynamics alone accounting for it.
    const unboostedOmega = 1 / 0.8; // TAU_ASSIST, restated numerically to avoid re-deriving leveling's private baseline
    const y0 = smallErrorDeg * DEG_TO_RAD;
    const t = boostedSteps * SIM_DT;
    const baselinePrediction = (y0 + unboostedOmega * y0 * t) * Math.exp(-unboostedOmega * t);
    expect(Math.abs(baselinePrediction)).toBeGreaterThan(LEVEL_ASSIST_SETTLE_ERROR_DEG * DEG_TO_RAD);
    expect(LEVEL_ASSIST_BOOST_MAX).toBeGreaterThan(1); // sanity: the contract constant actually boosts
  });
});

describe('leveling.ts §3 — orientation formulas (quaternions end-to-end)', () => {
  it('carrierAngleDegFromTheta matches thetaDeg - 90 exactly', () => {
    for (const thetaDeg of [54, 60, 74, 90]) {
      const thetaRad = thetaDeg * DEG_TO_RAD;
      expect(carrierAngleDegFromTheta(thetaRad)).toBeCloseTo(thetaDeg - 90, 10);
    }
  });

  it('the carrier quaternion rotates +Y by exactly (theta - 90deg) about +Z', () => {
    const thetaRad = 60 * DEG_TO_RAD;
    const q = carrierQuaternion(thetaRad);
    // A pure +Z rotation by angle a satisfies q.w = cos(a/2), q.z = sin(a/2).
    const a = thetaRad - Math.PI / 2;
    expect(q.w).toBeCloseTo(Math.cos(a / 2), 10);
    expect(q.z).toBeCloseTo(Math.sin(a / 2), 10);
    expect(q.x).toBeCloseTo(0, 10);
    expect(q.y).toBeCloseTo(0, 10);
  });

  it('cabin world tilt via full quaternion composition matches the direct e-based formula (proves the algebra, not just assumes it)', () => {
    for (const thetaDeg of [54, 58, 66, 74]) {
      for (const errorDeg of [-5, -1, 0, 2.5, 7]) {
        const thetaRad = thetaDeg * DEG_TO_RAD;
        const errorRad = errorDeg * DEG_TO_RAD;
        const viaQuaternion = cabinWorldTiltRadFromQuaternion(thetaRad, errorRad);
        const viaDirect = errorRad;
        expect(viaQuaternion).toBeCloseTo(viaDirect, 9);
      }
    }
  });

  it('cabinFloorNormal is the world +Y axis when errorRad = 0, regardless of theta (the whole point of leveling)', () => {
    for (const thetaDeg of [54, 60, 74]) {
      const [nx, ny, nz] = cabinFloorNormal(thetaDeg * DEG_TO_RAD, 0);
      expect(nx).toBeCloseTo(0, 9);
      expect(ny).toBeCloseTo(1, 9);
      expect(nz).toBeCloseTo(0, 9);
    }
  });

  it('cabinFloorNormal tilts away from +Y proportionally to a nonzero error, independent of theta', () => {
    const errorRad = 5 * DEG_TO_RAD;
    const atLower = cabinFloorNormal(54 * DEG_TO_RAD, errorRad);
    const atUpper = cabinFloorNormal(74 * DEG_TO_RAD, errorRad);
    expect(atLower[0]).toBeCloseTo(atUpper[0], 9);
    expect(atLower[1]).toBeCloseTo(atUpper[1], 9);
    expect(atLower[0]).toBeCloseTo(-Math.sin(errorRad), 9);
    expect(atLower[1]).toBeCloseTo(Math.cos(errorRad), 9);
  });

  it('the floor normal stays a unit vector at all times', () => {
    for (const thetaDeg of [54, 66, 74]) {
      for (const errorDeg of [-8, 0, 8]) {
        const [x, y, z] = cabinFloorNormal(thetaDeg * DEG_TO_RAD, errorDeg * DEG_TO_RAD);
        expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('leveling.ts — INITIAL_LEVELING_STATE', () => {
  it('starts level, at rest, already past the steady-hold window, and settled', () => {
    expect(INITIAL_LEVELING_STATE.errorRad).toBe(0);
    expect(INITIAL_LEVELING_STATE.errorVelRad).toBe(0);
    expect(INITIAL_LEVELING_STATE.settled).toBe(true);
    expect(INITIAL_LEVELING_STATE.steadyHoldS).toBeGreaterThanOrEqual(CABIN_STEADY_HOLD_S);
    expect(INITIAL_LEVELING_STATE.wheelActivity).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import {
  CARRIER_ACCEL_LIMIT,
  CARRIER_MAX_SPEED,
  MECH_ADVANTAGE,
  PISTON_STROKE,
  PULLEY_RADIUS,
  RELEASE_EASE_DURATION_S,
  SIM_DT,
  STATION_BOTTOM_S,
  STATION_TOP_S,
  TOLERANCE_CYCLE_DRIFT,
  TOLERANCE_DRIVE_RELATIVE,
  TRACK_LENGTH,
} from '../../../src/contracts/constants.ts';
import {
  deriveDriveStateAtArcLength,
  INITIAL_DRIVE_STATE,
  RELEASE_DECEL_LIMIT,
  stepDrive,
  type DriveState,
} from '../../../src/game/sim.ts';

function relClose(actual: number, expected: number, rel: number): void {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThanOrEqual(rel);
    return;
  }
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThanOrEqual(rel);
}

/** Run `n` fixed steps with constant controls, returning the final state. */
function runSteps(state: DriveState, n: number, valveTarget: number, direction: -1 | 0 | 1): DriveState {
  let s = state;
  for (let i = 0; i < n; i++) {
    s = stepDrive(s, SIM_DT, { valveTarget, direction });
  }
  return s;
}

describe('sim.ts §2 — drive pipeline identities (both directions, 1e-9 relative)', () => {
  it('holds c === MECH_ADVANTAGE * p at every step while ascending', () => {
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 400; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      relClose(s.cableTravel, MECH_ADVANTAGE * s.pistonDisplacement, TOLERANCE_DRIVE_RELATIVE);
    }
  });

  it('holds phi === c / PULLEY_RADIUS at every step while ascending', () => {
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 400; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      relClose(s.pulleyAngle, s.cableTravel / PULLEY_RADIUS, TOLERANCE_DRIVE_RELATIVE);
    }
  });

  it('holds both identities while descending from the top', () => {
    let s = deriveDriveStateAtArcLength(STATION_TOP_S, 0);
    for (let i = 0; i < 400; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: -1 });
      relClose(s.cableTravel, MECH_ADVANTAGE * s.pistonDisplacement, TOLERANCE_DRIVE_RELATIVE);
      relClose(s.pulleyAngle, s.cableTravel / PULLEY_RADIUS, TOLERANCE_DRIVE_RELATIVE);
    }
  });

  it('holds arcLength === cableTravel exactly (s = c by definition)', () => {
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 100; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      expect(s.arcLength).toBe(s.cableTravel);
    }
  });

  it('a full stroke (p: 0 -> PISTON_STROKE) exactly spans the full track length', () => {
    const s = runSteps(INITIAL_DRIVE_STATE, 60 * 60, 1, 1); // 60s at full throttle, plenty to reach the end
    expect(s.pistonDisplacement).toBeCloseTo(PISTON_STROKE, 9);
    expect(s.arcLength).toBeCloseTo(TRACK_LENGTH, 9);
  });
});

describe('sim.ts §2 — pistons stop => everything stops', () => {
  it('zero valve target and zero direction produce zero speed and a frozen position', () => {
    const midRide = runSteps(INITIAL_DRIVE_STATE, 300, 1, 1);
    const afterRelease = runSteps(midRide, 200, 0, 0); // long enough to fully decelerate
    expect(afterRelease.speed).toBe(0);
    const next = stepDrive(afterRelease, SIM_DT, { valveTarget: 0, direction: 0 });
    expect(next.arcLength).toBe(afterRelease.arcLength);
    expect(next.pistonDisplacement).toBe(afterRelease.pistonDisplacement);
    expect(next.cableTravel).toBe(afterRelease.cableTravel);
    expect(next.pulleyAngle).toBe(afterRelease.pulleyAngle);
  });

  it('direction=0 with any valveTarget still yields zero speed (direction gates motion)', () => {
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 30; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 0 });
    }
    expect(s.speed).toBe(0);
    expect(s.arcLength).toBe(0);
  });
});

describe('sim.ts §5 — motion feel: accel limit, release-ease timing, no jerk', () => {
  it('never exceeds CARRIER_ACCEL_LIMIT * dt of speed change per step while accelerating from rest', () => {
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 300; i++) {
      const prevSpeed = s.speed;
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      expect(s.speed - prevSpeed).toBeLessThanOrEqual(CARRIER_ACCEL_LIMIT * SIM_DT + 1e-12);
    }
  });

  it('reaches (and clamps at) CARRIER_MAX_SPEED under sustained full throttle', () => {
    const s = runSteps(INITIAL_DRIVE_STATE, 600, 1, 1);
    expect(s.speed).toBeCloseTo(CARRIER_MAX_SPEED, 9);
    expect(s.valveOpen).toBeCloseTo(1, 9);
  });

  it('release from full speed reaches exactly zero speed within RELEASE_EASE_DURATION_S seconds', () => {
    const atMax = runSteps(INITIAL_DRIVE_STATE, 600, 1, 1);
    expect(atMax.speed).toBeCloseTo(CARRIER_MAX_SPEED, 9);

    const stepsToStop = Math.ceil(RELEASE_EASE_DURATION_S / SIM_DT);
    let s = atMax;
    let stoppedAtStep = -1;
    for (let i = 0; i < stepsToStop + 5; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 0, direction: 0 });
      if (s.speed === 0 && stoppedAtStep === -1) stoppedAtStep = i + 1;
    }
    expect(stoppedAtStep).toBeGreaterThan(0);
    expect(stoppedAtStep * SIM_DT).toBeLessThanOrEqual(RELEASE_EASE_DURATION_S + SIM_DT + 1e-9);
  });

  it('RELEASE_DECEL_LIMIT is derived from RELEASE_EASE_DURATION_S and is >= CARRIER_ACCEL_LIMIT (snappier stop than takeoff)', () => {
    expect(RELEASE_DECEL_LIMIT).toBeCloseTo(CARRIER_MAX_SPEED / RELEASE_EASE_DURATION_S, 12);
    expect(RELEASE_DECEL_LIMIT).toBeGreaterThanOrEqual(CARRIER_ACCEL_LIMIT);
  });

  it('reversing direction routes speed through zero rather than snapping sign in one step', () => {
    const atMax = runSteps(INITIAL_DRIVE_STATE, 600, 1, 1); // full forward speed
    const next = stepDrive(atMax, SIM_DT, { valveTarget: 1, direction: -1 }); // instantly commands reverse
    expect(next.speed).toBeLessThan(atMax.speed); // decelerating
    expect(next.speed).toBeGreaterThanOrEqual(0); // has NOT jumped negative in a single step
  });

  it('never produces a speed delta larger than the decel limit even on a full reversal command', () => {
    const atMax = runSteps(INITIAL_DRIVE_STATE, 600, 1, 1);
    let s = atMax;
    for (let i = 0; i < 400; i++) {
      const prev = s.speed;
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: -1 });
      expect(Math.abs(s.speed - prev)).toBeLessThanOrEqual(RELEASE_DECEL_LIMIT * SIM_DT + 1e-9);
    }
    // Eventually settles into full-speed reverse.
    expect(s.speed).toBeCloseTo(-CARRIER_MAX_SPEED, 6);
  });
});

describe('sim.ts §2 — end-of-travel clamps: no bounce, no NaN, no overshoot', () => {
  it('never overshoots STATION_TOP_S even under sustained full throttle past the end', () => {
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 60 * 60; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      expect(s.arcLength).toBeLessThanOrEqual(TRACK_LENGTH);
      expect(s.arcLength).toBeGreaterThanOrEqual(STATION_BOTTOM_S);
    }
    expect(s.arcLength).toBeCloseTo(TRACK_LENGTH, 9);
    expect(s.speed).toBe(0); // arrived and gently stopped, no bounce
  });

  it('never overshoots STATION_BOTTOM_S under sustained full-throttle descent', () => {
    let s = deriveDriveStateAtArcLength(STATION_TOP_S, 0);
    for (let i = 0; i < 60 * 60; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: -1 });
      expect(s.arcLength).toBeLessThanOrEqual(TRACK_LENGTH);
      expect(s.arcLength).toBeGreaterThanOrEqual(STATION_BOTTOM_S);
    }
    expect(s.arcLength).toBeCloseTo(STATION_BOTTOM_S, 9);
    expect(s.speed).toBe(0);
  });

  it('decelerates smoothly on approach to the end rather than snapping speed to zero at the last step', () => {
    // Drive close to the top, then keep pushing: speed should taper down
    // over several steps (braking distance), not hold at max speed then
    // instantly become zero on the very last step.
    let s = INITIAL_DRIVE_STATE;
    for (let i = 0; i < 60 * 60; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      if (s.arcLength > TRACK_LENGTH - 0.5) break;
    }
    const speeds: number[] = [];
    for (let i = 0; i < 30 && s.arcLength < TRACK_LENGTH; i++) {
      s = stepDrive(s, SIM_DT, { valveTarget: 1, direction: 1 });
      speeds.push(s.speed);
    }
    // Speed should be non-increasing (monotonic taper) through the braking approach.
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]!).toBeLessThanOrEqual(speeds[i - 1]! + 1e-9);
    }
  });

  it('never produces NaN in any field across a violent stress sequence (spam every control combo)', () => {
    let s = INITIAL_DRIVE_STATE;
    const controls: { valveTarget: number; direction: -1 | 0 | 1 }[] = [
      { valveTarget: 1, direction: 1 },
      { valveTarget: 0, direction: 0 },
      { valveTarget: 1, direction: -1 },
      { valveTarget: 0.3, direction: 1 },
      { valveTarget: 1, direction: 1 },
      { valveTarget: 1, direction: -1 },
      { valveTarget: 0, direction: -1 },
      { valveTarget: 1, direction: 0 },
    ];
    for (let i = 0; i < 2000; i++) {
      const c = controls[i % controls.length]!;
      s = stepDrive(s, SIM_DT, c);
      for (const value of Object.values(s)) {
        if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it('dt = 0 is a valid no-op step (does not throw, does not change state)', () => {
    const s = stepDrive(INITIAL_DRIVE_STATE, 0, { valveTarget: 1, direction: 1 });
    expect(s.arcLength).toBe(INITIAL_DRIVE_STATE.arcLength);
    expect(s.speed).toBe(INITIAL_DRIVE_STATE.speed);
  });

  it('rejects a negative or non-finite dt', () => {
    expect(() => stepDrive(INITIAL_DRIVE_STATE, -1, { valveTarget: 1, direction: 1 })).toThrow(RangeError);
    expect(() => stepDrive(INITIAL_DRIVE_STATE, Number.NaN, { valveTarget: 1, direction: 1 })).toThrow(RangeError);
  });
});

describe('sim.ts — 20-cycle ascent/descent drift < TOLERANCE_CYCLE_DRIFT', () => {
  it('returns p, c, s, phi to within tolerance after 20 full ascend+descend cycles', () => {
    let s = INITIAL_DRIVE_STATE;
    const stepsPerLeg = 60 * 60; // 60s per leg — comfortably longer than a full-speed traversal + braking
    for (let cycle = 0; cycle < 20; cycle++) {
      s = runSteps(s, stepsPerLeg, 1, 1); // ascend to the top
      s = runSteps(s, stepsPerLeg, 1, -1); // descend to the bottom
    }
    expect(Math.abs(s.arcLength - STATION_BOTTOM_S)).toBeLessThan(TOLERANCE_CYCLE_DRIFT);
    expect(Math.abs(s.cableTravel - STATION_BOTTOM_S)).toBeLessThan(TOLERANCE_CYCLE_DRIFT);
    expect(Math.abs(s.pistonDisplacement - 0)).toBeLessThan(TOLERANCE_CYCLE_DRIFT);
    expect(Math.abs(s.pulleyAngle - 0)).toBeLessThan(TOLERANCE_CYCLE_DRIFT);
    expect(s.speed).toBe(0);
  });
});

describe('sim.ts — deriveDriveStateAtArcLength (used by gotoState/scrubToT)', () => {
  it('produces a settled state (zero speed, zero valveOpen) at any arc length', () => {
    for (const s of [0, 40, 70, 86, 128]) {
      const state = deriveDriveStateAtArcLength(s);
      expect(state.speed).toBe(0);
      expect(state.valveOpen).toBe(0);
      expect(state.arcLength).toBeCloseTo(s, 9);
      expect(state.cableTravel).toBeCloseTo(s, 9);
      expect(state.pistonDisplacement).toBeCloseTo(s / MECH_ADVANTAGE, 9);
      expect(state.pulleyAngle).toBeCloseTo(s / PULLEY_RADIUS, 9);
    }
  });

  it('clamps an out-of-range arc length', () => {
    expect(deriveDriveStateAtArcLength(-10).arcLength).toBe(0);
    expect(deriveDriveStateAtArcLength(9999).arcLength).toBe(TRACK_LENGTH);
  });
});

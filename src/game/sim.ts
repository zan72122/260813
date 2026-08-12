/**
 * The drive pipeline — THE single source of motion (MATH_CONTRACT §2, §5).
 *
 *   valveOpen -> pistonSpeed -> pistonDisplacement -> cableTravel -> (s, phi)
 *
 * Design note (only one integrated state variable): rather than integrating
 * `p`, `c`, `s` and `phi` independently (which would let floating-point
 * drift pull the `c === 8p` / `phi === c/R` identities apart), this module
 * integrates a single signed arc-length speed and arc length `s`; every
 * other pipeline quantity (`p`, `c`, `phi`, `thetaRad`) is a PURE function of
 * `s`, recomputed fresh every step. That makes the exact identities
 * mechanically guaranteed rather than something that has to stay in sync.
 *
 * `valveOpen` (the 0..1 readout) is itself derived from the resulting speed
 * (`|speed| / CARRIER_MAX_SPEED`) rather than simulated as a separate eased
 * variable — because speed is rate-limited toward the raw lever/throttle
 * target (see `nextRateLimitedSpeed`), the derived `valveOpen` naturally
 * traces an eased curve toward whatever the player commands, satisfying
 * "valveOpen (0..1, eased toward lever input)" with one moving part instead
 * of two cascaded easings that would be harder to reason about and to keep
 * within the §5 timing guarantees simultaneously.
 *
 * Two distinct, named rate limits govern how fast that speed can change:
 *  - `CARRIER_ACCEL_LIMIT` (MATH_CONTRACT §5, arc-length space) — used only
 *    while the commanded speed magnitude is INCREASING (gentle takeoff).
 *  - `RELEASE_DECEL_LIMIT` (derived below from `RELEASE_EASE_DURATION_S`) —
 *    used whenever the commanded magnitude is decreasing (partial release,
 *    full release, or a direction reversal, which is always routed through
 *    zero speed first rather than snapping straight to the opposite sign).
 *    From full speed this reaches exactly zero in `RELEASE_EASE_DURATION_S`
 *    seconds, which is what makes "release => ease to a stop within 1s"
 *    (MATH_CONTRACT §5) an exact guarantee rather than an approximation:
 *    `CARRIER_ACCEL_LIMIT` alone (1.2 m/s²) would take ~2.37s from max
 *    speed, too slow, which is why the two limits are named separately in
 *    the contract text in the first place.
 *
 * End-of-travel: before integrating position each step, the speed is capped
 * to whatever a `RELEASE_DECEL_LIMIT`-braking maneuver could still stop
 * within before the boundary. This produces the "gentle end-of-travel
 * easing (no bounce)" the contract asks for as a physical consequence of
 * the same rate limit, rather than a special-cased snap. A final hard clamp
 * + zero-speed guard is kept as a numerical safety net only.
 */

import {
  CARRIER_ACCEL_LIMIT,
  CARRIER_MAX_SPEED,
  MECH_ADVANTAGE,
  PULLEY_RADIUS,
  RELEASE_EASE_DURATION_S,
  STATION_BOTTOM_S,
  TRACK_LENGTH,
} from '../contracts/constants.ts';
import { clampArcLength, trackTheta } from './track.ts';

/** Drive direction: -1 descending, 0 idle, 1 ascending. Mirrors `ThrottleDirection`. */
export type DriveDirection = -1 | 0 | 1;

/** A complete, consistent snapshot of the drive pipeline at one instant. */
export interface DriveState {
  /** Effective valve openness, `[0, 1]`, derived from `|speed| / CARRIER_MAX_SPEED`. */
  readonly valveOpen: number;
  /** Last commanded drive direction. */
  readonly direction: DriveDirection;
  /** Signed carrier arc-length speed `ds/dt`, meters/second. */
  readonly speed: number;
  /** Piston displacement `p = s / MECH_ADVANTAGE`, meters, `[0, PISTON_STROKE]`. */
  readonly pistonDisplacement: number;
  /** Cable travel `c = s` (MATH_CONTRACT §2: `carrier arc length s = c`), meters. */
  readonly cableTravel: number;
  /** Carrier arc length along the track, meters, `[0, TRACK_LENGTH]`. */
  readonly arcLength: number;
  /** Big pulley rotation angle `phi = c / PULLEY_RADIUS`, radians (unbounded). */
  readonly pulleyAngle: number;
  /** Track inclination at `arcLength`, radians. */
  readonly thetaRad: number;
}

/** Raw (unsmoothed) control targets for one `stepDrive` call. */
export interface DriveControls {
  /** Raw lever/throttle-hold target, `[0, 1]`; NOT pre-eased by the caller. */
  readonly valveTarget: number;
  /** Commanded direction this step. */
  readonly direction: DriveDirection;
}

/**
 * Deceleration rate (arc-length space, m/s²) used whenever commanded speed
 * magnitude is decreasing — release, partial release, or reversal. Derived
 * from `RELEASE_EASE_DURATION_S` so a full-speed release reaches exactly
 * zero in exactly that many seconds (MATH_CONTRACT §5).
 */
export const RELEASE_DECEL_LIMIT = CARRIER_MAX_SPEED / RELEASE_EASE_DURATION_S;

/** The "engine off, parked at the bottom station" pipeline state. */
export const INITIAL_DRIVE_STATE: DriveState = deriveDriveStateAtArcLength(STATION_BOTTOM_S, 0);

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (!(maxDelta > 0)) return current;
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/**
 * Rate-limit `currentSpeed` one step toward `targetSpeed`. Reversal (sign
 * change) is always routed through zero first — never a same-step snap from
 * one sign straight to the other — so the carrier always visibly slows,
 * stops, then (over subsequent steps) picks up the new direction.
 */
function nextRateLimitedSpeed(currentSpeed: number, targetSpeed: number, dt: number): number {
  const currentSign = Math.sign(currentSpeed);
  const targetSign = Math.sign(targetSpeed);
  const reversing = currentSign !== 0 && targetSign !== 0 && currentSign !== targetSign;
  const effectiveTarget = reversing ? 0 : targetSpeed;
  const increasingMagnitude = Math.abs(effectiveTarget) > Math.abs(currentSpeed);
  const rateLimit = increasingMagnitude ? CARRIER_ACCEL_LIMIT : RELEASE_DECEL_LIMIT;
  return moveTowards(currentSpeed, effectiveTarget, rateLimit * dt);
}

/**
 * Cap `speed` so that, braking at the fastest available rate
 * (`RELEASE_DECEL_LIMIT`), the carrier can still stop exactly at the
 * boundary it is heading toward — the "gentle end-of-travel easing" the
 * contract asks for, as a direct physical consequence rather than a snap.
 */
function capSpeedForBoundary(speed: number, arcLength: number): number {
  if (speed > 0) {
    const distanceRemaining = TRACK_LENGTH - arcLength;
    const maxSafeSpeed = Math.sqrt(Math.max(0, 2 * RELEASE_DECEL_LIMIT * distanceRemaining));
    return Math.min(speed, maxSafeSpeed);
  }
  if (speed < 0) {
    const distanceRemaining = arcLength - STATION_BOTTOM_S;
    const maxSafeSpeed = Math.sqrt(Math.max(0, 2 * RELEASE_DECEL_LIMIT * distanceRemaining));
    return Math.max(speed, -maxSafeSpeed);
  }
  return speed;
}

/**
 * Build a fully-consistent `DriveState` from arc length `s` and signed speed
 * alone — every other field is a pure function of `s` (MATH_CONTRACT §2).
 */
function deriveDriveState(arcLength: number, speed: number, direction: DriveDirection): DriveState {
  const s = clampArcLength(arcLength);
  // `=== 0` is true for both +0 and -0; reassigning the literal normalizes
  // away any -0 that boundary-capping math can produce (e.g. Math.max(x, -0)
  // when a braking cap lands exactly on zero), so downstream consumers never
  // have to reason about signed-zero edge cases.
  let safeSpeed = Number.isFinite(speed) ? speed : 0;
  if (safeSpeed === 0) safeSpeed = 0;
  const p = s / MECH_ADVANTAGE;
  const c = s;
  const phi = c / PULLEY_RADIUS;
  const valveOpen = clamp01(Math.abs(safeSpeed) / CARRIER_MAX_SPEED);
  return {
    valveOpen,
    direction,
    speed: safeSpeed,
    pistonDisplacement: p,
    cableTravel: c,
    arcLength: s,
    pulleyAngle: phi,
    thetaRad: trackTheta(s),
  };
}

/** A settled (zero-speed, zero-valve) drive state at a given arc length — used for direct/QA state entry (`gotoState`, `scrubToT`). */
export function deriveDriveStateAtArcLength(arcLength: number, direction: DriveDirection = 0): DriveState {
  return deriveDriveState(arcLength, 0, direction);
}

/**
 * Advance the drive pipeline by exactly one fixed step. Pure: no mutation of
 * `state`, no globals, no Date/performance reads — the same `(state, dt,
 * controls)` triple always produces the same result (MATH_CONTRACT §6).
 */
export function stepDrive(state: DriveState, dt: number, controls: DriveControls): DriveState {
  if (!(dt >= 0) || !Number.isFinite(dt)) {
    throw new RangeError('stepDrive: dt must be a finite number >= 0');
  }
  const valveTarget = clamp01(controls.valveTarget);
  const direction = controls.direction;
  const targetSpeed = valveTarget * direction * CARRIER_MAX_SPEED;

  let nextSpeed = nextRateLimitedSpeed(state.speed, targetSpeed, dt);
  nextSpeed = capSpeedForBoundary(nextSpeed, state.arcLength);

  let nextArcLength = state.arcLength + nextSpeed * dt;
  const clampedArcLength = clampArcLength(nextArcLength);
  if (clampedArcLength !== nextArcLength) {
    // Numerical safety net only — capSpeedForBoundary should already have
    // prevented overshoot; if float error pushes past the end anyway, stop
    // dead at the boundary rather than bounce or clip through it.
    nextArcLength = clampedArcLength;
    nextSpeed = 0;
  }

  return deriveDriveState(nextArcLength, nextSpeed, direction);
}

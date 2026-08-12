/**
 * Carrier & cabin orientation, and the residual cabin-leveling error dynamics
 * (MATH_CONTRACT §3) — the signature moment: the carrier tilts with the
 * track while the cabin counter-rotates to stay level, briefly lagging then
 * recovering.
 *
 * Orientation formulas follow MATH_CONTRACT §3 literally, using
 * `THREE.Quaternion` end-to-end (pure math class, no scene graph — allowed
 * per the module header in MATH_CONTRACT):
 *   q_carrier      = R_z(theta - PI/2)
 *   q_cabin_local   = R_z(-(theta - PI/2) + e)     (cabin is a child of the carrier)
 *   q_cabin_world   = q_carrier * q_cabin_local
 * For a single-axis Z rotation, quaternion composition is angle addition, so
 * algebraically `q_cabin_world` is a pure `R_z(e)` — the carrier's tilt and
 * the cabin's counter-tilt cancel exactly, leaving only the residual error
 * `e` as the cabin's world tilt. `cabinWorldTiltRadFromQuaternion` computes
 * this via the actual quaternion composition (not just the algebra) so a
 * mistake in either formula would surface as a test failure rather than
 * being assumed away.
 *
 * Residual error dynamics: `e` is a critically-damped spring (position +
 * velocity state) chasing a *moving* target `TAU_ASSIST * thetaRate` — the
 * steady-state tracking lag of a `TAU_ASSIST`-response servo under a theta
 * ramp. While the track is steepening, this target is nonzero and the spring
 * chases it (injecting exactly the "cabin lags behind" signature); once the
 * ramp ends the target snaps back to zero and the same spring relaxes `e`
 * back to level. One mechanism (a driven spring), not two separate ad hoc
 * "inject" and "recover" phases.
 */

import * as THREE from 'three';

import {
  CABIN_MAX_WORLD_TILT_DEG,
  CABIN_STEADY_HOLD_S,
  LEVEL_ASSIST_BOOST_MAX,
  LEVEL_ASSIST_SETTLE_ERROR_DEG,
  LEVEL_SNAP_BAND_DEG,
  RELEASE_EASE_DURATION_S,
  TAU_ASSIST,
} from '../contracts/constants.ts';

export type Vec3Tuple = readonly [number, number, number];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const CABIN_MAX_WORLD_TILT_RAD = CABIN_MAX_WORLD_TILT_DEG * DEG_TO_RAD;
const LEVEL_SNAP_BAND_RAD = LEVEL_SNAP_BAND_DEG * DEG_TO_RAD;
const LEVEL_ASSIST_SETTLE_ERROR_RAD = LEVEL_ASSIST_SETTLE_ERROR_DEG * DEG_TO_RAD;

/**
 * Theta-rate magnitude (rad/s) below which the track is considered "not
 * changing" for `steadyHoldS` bookkeeping. Not a MATH_CONTRACT quantity —
 * just a practical zero-epsilon (≈ 0.0057 °/s), far below any rate the
 * blend geometry can actually produce.
 */
const STEADY_THETA_RATE_EPSILON_RAD_PER_S = 1e-4;

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

// ---------------------------------------------------------------------------
// Orientation (quaternions end-to-end, MATH_CONTRACT §3)
// ---------------------------------------------------------------------------

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Carrier world rotation about +Z: `R_z(theta - PI/2)`. */
export function carrierQuaternion(thetaRad: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(Z_AXIS, thetaRad - Math.PI / 2).normalize();
}

/** Cabin's LOCAL rotation (relative to its carrier parent) about +Z. */
export function cabinLocalQuaternion(thetaRad: number, errorRad: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -(thetaRad - Math.PI / 2) + errorRad).normalize();
}

/** Cabin's WORLD rotation: `q_carrier * q_cabin_local`, renormalized (MATH_CONTRACT §6). */
export function cabinWorldQuaternion(thetaRad: number, errorRad: number): THREE.Quaternion {
  return carrierQuaternion(thetaRad).multiply(cabinLocalQuaternion(thetaRad, errorRad)).normalize();
}

/** Signed rotation angle (radians) of a quaternion known to be a pure +Z-axis rotation. */
export function zAxisAngleFromQuaternion(q: THREE.Quaternion): number {
  return 2 * Math.atan2(q.z, q.w);
}

/** Cabin world tilt (radians), derived via the actual quaternion composition. */
export function cabinWorldTiltRadFromQuaternion(thetaRad: number, errorRad: number): number {
  return zAxisAngleFromQuaternion(cabinWorldQuaternion(thetaRad, errorRad));
}

/** Cabin's local +Y axis transformed to world space (the `cabinFloorNormal` readout). */
export function cabinFloorNormal(thetaRad: number, errorRad: number): Vec3Tuple {
  const q = cabinWorldQuaternion(thetaRad, errorRad);
  const up = WORLD_UP.clone().applyQuaternion(q);
  return [up.x, up.y, up.z];
}

/** Carrier world rotation about +Z, degrees: `thetaDeg - 90`. */
export function carrierAngleDegFromTheta(thetaRad: number): number {
  return thetaRad * RAD_TO_DEG - 90;
}

/** Cabin world tilt, degrees, directly from the residual error (algebraically identical to the quaternion route — see module doc). */
export function cabinWorldTiltDegFromError(errorRad: number): number {
  return errorRad * RAD_TO_DEG;
}

// ---------------------------------------------------------------------------
// Residual error dynamics (critically-damped spring)
// ---------------------------------------------------------------------------

interface SpringState {
  readonly value: number;
  readonly velocity: number;
}

/**
 * Exact analytic step of a critically-damped spring (natural frequency
 * `omega`) toward a fixed-over-the-step `target`. Unconditionally stable at
 * any `dt`/`omega` combination (no numerical blow-up), which is what lets
 * `LEVEL_ASSIST_BOOST_MAX` scale `omega` up 3x without special-casing.
 */
function stepCriticallyDampedSpring(current: SpringState, target: number, omega: number, dt: number): SpringState {
  if (!(omega > 0)) return current;
  const decay = Math.exp(-omega * dt);
  const offset = current.value - target;
  const c2 = current.velocity + omega * offset;
  const value = target + (offset + c2 * dt) * decay;
  const velocity = (current.velocity - omega * c2 * dt) * decay;
  return { value, velocity };
}

export interface LevelingState {
  /** Residual cabin tilt error `e`, radians (signed). */
  readonly errorRad: number;
  /** `de/dt`, radians/second — the spring's velocity state. */
  readonly errorVelRad: number;
  /** Seconds theta's rate of change has been ~0 (MATH_CONTRACT §3 steady-state window). */
  readonly steadyHoldS: number;
  /** `|errorRad| < LEVEL_ASSIST_SETTLE_ERROR_DEG` — the assist's own "done" signal. */
  readonly settled: boolean;
  /** Decaying 0..1 "is the level wheel actively being turned" measure driving the assist boost. */
  readonly wheelActivity: number;
}

/** Fully settled, level, "just entered this state fresh" leveling state. */
export const INITIAL_LEVELING_STATE: LevelingState = {
  errorRad: 0,
  errorVelRad: 0,
  steadyHoldS: CABIN_STEADY_HOLD_S,
  settled: true,
  wheelActivity: 0,
};

export interface LevelingControls {
  /** `d(theta)/dt` this step, radians/second (signed; 0 once the track stops changing). */
  readonly thetaRateRadPerS: number;
  /** Fixed step size, seconds. */
  readonly dt: number;
  /** `|deltaRadians|` applied via the level-wheel gesture this step (0 if none). */
  readonly wheelInputMagnitudeRad: number;
}

/**
 * Advance the leveling assist by one fixed step. Pure, deterministic, NaN-safe:
 * hard-clamps `errorRad` to `±CABIN_MAX_WORLD_TILT_DEG` every step regardless
 * of how large the injected drive or how small `dt` is.
 */
export function stepLeveling(state: LevelingState, controls: LevelingControls): LevelingState {
  const dt = controls.dt;
  if (!(dt >= 0) || !Number.isFinite(dt)) {
    throw new RangeError('stepLeveling: dt must be a finite number >= 0');
  }
  const thetaRate = Number.isFinite(controls.thetaRateRadPerS) ? controls.thetaRateRadPerS : 0;

  // Wheel activity: snaps to fully-active the instant the wheel moves, then
  // eases off over RELEASE_EASE_DURATION_S once input stops (reusing the
  // same "how fast things ease off after release" constant used elsewhere,
  // rather than inventing a new one).
  const nextWheelActivity =
    controls.wheelInputMagnitudeRad !== 0
      ? 1
      : clamp01(state.wheelActivity - dt / RELEASE_EASE_DURATION_S);

  const playerBoost = 1 + (LEVEL_ASSIST_BOOST_MAX - 1) * nextWheelActivity;
  const withinSnapBand = Math.abs(state.errorRad) < LEVEL_SNAP_BAND_RAD;
  const snapBoost = withinSnapBand ? LEVEL_ASSIST_BOOST_MAX : 1;
  const boost = Math.max(playerBoost, snapBoost);
  const omega = (1 / TAU_ASSIST) * boost;

  // Steady-state lag of a TAU_ASSIST-response tracker under a theta ramp —
  // this is what makes the cabin visibly lag while theta is changing and
  // relax back to level once it stops (see module doc).
  const targetErrorRad = TAU_ASSIST * thetaRate;

  const spring = stepCriticallyDampedSpring({ value: state.errorRad, velocity: state.errorVelRad }, targetErrorRad, omega, dt);

  let nextErrorRad = spring.value;
  let nextErrorVelRad = spring.velocity;

  // Hard safety clamp: |cabinWorldTiltDeg| <= CABIN_MAX_WORLD_TILT_DEG at ALL times (MATH_CONTRACT §3).
  if (nextErrorRad > CABIN_MAX_WORLD_TILT_RAD) {
    nextErrorRad = CABIN_MAX_WORLD_TILT_RAD;
    if (nextErrorVelRad > 0) nextErrorVelRad = 0;
  } else if (nextErrorRad < -CABIN_MAX_WORLD_TILT_RAD) {
    nextErrorRad = -CABIN_MAX_WORLD_TILT_RAD;
    if (nextErrorVelRad < 0) nextErrorVelRad = 0;
  }

  const isSteady = Math.abs(thetaRate) < STEADY_THETA_RATE_EPSILON_RAD_PER_S;
  const nextSteadyHoldS = isSteady ? state.steadyHoldS + dt : 0;
  const settled = Math.abs(nextErrorRad) < LEVEL_ASSIST_SETTLE_ERROR_RAD;

  return {
    errorRad: nextErrorRad,
    errorVelRad: nextErrorVelRad,
    steadyHoldS: nextSteadyHoldS,
    settled,
    wheelActivity: nextWheelActivity,
  };
}

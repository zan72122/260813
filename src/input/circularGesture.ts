// src/input/circularGesture.ts
// Pure, DOM-free circular-gesture recognizer for the one-finger valve-turn
// control (MASTER_SPEC "バルブ操作仕様"). No dependency on src/contracts
// beyond the sign convention it must honor: deltaAngleRad positive = clockwise.
//
// Design notes:
// - Ring buffer of recent pointer samples + a rolling centroid (mean of the
//   buffer) approximates the true rotation center even when the finger's
//   circle drifts or is drawn off-center from wherever the game thinks the
//   valve is. Because the centroid of points on a convex arc always lies
//   inside the arc's circle, one full physical loop still nets a full 2*PI
//   of signed angle regardless of the centroid's small bias — this is the
//   "strong trajectory correction" required by MASTER_SPEC.
// - Screen space is y-down. With that convention, atan2(dy, dx) increases
//   for a visually clockwise sweep (right -> bottom -> left -> top), so a
//   plain wrapped angle difference already yields "+ = clockwise" as the
//   ActionIntent contract requires — no extra sign flip needed.
// - Counter-clockwise motion is never a failure: its raw delta is damped and
//   clamped to a small magnitude so the game can render gentle resistance
//   instead of subtracting openness aggressively.
// - A gap between samples longer than `idleResetSec` (finger stopped, or a
//   new gesture started) resets angle tracking so the next sample can't
//   produce a spurious large jump — this is what lets a consumer verify that
//   "deltas stop" when the finger stops moving.

export interface GestureSample {
  /** Pointer position in any consistent 2D unit (CSS px, normalized, ...). */
  x: number;
  y: number;
  /** Monotonic timestamp in seconds. */
  t: number;
}

export interface GestureDelta {
  /** Signed angle change since the previous sample. + = clockwise. */
  deltaAngleRad: number;
  /** Low-pass filtered angular velocity, radians/second. */
  angularVelocityRadPerSec: number;
}

export interface CircularGestureTrackerOptions {
  /** Ring buffer capacity used for the rolling centroid fit. */
  bufferSize?: number;
  /** Gap (seconds) beyond which angle tracking resets instead of jumping. */
  idleResetSec?: number;
  /** Exponential low-pass factor (0..1, higher = less smoothing) for velocity. */
  velocityLowPassAlpha?: number;
  /** Scales a counter-clockwise raw delta toward zero (never a hard stop). */
  ccwDampingFactor?: number;
  /** Hard clamp (radians) on the magnitude of any single CCW delta. */
  ccwMaxMagnitudeRad?: number;
  /** Samples closer than this to the rolling centroid are ignored (ill-defined angle). */
  minRadius?: number;
}

const DEFAULTS: Required<CircularGestureTrackerOptions> = {
  bufferSize: 12,
  idleResetSec: 0.35,
  velocityLowPassAlpha: 0.35,
  ccwDampingFactor: 0.12,
  ccwMaxMagnitudeRad: 0.035,
  minRadius: 1e-6,
};

export interface CircularGestureTracker {
  /** Clears all history. Call at gesture start (e.g. pointerdown) or on phase exit. */
  reset(): void;
  /**
   * Feeds one new pointer sample. Returns a delta once there is enough
   * history to define an angle change, otherwise null (no-op for the caller
   * — do not emit an intent for a null result).
   */
  addSample(sample: GestureSample): GestureDelta | null;
}

function wrapAngleDiff(diff: number): number {
  let d = diff % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createCircularGestureTracker(
  options: CircularGestureTrackerOptions = {},
): CircularGestureTracker {
  const opts: Required<CircularGestureTrackerOptions> = { ...DEFAULTS, ...options };
  const buffer: GestureSample[] = [];
  let lastAngle: number | null = null;
  let prevSampleT: number | null = null;
  let filteredVelocity = 0;

  function reset(): void {
    buffer.length = 0;
    lastAngle = null;
    prevSampleT = null;
    filteredVelocity = 0;
  }

  function addSample(sample: GestureSample): GestureDelta | null {
    const priorSampleT = prevSampleT;

    // Idle gap: start a fresh angle-tracking segment so we never emit a
    // spurious jump for the time the finger was actually stationary/off.
    if (priorSampleT !== null && sample.t - priorSampleT > opts.idleResetSec) {
      lastAngle = null;
      filteredVelocity = 0;
      buffer.length = 0;
    }

    buffer.push(sample);
    while (buffer.length > opts.bufferSize) buffer.shift();
    prevSampleT = sample.t;

    // Rolling centroid fit over the buffered window.
    let cx = 0;
    let cy = 0;
    for (const s of buffer) {
      cx += s.x;
      cy += s.y;
    }
    cx /= buffer.length;
    cy /= buffer.length;

    const dx = sample.x - cx;
    const dy = sample.y - cy;
    if (Math.hypot(dx, dy) < opts.minRadius) return null;

    const angle = Math.atan2(dy, dx);

    if (lastAngle === null) {
      lastAngle = angle;
      return null;
    }

    let delta = wrapAngleDiff(angle - lastAngle);
    lastAngle = angle;

    if (delta < 0) {
      // Counter-clockwise: dampen toward a small resistance nudge instead of
      // letting openness fall back — MASTER_SPEC "軽い抵抗表現".
      delta = Math.max(delta * opts.ccwDampingFactor, -opts.ccwMaxMagnitudeRad);
    }

    const dt = Math.max(sample.t - (priorSampleT ?? sample.t), 1e-4);
    const rawVelocity = delta / dt;
    filteredVelocity =
      filteredVelocity * (1 - opts.velocityLowPassAlpha) + rawVelocity * opts.velocityLowPassAlpha;

    return { deltaAngleRad: delta, angularVelocityRadPerSec: filteredVelocity };
  }

  return { reset, addSample };
}

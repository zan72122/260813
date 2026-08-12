// src/game/math.ts — Gameplay owner. Pure, allocation-light math helpers.
// No DOM, no store/bus access: everything here is unit-testable in isolation.

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** approach gain for align: decelerates as the beam nears the ghost target. */
export function approachGain(remaining: number, initial: number): number {
  if (initial <= 0) return 1;
  return clamp(remaining / initial, 0.25, 1);
}

export const HOIST_SWAY_MAX_RAD = (6 * Math.PI) / 180;

const SWAY_OMEGA = 6; // rad/s — pendulum angular frequency
const SWAY_LAMBDA = 1.6; // 1/s — always-on damping factor
const SWAY_ACCEL_GAIN = 0.9; // amplitude (rad) gained per (px/s per s) of jerk, pre-clamp
const SWAY_ACCEL_THRESHOLD = 6; // px/s^2 minimum "jerk" to register as a new perturbation

/**
 * Analytic damped pendulum: sway(t) = A*sin(w*t)*e^(-lambda*t). Amplitude A
 * grows with input acceleration (a "jerk" on the hoist line) and is hard
 * clamped; the envelope always decays (lambda is a fixed positive constant),
 * it never grows unboundedly and never un-damps.
 */
export class SwayOscillator {
  private amplitude = 0;
  private envelopeTimeSec = 0;
  private lastVelocity = 0;

  reset(): void {
    this.amplitude = 0;
    this.envelopeTimeSec = 0;
    this.lastVelocity = 0;
  }

  /**
   * Feed one sample. `velocity` is the current vertical input velocity
   * (arbitrary consistent unit, e.g. px/s); `dtSec` is elapsed time since the
   * previous sample. Returns the clamped sway angle in radians.
   */
  update(dtSec: number, velocity: number): number {
    const safeDt = dtSec > 0 ? dtSec : 1 / 240;
    const accel = (velocity - this.lastVelocity) / safeDt;
    this.lastVelocity = velocity;
    if (Math.abs(accel) > SWAY_ACCEL_THRESHOLD) {
      this.amplitude = clamp(
        this.amplitude + Math.abs(accel) * SWAY_ACCEL_GAIN * 0.001,
        0,
        HOIST_SWAY_MAX_RAD,
      );
      this.envelopeTimeSec = 0;
    } else {
      this.envelopeTimeSec += safeDt;
    }
    const raw =
      this.amplitude * Math.sin(SWAY_OMEGA * this.envelopeTimeSec) * Math.exp(-SWAY_LAMBDA * this.envelopeTimeSec);
    return clamp(raw, -HOIST_SWAY_MAX_RAD, HOIST_SWAY_MAX_RAD);
  }
}

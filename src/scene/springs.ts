/**
 * Pure second-order damped-spring math for the cabin interior witnesses
 * (MATH_CONTRACT §4: water slosh, hanging lamp, rolling ball). No THREE
 * dependency — used by `src/scene/interior.ts` to drive real meshes, and
 * directly unit-tested (clamps, settle behavior, no-NaN-at-rest) from
 * `tests/unit/render/**` without a WebGL context.
 */

/**
 * Critically-tunable 2nd-order spring-damper: `value` chases `target`,
 * `extraAccel` lets a caller inject an instantaneous forcing term (e.g. the
 * cabin's angular acceleration "kicking" the water/lamp). `omega` is the
 * natural frequency (rad/s), `zeta` the damping ratio (`1` = critically
 * damped, `<1` = underdamped/oscillatory — used for the water/lamp so they
 * visibly settle rather than snapping).
 */
export class DampedOscillator {
  value: number;
  velocity: number;

  constructor(
    private readonly omega: number,
    private readonly zeta: number,
    initialValue = 0,
  ) {
    this.value = initialValue;
    this.velocity = 0;
  }

  /** Advance by `dt` seconds toward `target`, with an optional extra forcing acceleration. */
  step(dt: number, target: number, extraAccel = 0): number {
    if (!(dt > 0)) return this.value;
    const springAccel = this.omega * this.omega * (target - this.value);
    const dampAccel = -2 * this.zeta * this.omega * this.velocity;
    const accel = springAccel + dampAccel + extraAccel;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    if (!Number.isFinite(this.value)) this.value = 0;
    if (!Number.isFinite(this.velocity)) this.velocity = 0;
    return this.value;
  }

  reset(value = 0): void {
    this.value = value;
    this.velocity = 0;
  }
}

/** Clamp `value` to `[-limit, limit]`. */
export function clampAbs(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

/** Finite-difference angular velocity (deg/s) between two successive readings. */
export function angularVelocityDeg(previousDeg: number, currentDeg: number, dt: number): number {
  if (!(dt > 0)) return 0;
  return (currentDeg - previousDeg) / dt;
}

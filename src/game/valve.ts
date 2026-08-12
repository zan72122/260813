// src/game/valve.ts
// Integrates valve-rotate intents into openness 0..1. Clockwise-only,
// monotonic (counter-clockwise never subtracts openness — see MASTER_SPEC
// "反時計回りは失敗にせず...吸着"). Low-passes angular velocity so render/audio
// react to a smoothed rate rather than raw per-event jitter, and tracks the
// openness-weighted average speed used to set the pipe-run water speed.

import { VALVE_TOTAL_RADIANS, VALVE_VELOCITY_DECAY_TAU, VALVE_VELOCITY_SMOOTHING } from './timing';

export interface ValveState {
  openness: number; // 0..1, monotonically increasing
  angularVelocityRadPerSec: number; // low-passed, decays to 0 when idle
}

export class ValveModel {
  private _openness = 0;
  private _filteredVelocity = 0;
  /** openness-weighted running average of turning speed, used for pipe speed. */
  private _weightedVelocitySum = 0;
  private _weightTotal = 0;

  get openness(): number {
    return this._openness;
  }

  get angularVelocityRadPerSec(): number {
    return this._filteredVelocity;
  }

  get isFullyOpen(): boolean {
    return this._openness >= 1;
  }

  /** Average turning speed while the valve was actually gaining openness. */
  get averageAngularVelocity(): number {
    return this._weightTotal > 0 ? this._weightedVelocitySum / this._weightTotal : 0;
  }

  reset(): void {
    this._openness = 0;
    this._filteredVelocity = 0;
    this._weightedVelocitySum = 0;
    this._weightTotal = 0;
  }

  /** Feed a raw valve-rotate ActionIntent sample. */
  applyRotation(deltaAngleRad: number, angularVelocityRadPerSec: number): void {
    // Low-pass the raw velocity regardless of direction, so audio/render read
    // a smooth rate even while resisting counter-clockwise motion.
    this._filteredVelocity +=
      (angularVelocityRadPerSec - this._filteredVelocity) * VALVE_VELOCITY_SMOOTHING;

    // Clockwise-only: only positive delta contributes to openness. Negative
    // (counter-clockwise) deltas are absorbed with zero penalty.
    const clockwiseDelta = Math.max(0, deltaAngleRad);
    if (clockwiseDelta > 0 && this._openness < 1) {
      const gained = clockwiseDelta / VALVE_TOTAL_RADIANS;
      this._openness = Math.min(1, this._openness + gained);
      // Weight by openness gained so a long slow drag doesn't outweigh a
      // short fast one when computing the water-speed reference velocity.
      this._weightedVelocitySum += Math.abs(angularVelocityRadPerSec) * gained;
      this._weightTotal += gained;
    }
  }

  /** Call every frame; decays the filtered velocity toward 0 when no new
   * rotation samples arrive (finger lifted / stopped) so wrench + creak audio
   * settle instead of holding a stale high speed forever. Openness itself is
   * untouched — it only ever holds or increases. */
  update(dt: number): void {
    if (this._filteredVelocity === 0) return;
    const decay = Math.exp(-dt / VALVE_VELOCITY_DECAY_TAU);
    this._filteredVelocity *= decay;
    if (Math.abs(this._filteredVelocity) < 1e-4) this._filteredVelocity = 0;
  }

  snapshot(): ValveState {
    return { openness: this._openness, angularVelocityRadPerSec: this._filteredVelocity };
  }
}

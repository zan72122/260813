// src/game/water.ts
// Water propagation through the pipe (t: 0->1, speed set by the average
// valve-turn speed) and the fountain-flow intensity envelope: staged rise
// (single jet -> full shape) then a hold of at least 1.5s, per MASTER_SPEC.

import {
  PIPE_RUN_BASE_SEC,
  PIPE_RUN_MAX_SEC,
  PIPE_RUN_MIN_SEC,
  PIPE_RUN_REFERENCE_ANGULAR_VELOCITY,
  REVEAL_HOLD_SEC,
  REVEAL_STAGE1_SEC,
  REVEAL_STAGE2_SEC,
} from './timing';

/** Duration of the pipe-run, in seconds, given the average angular velocity
 * the player used while opening the valve. Faster turning => faster water. */
export function pipeRunDurationSec(averageAngularVelocityRadPerSec: number): number {
  const speedFactor = averageAngularVelocityRadPerSec / PIPE_RUN_REFERENCE_ANGULAR_VELOCITY;
  const clampedFactor = Math.min(2, Math.max(0.5, speedFactor || 1));
  const duration = PIPE_RUN_BASE_SEC / clampedFactor;
  return Math.min(PIPE_RUN_MAX_SEC, Math.max(PIPE_RUN_MIN_SEC, duration));
}

/** 0 (empty) .. 1 (single jet fully risen) .. up through full shape .. hold. */
export function fountainFlowIntensity(elapsedInReveal: number): number {
  if (elapsedInReveal <= REVEAL_STAGE1_SEC) {
    // Stage A: a single thin jet rises.
    return smoothstep(0, REVEAL_STAGE1_SEC, elapsedInReveal) * 0.35;
  }
  const stage2End = REVEAL_STAGE1_SEC + REVEAL_STAGE2_SEC;
  if (elapsedInReveal <= stage2End) {
    // Stage B: opens out into the fountain's full shape.
    const t = smoothstep(REVEAL_STAGE1_SEC, stage2End, elapsedInReveal);
    return 0.35 + t * 0.65;
  }
  // Stage C: hold at full intensity for >= REVEAL_HOLD_SEC.
  return 1;
}

export function isRevealHoldComplete(elapsedInReveal: number): boolean {
  return elapsedInReveal >= REVEAL_STAGE1_SEC + REVEAL_STAGE2_SEC + REVEAL_HOLD_SEC;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

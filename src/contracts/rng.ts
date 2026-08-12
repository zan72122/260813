/**
 * Seeded PRNG + per-leg scenario derivation. Pure/deterministic throughout:
 * `legScenario(seed, leg)` always returns bit-identical output for the same
 * inputs, no matter how many times or in what order it is called — the
 * state machine relies on this to recompute a leg's scenario on demand
 * instead of threading it through GameState (see stateMachine.ts doc
 * comment for why).
 */

import type { LegId } from './types';
import {
  INITIAL_OFFSET_MAX,
  INITIAL_OFFSET_MIN,
  SAND_UNDERSHOOT_MAX,
  SAND_UNDERSHOOT_MIN,
} from './constants';

/** A mulberry32 pseudo-random generator: call repeatedly for the next float in [0,1). */
export type Rng = () => number;

/**
 * mulberry32 seeded PRNG. `seed` is coerced to an unsigned 32-bit int.
 * Returns a generator closure — the closure is the only mutable state in
 * this module; `mulberry32` itself is a pure function of `seed` (calling it
 * twice with the same seed yields two independent generators that produce
 * the identical sequence).
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/**
 * Deterministically mixes (seed, leg) into a single 32-bit seed so each leg
 * draws from an independent sub-stream. Not cryptographic — just needs to
 * decorrelate the four legs' draws from a shared root seed.
 */
function mixSeed(seed: number, leg: LegId): number {
  const s = seed >>> 0;
  const l = (leg + 1) >>> 0;
  return (Math.imul(s ^ 0x9e3779b1, 0x85ebca6b) + Math.imul(l, 0xc2b2ae35)) >>> 0;
}

export interface LegScenario {
  /** Leg's starting height above target (units), range [18,30]. */
  initialOffset: number;
  /**
   * How far short of target (units) the sand runs out — legOffsetY floor
   * during the sand phase is exactly `-sandUndershoot`. Range [2,5].
   */
  sandUndershoot: number;
  /** Jack pump-strength multiplier; only affects the (rarely reached) outside-ASSIST_RADIUS stroke. Range [0.8,1.2]. */
  pumpGain: number;
  /** Establish/activeLeg camera yaw offset for this leg (radians, [0, 2π)). */
  cameraYaw: number;
  /** Discrete prop/scaffolding dressing variant index [0..3] for visual variety. */
  propVariant: 0 | 1 | 2 | 3;
  /** Per-leg audio pitch multiplier offset, range [-1,1]. */
  pitchShift: number;
}

/** Derives the deterministic scenario for one leg from the run seed. Pure. */
export function legScenario(seed: number, leg: LegId): LegScenario {
  const rng = mulberry32(mixSeed(seed, leg));
  const initialOffset = lerp(INITIAL_OFFSET_MIN, INITIAL_OFFSET_MAX, rng());
  const sandUndershoot = lerp(SAND_UNDERSHOOT_MIN, SAND_UNDERSHOOT_MAX, rng());
  const pumpGain = lerp(0.8, 1.2, rng());
  const cameraYaw = lerp(0, Math.PI * 2, rng());
  const propVariant = Math.min(3, Math.floor(rng() * 4)) as 0 | 1 | 2 | 3;
  const pitchShift = lerp(-1, 1, rng());
  return { initialOffset, sandUndershoot, pumpGain, cameraYaw, propVariant, pitchShift };
}

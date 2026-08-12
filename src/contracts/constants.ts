/**
 * Frozen numeric/tuning constants shared across all owner domains.
 * ARCHITECTURE_CONTRACT.md § constants.ts names the required constants;
 * concrete values are Wave 2 design decisions, chosen and documented here so
 * later waves understand the intent instead of guessing at magic numbers.
 */

import type { QualityTier } from './quality';

/** 1 unit = 1mm相当. Alignment tolerance that triggers automatic snap. */
export const SNAP_TOLERANCE = 1.0;

/**
 * Remaining-distance radius (units) inside which adaptive gain/slow-down
 * assistance begins for both the sand flow and the jack pump.
 */
export const ASSIST_RADIUS = 6;

/** initialOffset range handed out by rng.legScenario (units, leg starts above target). */
export const INITIAL_OFFSET_MIN = 18;
export const INITIAL_OFFSET_MAX = 30;

/** sandUndershoot range (units): sand always runs out this far short of target. */
export const SAND_UNDERSHOOT_MIN = 2;
export const SAND_UNDERSHOOT_MAX = 5;

/**
 * Max sand flow rate (units/s) at gateOpen=1 and full ease factor (far from
 * the depletion floor). Scaled down by gateOpen and by the ease curve as the
 * leg nears the floor — see legModel.sandStep.
 */
export const SAND_MAX_RATE = 6;

/**
 * Lower bound on the sand-flow ease factor (legModel.sandStep). Flow speed
 * eases from 1.0 (far from floor) down to this fraction (at the floor) so
 * depletion is a finite-time deceleration, not an asymptote that never
 * quite reaches zero.
 */
export const SAND_EASE_MIN_FACTOR = 0.2;

/**
 * Per-pump piston stroke (units) used only when the remaining distance is
 * OUTSIDE ASSIST_RADIUS (kept for completeness/robustness; with the current
 * INITIAL_OFFSET/SAND_UNDERSHOOT ranges the jack phase always begins inside
 * ASSIST_RADIUS, so this branch is a defensive fallback, not the common
 * path).
 */
export const JACK_MAX_STROKE = 3;

/**
 * Fraction of the remaining distance consumed by one pump while inside
 * ASSIST_RADIUS (legModel.jackStroke's adaptive gain). Chosen so that,
 * across the full sandUndershoot range (2..5 units), repeated pumps reach
 * SNAP_TOLERANCE in roughly 4-9 strokes:
 *   remaining_i = remaining_0 * (1 - JACK_ADAPTIVE_GAIN)^i
 * solved for remaining_0 in [2,5], tolerance 1.0 → i in [~3.8, ~8.9].
 */
export const JACK_ADAPTIVE_GAIN = 0.165;

/** Absolute minimum pump stroke (units) so the tail of convergence still finishes in finite pumps. */
export const JACK_MIN_STROKE = 0.05;

/** wedgeProgress must reach at least this value before hammerTap has any effect. */
export const WEDGE_SEAT_THRESHOLD = 0.98;

export const PARTICLE_BUDGET = 400;
export const PARTICLE_BUDGET_LOW = 150;

export const DPR_CAP: Record<QualityTier, number> = {
  high: 1.75,
  medium: 1.5,
  low: 1.25,
};

/** Fixed engine timestep (s) — PERFORMANCE_BUDGET/ARCHITECTURE_CONTRACT engine loop. */
export const FIXED_DT = 1 / 60;

/**
 * Phase timing constants (ms). Consumed by render/ui/audio owners for
 * cinematics and hint choreography; the pure state machine itself does not
 * depend on wall-clock time (see stateMachine.ts doc comment), so these
 * exist purely as a shared source of truth to avoid divergent hardcoded
 * numbers across owner domains.
 */
export const TIMING = {
  /** No-input delay before the active handle starts a hint pulse (PRODUCT_SPEC). */
  hintPulseMs: 3000,
  /** No-input delay before a translucent demonstration hand appears. */
  hintDemoMs: 5000,
  /** Snap slow-motion + magnetic seat cinematic duration. */
  snapSlowMoMs: 700,
  /** Camera travel duration for orbiting to the next leg. */
  orbitToNextMs: 1400,
  /** Interval between each of the 4 finalReveal joint-glow beats. */
  revealBeatMs: 600,
  /** Pause after the 4th reveal beat before the settle (sink) beat plays. */
  revealSettleDelayMs: 400,
} as const;

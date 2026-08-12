/**
 * Pure leg-control mathematical model. Every export here is a pure function:
 * same inputs → same output, no mutation of its arguments, no I/O, no
 * module-level mutable state. This is intentionally the ONLY place the
 * sand/jack/wedge physics live; render/input/audio owners must go through
 * these functions (or the state machine that wraps them) rather than
 * re-deriving the numbers.
 *
 * Design note — why sandStep/jackStroke take an explicit `scenario`
 * argument: LegState (types.ts, frozen) intentionally carries only the
 * *current* physical quantities (sandLevel, legOffsetY, ...), not the
 * per-leg constants that shaped them (initialOffset, sandUndershoot,
 * pumpGain). Threading those constants through LegState would mean either
 * duplicating them on every state object or smuggling extra untyped fields
 * onto it. Instead this module stays fully pure by taking a `LegScenario`
 * (rng.ts `legScenario(seed, leg)`, itself pure/deterministic) as an
 * explicit parameter — callers (stateMachine.ts) simply recompute it from
 * `(state.seed, state.activeLeg)` on demand; it is cheap and there is
 * nothing to cache or keep in sync.
 *
 * Invariant coverage: see tests/unit/contracts-leg-model.test.ts and
 * tests/unit/contracts-state-machine.test.ts for the full mapping to
 * ARCHITECTURE_CONTRACT.md § 状態機械の不変条件.
 */

import {
  ASSIST_RADIUS,
  JACK_ADAPTIVE_GAIN,
  JACK_MAX_STROKE,
  JACK_MIN_STROKE,
  SAND_EASE_MIN_FACTOR,
  SAND_MAX_RATE,
  SNAP_TOLERANCE,
} from './constants';
import type { LegId, LegState } from './types';
import type { LegScenario } from './rng';
import { legScenario } from './rng';

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Initial LegState for `leg` under `seed`: legOffsetY = +initialOffset, sandLevel = 1, phase 'idle'. */
export function createLegState(seed: number, leg: LegId): LegState {
  const { initialOffset } = legScenario(seed, leg);
  return {
    sandLevel: 1,
    sandboxSupportY: initialOffset,
    jackExtension: 0,
    legOffsetY: initialOffset,
    alignmentError: Math.abs(initialOffset),
    wedgeProgress: 0,
    locked: false,
    phase: 'idle',
  };
}

/**
 * One fixed-timestep sand-flow update.
 *
 * - `legOffsetY = sandboxSupportY + jackExtension` is maintained as an
 *   invariant across the whole model; during the sand phase jackExtension
 *   is always 0, so sandboxSupportY and legOffsetY move together 1:1.
 * - Flow rate is proportional to `gateOpen` and eased down smoothly as
 *   legOffsetY nears the depletion floor (`-scenario.sandUndershoot`), but
 *   never eased all the way to zero (SAND_EASE_MIN_FACTOR floor) — that
 *   guarantees the floor is actually *reached* in finite time rather than
 *   approached asymptotically forever.
 * - `sandLevel` is *defined* as the remaining fraction of the total drop
 *   (initialOffset → floor), so it reaches exactly 0 in the same step
 *   legOffsetY reaches the floor — by construction, not by a separate
 *   depletion timer that could drift out of sync.
 * - gateOpen<=0, already-depleted, or a locked leg: returns `state` unchanged.
 */
export function sandStep(
  state: LegState,
  gateOpen: number,
  dt: number,
  scenario: LegScenario,
): LegState {
  if (state.locked) return state;
  const g = clamp01(gateOpen);
  if (g <= 0 || state.sandLevel <= 0 || dt <= 0) return state;

  const floor = -scenario.sandUndershoot;
  const totalDrop = scenario.initialOffset - floor;
  const remaining = state.legOffsetY - floor;
  if (remaining <= 0) {
    // Already at/through the floor (shouldn't normally happen — depletion
    // clamps exactly at the floor below — but stay defensive/idempotent).
    if (state.legOffsetY === floor && state.sandLevel === 0) return state;
    return {
      ...state,
      legOffsetY: floor,
      alignmentError: Math.abs(floor),
      sandboxSupportY: floor,
      sandLevel: 0,
    };
  }

  const t = remaining / totalDrop; // 1 at start, → 0 at floor
  const easeFactor = SAND_EASE_MIN_FACTOR + (1 - SAND_EASE_MIN_FACTOR) * t;
  const rate = SAND_MAX_RATE * g * easeFactor; // units/s, strictly > 0 while g>0 & remaining>0
  const delta = Math.min(rate * dt, remaining); // never cross the floor

  const nextOffset = state.legOffsetY - delta;
  const nextRemaining = Math.max(0, nextOffset - floor);
  const nextSandLevel = totalDrop > 0 ? nextRemaining / totalDrop : 0;

  return {
    ...state,
    legOffsetY: nextOffset,
    alignmentError: Math.abs(nextOffset),
    sandboxSupportY: nextOffset, // jackExtension is 0 during sand phase
    sandLevel: nextSandLevel,
  };
}

/**
 * One confirmed pump stroke. Adaptive gain: inside ASSIST_RADIUS the stroke
 * consumes a fixed fraction (JACK_ADAPTIVE_GAIN) of the *remaining*
 * distance to target each pump — a bounded geometric approach that reaches
 * SNAP_TOLERANCE in roughly 4-9 pumps across the full sandUndershoot range
 * (see constants.ts JACK_ADAPTIVE_GAIN doc comment) — floored by
 * JACK_MIN_STROKE so the tail still finishes in finite pumps rather than
 * approaching 0 asymptotically. The stroke is always clamped to `remaining`
 * so legOffsetY can never exceed 0 (no overshoot), by construction, for any
 * number of repeated calls.
 */
export function jackStroke(state: LegState, scenario: LegScenario): LegState {
  if (state.locked) return state;
  const remaining = -state.legOffsetY;
  if (remaining <= 0) return state; // already at/above target — no-op

  let stroke: number;
  if (remaining <= ASSIST_RADIUS) {
    stroke = Math.max(remaining * JACK_ADAPTIVE_GAIN, JACK_MIN_STROKE);
  } else {
    stroke = JACK_MAX_STROKE * scenario.pumpGain;
  }
  stroke = Math.min(stroke, remaining); // NEVER overshoot 0

  const nextJackExtension = state.jackExtension + stroke;
  const nextOffset = Math.min(0, state.sandboxSupportY + nextJackExtension);

  return {
    ...state,
    jackExtension: nextJackExtension,
    legOffsetY: nextOffset,
    alignmentError: Math.abs(nextOffset),
  };
}

/** True once the leg is within SNAP_TOLERANCE of target. */
export function shouldSnap(state: LegState): boolean {
  return state.alignmentError <= SNAP_TOLERANCE;
}

/** Finalizes the last ≤SNAP_TOLERANCE gap: legOffsetY snaps exactly to 0. */
export function snap(state: LegState): LegState {
  if (state.locked) return state;
  return {
    ...state,
    legOffsetY: 0,
    alignmentError: 0,
    phase: 'snap',
  };
}

/**
 * Sets wedge insertion progress. Proximity magnetism (accelerating progress
 * near full insertion) is an INPUT-layer concern — this only clamps to
 * [0,1], as directed by the Wave 2 brief.
 */
export function wedgeDrag(state: LegState, progress: number): LegState {
  if (state.locked) return state;
  return { ...state, wedgeProgress: clamp01(progress) };
}

/** One confirmed hammer strike: locks the leg permanently. Idempotent. */
export function hammer(state: LegState): LegState {
  if (state.locked) return state;
  return {
    ...state,
    wedgeProgress: 1,
    locked: true,
    phase: 'locked',
  };
}

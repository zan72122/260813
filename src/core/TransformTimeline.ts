/**
 * TRANSFORM_TIMELINE — the single deterministic mapping table from
 * StageTransformProgress (p) to every mechanism/rig element, per
 * docs/STAGE_MECHANISM_ABSTRACTION.md's "progress -> 各要素の決定的マッピング" table.
 *
 * Everything here is data + pure functions of `p`. No timers, no tweening,
 * no hidden state: calling deriveTransformState(p) twice with the same p
 * MUST produce structurally identical output (invariant #1 in CONTRACTS.md).
 */
import type { StageTransformProgress } from './types';

/** A closed progress interval [start, end] over which one element animates. */
export interface ProgressRange {
  readonly start: number;
  readonly end: number;
}

export const TRANSFORM_TIMELINE = {
  /** rope travel: ropeOffset = p * ROPE_TOTAL_TRAVEL (meters). */
  ROPE_TOTAL_TRAVEL: 2.4,
  /** pulley rotation: theta = ropeOffset / PULLEY_RADIUS (radians). */
  PULLEY_RADIUS: 0.18,
  /** drum rotation: theta = ropeOffset / DRUM_RADIUS (radians). */
  DRUM_RADIUS: 0.22,
  /** counterweight: y = lerp(Y0, Y1, p). Understage spans y in [-3.2, 0]. */
  COUNTERWEIGHT_Y0: -2.6,
  COUNTERWEIGHT_Y1: -0.7,
  /** chariot (wing cart): old cart exits outward over this range. */
  CHARIOT_OLD: { start: 0, end: 0.9 } as ProgressRange,
  /** chariot (wing cart): new cart enters inward over this range. */
  CHARIOT_NEW: { start: 0.1, end: 1.0 } as ProgressRange,
  /**
   * Old wing pairs (3), far pair (i=0) first: pair i exits over
   * p in [0.05 + 0.1i, 0.55 + 0.1i].
   */
  OLD_WING_PAIRS: [
    { start: 0.05, end: 0.55 },
    { start: 0.15, end: 0.65 },
    { start: 0.25, end: 0.75 }
  ] as readonly ProgressRange[],
  /**
   * New wing pairs (3), near pair first: pair i enters over
   * p in [0.25 + 0.1i, 0.75 + 0.1i]. Overlaps OLD_WING_PAIRS so old/new
   * are simultaneously visible around p=0.5 (CONTRACTS invariant #3).
   */
  NEW_WING_PAIRS: [
    { start: 0.25, end: 0.75 },
    { start: 0.35, end: 0.85 },
    { start: 0.45, end: 0.95 }
  ] as readonly ProgressRange[],
  /** backdrop: old rolls up / new appears behind over this range. */
  BACKDROP: { start: 0.3, end: 0.8 } as ProgressRange,
  /** foreground props: old sinks below the floor over this range. */
  FOREGROUND_OLD: { start: 0.1, end: 0.4 } as ProgressRange,
  /** foreground props: new rises into place over this range. */
  FOREGROUND_NEW: { start: 0.6, end: 0.95 } as ProgressRange,
  /** lighting color/intensity blend: smoothstep(LIGHTING.start, LIGHTING.end, p). */
  LIGHTING: { start: 0.35, end: 0.9 } as ProgressRange,
  /** p > SNAP_HIGH snaps to 1.0 ("koton" thud). */
  SNAP_HIGH: 0.97,
  /** p < SNAP_LOW snaps to 0.0 (soft release). */
  SNAP_LOW: 0.03,
  /** One full rope stroke covers this fraction of viewport height. */
  STROKE_HEIGHT_FRACTION: 0.6,
  /** One full stroke yields this much progress delta (hand-over-hand pull). */
  STROKE_PROGRESS_DELTA: 0.35,
  /** Z offset step between wing-flat pairs to avoid z-fighting (meters). */
  WING_PAIR_Z_STEP: 0.05
} as const;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Standard smoothstep on [edge0, edge1], clamped outside the range. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Maps global progress p into an element's local 0..1 progress given its
 * active ProgressRange. Before range.start -> 0, after range.end -> 1,
 * linear in between. Pure and monotonic in p.
 */
export function localProgress(p: StageTransformProgress, range: ProgressRange): number {
  const span = range.end - range.start;
  if (span <= 0) return p >= range.end ? 1 : 0;
  return clamp01((clamp01(p) - range.start) / span);
}

/** Per-wing-pair derived local progress, paired with its z-fighting offset index. */
export interface WingPairState {
  readonly index: number;
  readonly localProgress: number;
  readonly zOffset: number;
}

/** Every derived rig quantity for a given global progress p. Pure function of p only. */
export interface TransformDerivedState {
  readonly p: StageTransformProgress;
  readonly ropeOffset: number;
  readonly pulleyAngle: number;
  readonly drumAngle: number;
  readonly counterweightY: number;
  readonly chariotOldProgress: number;
  readonly chariotNewProgress: number;
  readonly oldWingPairs: readonly WingPairState[];
  readonly newWingPairs: readonly WingPairState[];
  readonly backdropProgress: number;
  readonly foregroundOldProgress: number;
  readonly foregroundNewProgress: number;
  readonly lightingBlend: number;
}

/**
 * The single pure helper deriving every mechanism/rig element's local progress
 * (and simple derived kinematics) from global StageTransformProgress p.
 * No per-element timers; no dependency on previous frames. Calling this twice
 * with the same p returns deep-equal output (CONTRACTS invariant #1).
 */
export function deriveTransformState(p: StageTransformProgress): TransformDerivedState {
  const clamped = clamp01(p);
  const ropeOffset = clamped * TRANSFORM_TIMELINE.ROPE_TOTAL_TRAVEL;

  return {
    p: clamped,
    ropeOffset,
    pulleyAngle: ropeOffset / TRANSFORM_TIMELINE.PULLEY_RADIUS,
    drumAngle: ropeOffset / TRANSFORM_TIMELINE.DRUM_RADIUS,
    counterweightY: lerp(TRANSFORM_TIMELINE.COUNTERWEIGHT_Y0, TRANSFORM_TIMELINE.COUNTERWEIGHT_Y1, clamped),
    chariotOldProgress: localProgress(clamped, TRANSFORM_TIMELINE.CHARIOT_OLD),
    chariotNewProgress: localProgress(clamped, TRANSFORM_TIMELINE.CHARIOT_NEW),
    oldWingPairs: TRANSFORM_TIMELINE.OLD_WING_PAIRS.map((range, index) => ({
      index,
      localProgress: localProgress(clamped, range),
      zOffset: index * TRANSFORM_TIMELINE.WING_PAIR_Z_STEP
    })),
    newWingPairs: TRANSFORM_TIMELINE.NEW_WING_PAIRS.map((range, index) => ({
      index,
      localProgress: localProgress(clamped, range),
      zOffset: index * TRANSFORM_TIMELINE.WING_PAIR_Z_STEP
    })),
    backdropProgress: localProgress(clamped, TRANSFORM_TIMELINE.BACKDROP),
    foregroundOldProgress: localProgress(clamped, TRANSFORM_TIMELINE.FOREGROUND_OLD),
    foregroundNewProgress: localProgress(clamped, TRANSFORM_TIMELINE.FOREGROUND_NEW),
    lightingBlend: smoothstep(TRANSFORM_TIMELINE.LIGHTING.start, TRANSFORM_TIMELINE.LIGHTING.end, clamped)
  };
}

/**
 * Pure helper for stroke-based drag input: converts a vertical drag delta
 * (px, down positive) into a progress delta, per docs/STAGE_MECHANISM_ABSTRACTION.md
 * "ストローク仕様": dp = dy / (viewportHeight * STROKE_HEIGHT_FRACTION) * STROKE_PROGRESS_DELTA.
 */
export function dragDeltaToProgressDelta(dyPx: number, viewportHeightPx: number): number {
  if (viewportHeightPx <= 0) return 0;
  return (dyPx / (viewportHeightPx * TRANSFORM_TIMELINE.STROKE_HEIGHT_FRACTION)) * TRANSFORM_TIMELINE.STROKE_PROGRESS_DELTA;
}

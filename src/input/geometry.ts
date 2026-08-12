/**
 * Pure geometry/easing helpers used by attachInput.ts. Split out from the
 * gesture state machine so each piece is trivially unit-testable in
 * isolation (see tests/unit/game-input.test.ts).
 */
import type { HandleInfo } from '../contracts/handles';

/** PRODUCT_SPEC "近接吸着: 操作ハンドルの近く(半径96px)を触れば掴んだ扱い" — the generous effective grab radius floor. */
export const MIN_GRAB_RADIUS = 96;

/** Small-movement tolerance (CSS px) below which a pointerdown+pointerup pair counts as a tap, not a drag. */
export const TAP_MOVEMENT_TOLERANCE = 40;

/** Vertical/horizontal drag threshold (CSS px) for one half of a pump hysteresis cycle. */
export const PUMP_STROKE_THRESHOLD = 40;

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Effective grab radius for a handle: at least MIN_GRAB_RADIUS, but never smaller than the handle's own declared radius. */
export function effectiveRadius(handle: HandleInfo): number {
  return Math.max(handle.radius, MIN_GRAB_RADIUS);
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** True when (x,y) falls within `handle`'s effective (generous) grab radius. */
export function withinGrabRadius(handle: HandleInfo, x: number, y: number): boolean {
  return distance(x, y, handle.x, handle.y) <= effectiveRadius(handle);
}

/**
 * Projects a pointer's (dx,dy) displacement from its grab origin onto a
 * handle's declared drag axis: 'vertical' keeps only dy, 'horizontal' keeps
 * only dx (PRODUCT_SPEC "horizontal wander ±any is tolerated" for a
 * vertical-axis handle, and symmetrically for horizontal), and 'free'
 * (used by handles like the wedge, whose insertion direction can vary per
 * leg/orientation) uses the straight-line distance from the origin,
 * direction-agnostic.
 */
export function projectAlongAxis(axis: HandleInfo['axis'], dx: number, dy: number): number {
  if (axis === 'vertical') return dy;
  if (axis === 'horizontal') return dx;
  return Math.hypot(dx, dy);
}

const MAGNETIC_ZONE = 0.8;
const MAGNETIC_SNAP_AT = 0.95;

/**
 * Applies a magnetic "pull toward 1" ease once raw linear progress passes
 * MAGNETIC_ZONE (80%), reaching a full 1.0 once raw progress reaches
 * MAGNETIC_SNAP_AT (95%) — PRODUCT_SPEC "楔ドラッグ→吸着" (wedge drag →
 * magnetic seat). Below the zone, progress is untouched (linear). Pure and
 * monotonic in `raw` so it can never make progress decrease while the
 * player is still dragging forward.
 */
export function applyMagneticEase(raw: number): number {
  const r = clamp01(raw);
  if (r < MAGNETIC_ZONE) return r;
  if (r >= MAGNETIC_SNAP_AT) return 1;
  const t = (r - MAGNETIC_ZONE) / (MAGNETIC_SNAP_AT - MAGNETIC_ZONE);
  const eased = t * t * (3 - 2 * t); // smoothstep
  return MAGNETIC_ZONE + (1 - MAGNETIC_ZONE) * eased;
}

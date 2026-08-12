import { CAPTURE_RADIUS_MULTIPLIER, type Vec2 } from './types.ts';

export function distance2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Generous "is this drop close enough to count" test used across baskets and mat markers. */
export function isWithinCaptureRadius(dropPos: Vec2, targetPos: Vec2, targetRadius: number): boolean {
  return distance2(dropPos, targetPos) <= targetRadius * CAPTURE_RADIUS_MULTIPLIER;
}

export interface CaptureCandidate<T> {
  target: T;
  position: Vec2;
  radius: number;
}

export interface CaptureResult<T> {
  target: T;
  distance: number;
  withinRadius: boolean;
}

/**
 * Finds the nearest candidate to a drop position and reports whether the
 * drop lands within its (generous) capture radius. Returns null if there
 * are no candidates at all. Used for toy->basket and mat->marker snapping.
 */
export function findCaptureTarget<T>(
  dropPos: Vec2,
  candidates: readonly CaptureCandidate<T>[],
): CaptureResult<T> | null {
  let best: CaptureResult<T> | null = null;
  for (const c of candidates) {
    const d = distance2(dropPos, c.position);
    if (best === null || d < best.distance) {
      best = { target: c.target, distance: d, withinRadius: d <= c.radius * CAPTURE_RADIUS_MULTIPLIER };
    }
  }
  return best;
}

/**
 * During a drag, baskets within a wider "attention" radius (soft glow /
 * lean toward the toy) get a normalized proximity strength in [0, 1] for
 * scene-layer visual feedback. 0 = at attention-radius edge, 1 = at center.
 */
export function attentionStrength(dragPos: Vec2, targetPos: Vec2, targetRadius: number): number {
  const attentionRadius = targetRadius * CAPTURE_RADIUS_MULTIPLIER * 1.6;
  const d = distance2(dragPos, targetPos);
  if (d >= attentionRadius) return 0;
  return 1 - d / attentionRadius;
}

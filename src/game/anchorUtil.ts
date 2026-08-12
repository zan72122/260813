// src/game/anchorUtil.ts — Gameplay owner.
// Screen-space hit-testing against the (Renderer-published) AnchorRegistry,
// tuned for a 4-year-old's fat-finger accuracy and for "never dead-end":
// if a targeted anchor hasn't been published yet (renderer not ready / not
// wired in a given test), the verb is allowed rather than silently blocked.

import type { Anchor, AnchorId } from '../contracts/types';
import type { AnchorRegistry } from '../contracts/anchors';

/** Minimum hit-test padding per the input contract (age-4 tuned). */
export const MIN_HIT_PADDING = 36;

export function withinAnchor(x: number, y: number, anchor: Anchor, padding: number): boolean {
  const r = anchor.r + padding;
  const dx = x - anchor.x;
  const dy = y - anchor.y;
  return dx * dx + dy * dy <= r * r;
}

/**
 * True if the point (x,y) is an acceptable hit for anchor `id`:
 *  - anchor missing entirely (never published) -> true (don't block on a gap
 *    upstream; soft-lock prevention wins over precision)
 *  - anchor published but inactive -> false (renderer explicitly says "not now")
 *  - anchor published and active -> true only within its (padded) radius
 */
export function anchorAllows(
  anchors: AnchorRegistry,
  id: AnchorId,
  x: number,
  y: number,
  padding: number = MIN_HIT_PADDING,
): boolean {
  const anchor = anchors.get(id);
  if (!anchor) return true;
  if (!anchor.active) return false;
  return withinAnchor(x, y, anchor, padding);
}

// src/ui/hints.ts — pure, DOM-free logic: which anchor + gesture the hint
// layer should show for a given phase/state, and where to place it relative
// to a published Anchor without covering it. No imports beyond contracts
// *types* (type-only, no runtime coupling to other owners' modules).

import type { Anchor, AnchorId, GamePhase, GameState } from '../contracts/types';

export type HintGesture = 'drag-down' | 'drag-up' | 'drag-to' | 'tap' | 'tap-hold' | 'swipe-right';

export interface HintTarget {
  anchor: AnchorId;
  gesture: HintGesture;
}

/** Sub-step hint for the rivet relay, shared by the guided `rivetHeat..rivetHammer`
 * chain and the free-play `playRivet` phase (which reuses the same `rivet` sub-state
 * but never leaves a single top-level phase).
 *
 * The relay's "carry" step targets the `tongs` anchor, not a per-station
 * `workerN` anchor: the renderer only ever publishes `tongs` as active during
 * rivetCarry/playRivet's carry step (src/scene/index.ts's activePhaseSet), and
 * Gameplay's own `targetAnchor()` for this step returns `'tongs'` too (see
 * src/game/phases/rivet.ts) — `workerN` anchors exist for other purposes but
 * are never active here, so targeting one left the hint permanently hidden. */
function hintForRivetSubState(rivet: GameState['rivet']): HintTarget | null {
  if (rivet.temp < 1) return { anchor: 'forge', gesture: 'tap-hold' };
  if (rivet.station < 3) return { anchor: 'tongs', gesture: 'swipe-right' };
  if (!rivet.inserted) return { anchor: 'rivetHole', gesture: 'tap' };
  if (rivet.hits < 3) return { anchor: 'hammerSpot', gesture: 'tap' };
  return null;
}

/** Which anchor+gesture the hint layer should demonstrate for the current
 * phase, or null when the phase needs no hint (loading/title/opening/reveal/
 * complete/rivetCool are either non-interactive or purely observational). */
export function hintForPhase(phase: GamePhase, state: GameState): HintTarget | null {
  switch (phase) {
    case 'hookDown':
      return { anchor: 'hook', gesture: 'drag-down' };
    case 'hoist':
      return { anchor: 'hook', gesture: 'drag-up' };
    case 'align':
      return { anchor: 'beam', gesture: 'drag-to' };
    case 'bolts':
      return { anchor: state.bolts[0] ? 'bolt1' : 'bolt0', gesture: 'drag-to' };
    case 'rivetHeat':
      return { anchor: 'forge', gesture: 'tap-hold' };
    case 'rivetCarry':
      // See hintForRivetSubState's comment: gameplay/renderer both key this
      // step on the 'tongs' anchor, never a per-station worker anchor.
      return { anchor: 'tongs', gesture: 'swipe-right' };
    case 'rivetInsert':
      return { anchor: 'rivetHole', gesture: 'tap' };
    case 'rivetHammer':
      return { anchor: 'hammerSpot', gesture: 'tap' };
    case 'sling':
      return { anchor: 'slingClasp', gesture: 'tap' };
    case 'climb':
      return { anchor: 'climbLever', gesture: 'drag-up' };
    case 'playClimb':
      return { anchor: 'climbLever', gesture: 'drag-up' };
    case 'playRivet':
      return hintForRivetSubState(state.rivet);
    default:
      return null;
  }
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/**
 * Resolves the *actual* anchor the hint layer should render against for a
 * given target id: the target itself if it's currently active/published,
 * otherwise a fallback so a mis-targeted or not-yet-published anchor never
 * means "no guidance at all" for a child stuck on a phase.
 *
 * Fallback rule: the nearest *active* anchor to the target's last known
 * screen position (renderer publishes a position even for anchors it marks
 * inactive, so this is meaningful whenever the target has ever been seen),
 * or — if the target has never been published at all — the first active
 * anchor, since there is no position to measure "nearest" against. Returns
 * null only when nothing is active at all, in which case the caller should
 * fall back to `safeHintPosition`.
 */
export function resolveHintAnchor(targetId: AnchorId, allAnchors: readonly Anchor[]): Anchor | null {
  const target = allAnchors.find((a) => a.id === targetId);
  if (target?.active) return target;

  let best: Anchor | null = null;
  let bestDist = Infinity;
  for (const candidate of allAnchors) {
    if (!candidate.active) continue;
    const dist = target ? (candidate.x - target.x) ** 2 + (candidate.y - target.y) ** 2 : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/**
 * Places the hint pictogram just outside the anchor's hit circle, flipping
 * above/below to stay clear of the anchor, and clamped inside the viewport
 * with generous top/bottom safe margins so it never covers the interactive
 * target and never lands in the strips a thumb naturally rests in (the
 * bottom edge, or the top corner sound/pause buttons) — it's nudged inward
 * instead.
 */
export function placeHintNearAnchor(
  anchor: { x: number; y: number; r: number },
  viewport: Size,
  size: Size = { w: 88, h: 88 },
  gap = 20,
): Point {
  const wantAbove = anchor.y - anchor.r - gap - size.h / 2 >= size.h / 2;
  const y = wantAbove
    ? anchor.y - anchor.r - gap - size.h / 2
    : anchor.y + anchor.r + gap + size.h / 2;

  const edgeMargin = 12;
  // Thumb-rest / corner-button safe strips, degrading gracefully to a plain
  // edge margin on very short viewports where the full strip would leave no
  // usable room at all.
  const safeStrip = Math.min(size.h / 2 + 76, viewport.h / 2);
  const minX = size.w / 2 + edgeMargin;
  const maxX = Math.max(minX, viewport.w - size.w / 2 - edgeMargin);
  const minY = Math.max(size.h / 2 + edgeMargin, safeStrip);
  const maxY = Math.max(minY, viewport.h - safeStrip);

  return {
    x: Math.min(Math.max(anchor.x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

/** Absolute fallback position for when no active anchor exists at all to
 * place the hint relative to — centered horizontally, clear of both the top
 * corner controls and the bottom thumb-rest strip. */
export function safeHintPosition(viewport: Size, size: Size = { w: 88, h: 88 }): Point {
  const minY = size.h / 2 + 12;
  const maxY = Math.max(minY, viewport.h - size.h / 2 - 12);
  return {
    x: viewport.w / 2,
    y: Math.min(Math.max(viewport.h * 0.4, minY), maxY),
  };
}

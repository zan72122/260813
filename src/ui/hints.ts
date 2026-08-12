// src/ui/hints.ts — pure, DOM-free logic: which anchor + gesture the hint
// layer should show for a given phase/state, and where to place it relative
// to a published Anchor without covering it. No imports beyond contracts
// *types* (type-only, no runtime coupling to other owners' modules).

import type { AnchorId, GamePhase, GameState } from '../contracts/types';

export type HintGesture = 'drag-down' | 'drag-up' | 'drag-to' | 'tap' | 'tap-hold' | 'swipe-right';

export interface HintTarget {
  anchor: AnchorId;
  gesture: HintGesture;
}

const WORKER_ANCHORS: readonly AnchorId[] = ['worker0', 'worker1', 'worker2', 'worker3'];

function workerAnchorForStation(station: 0 | 1 | 2 | 3): AnchorId {
  return WORKER_ANCHORS[station] ?? 'worker0';
}

/** Sub-step hint for the rivet relay, shared by the guided `rivetHeat..rivetHammer`
 * chain and the free-play `playRivet` phase (which reuses the same `rivet` sub-state
 * but never leaves a single top-level phase). */
function hintForRivetSubState(rivet: GameState['rivet']): HintTarget | null {
  if (rivet.temp < 1) return { anchor: 'forge', gesture: 'tap-hold' };
  if (rivet.station < 3) return { anchor: workerAnchorForStation(rivet.station), gesture: 'swipe-right' };
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
      return { anchor: workerAnchorForStation(state.rivet.station), gesture: 'swipe-right' };
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
 * Places the hint pictogram just outside the anchor's hit circle, flipping
 * above/below to stay clear of the anchor and clamped inside the viewport so
 * it never covers the interactive target and never clips off-screen.
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
  const minX = size.w / 2 + 8;
  const maxX = Math.max(minX, viewport.w - size.w / 2 - 8);
  const minY = size.h / 2 + 8;
  const maxY = Math.max(minY, viewport.h - size.h / 2 - 8);
  return {
    x: Math.min(Math.max(anchor.x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
  };
}

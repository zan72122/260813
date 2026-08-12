// src/game/intents.ts — Gameplay owner.
// DOM-free description of a classified player input. src/input/** turns real
// pointer events into these; src/game/phases/** and tests both consume them
// without ever touching the DOM, so the whole loop is provable headlessly.

/** Screen-space swipe/scroll direction, low-precision (4-way) on purpose. */
export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export type GameIntent =
  /** Finger touched down (single pointer only; secondary pointers never reach here). */
  | { kind: 'down'; x: number; y: number; t: number }
  /** Finger moved while down. dx/dy are the delta since the previous move/down sample. */
  | { kind: 'move'; x: number; y: number; dx: number; dy: number; t: number }
  /** Finger lifted normally. */
  | { kind: 'up'; x: number; y: number; t: number }
  /** Gesture aborted (pointercancel / pointerleave) — no tap/swipe follows. */
  | { kind: 'cancel'; t: number }
  /** Classified at release: short + small movement (age-4 tuned thresholds). */
  | { kind: 'tap'; x: number; y: number; t: number }
  /** Classified at release: fast enough flick, low velocity threshold. */
  | { kind: 'swipe'; dir: SwipeDirection; vx: number; vy: number; x: number; y: number; t: number };

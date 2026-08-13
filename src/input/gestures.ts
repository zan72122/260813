// src/input/gestures.ts — Gameplay owner (src/input/**).
// Pure gesture classification, tuned for a 4-year-old: generous tap window,
// tiny movement tolerance, low swipe threshold. DOM-free and
// unit-testable on its own.
//
// Swipe detection scans the full down->up pointer-event history (real
// PointerEvent.timeStamp values) for ANY sliding window of cumulative
// displacement that crosses the threshold — it does NOT average velocity
// over the whole gesture or depend on render-frame timing. A rAF/main-thread
// hitch delays when the game *renders*, not when the browser *timestamps* an
// input event, so a decisive flick is found regardless of how choppy
// playback was around it. This also means a fast burst late in an otherwise
// slow gesture (or one with a stall in the middle) still registers, instead
// of being diluted into a sub-threshold whole-gesture average.

import type { SwipeDirection } from '../game/intents';

/** tap = <350ms and <14px movement, measured start->end. */
export const TAP_MAX_DURATION_MS = 350;
export const TAP_MAX_DIST_PX = 14;

/** Any window of the pointer-event history at most this long... */
export const SWIPE_WINDOW_MS = 600;
/** ...whose cumulative displacement on the dominant axis reaches this many px is a swipe. */
export const SWIPE_WINDOW_MIN_DISPLACEMENT_PX = 40;

export type ClassifiedGesture =
  | { kind: 'tap' }
  | { kind: 'swipe'; dir: SwipeDirection }
  | { kind: 'drag' };

/** One sample in a down->up pointer-event history. `t` must be a real event
 *  timestamp (e.g. PointerEvent.timeStamp) — never a rAF/render-frame time. */
export interface GesturePoint {
  x: number;
  y: number;
  t: number;
}

/**
 * Scans `history` for the earliest window (by real event timestamps, not
 * frame deltas) whose cumulative displacement on its dominant axis crosses
 * SWIPE_WINDOW_MIN_DISPLACEMENT_PX within SWIPE_WINDOW_MS. Runs in O(n) via a
 * two-pointer sweep: for each sample j, the window's start i is the oldest
 * sample still within SWIPE_WINDOW_MS of j, so every point is evaluated
 * against the true recent-history baseline regardless of any gaps (hitches)
 * between samples. Returns null if no window ever qualifies (tap/drag).
 */
export function detectWindowedSwipe(history: readonly GesturePoint[]): SwipeDirection | null {
  let i = 0;
  for (let j = 1; j < history.length; j += 1) {
    const pj = history[j];
    if (!pj) continue;
    let pi = history[i];
    while (pi && pj.t - pi.t > SWIPE_WINDOW_MS) {
      i += 1;
      pi = history[i];
    }
    if (!pi) continue;
    const dx = pj.x - pi.x;
    const dy = pj.y - pi.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx >= SWIPE_WINDOW_MIN_DISPLACEMENT_PX && adx >= ady) {
      return dx > 0 ? 'right' : 'left';
    }
    if (ady >= SWIPE_WINDOW_MIN_DISPLACEMENT_PX && ady > adx) {
      return dy > 0 ? 'down' : 'up';
    }
  }
  return null;
}

/**
 * Classifies a completed (pointerup) gesture from its full down->up
 * pointer-event history. `history` must contain at least the down and up
 * samples (two points); intermediate move samples make swipe detection more
 * precise but are not required. Tap is judged on overall start->end
 * duration/movement; swipe on the windowed-displacement scan above; anything
 * else (slow, long movement) is a plain drag.
 */
export function classifyGesture(history: readonly GesturePoint[]): ClassifiedGesture {
  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last) return { kind: 'drag' }; // malformed/empty history — never a valid gesture
  const durationMs = last.t - first.t;
  const distPx = Math.hypot(last.x - first.x, last.y - first.y);
  if (durationMs <= TAP_MAX_DURATION_MS && distPx <= TAP_MAX_DIST_PX) {
    return { kind: 'tap' };
  }
  const dir = detectWindowedSwipe(history);
  if (dir) return { kind: 'swipe', dir };
  return { kind: 'drag' };
}

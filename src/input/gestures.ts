// src/input/gestures.ts — Gameplay owner (src/input/**).
// Pure gesture classification, tuned for a 4-year-old: generous tap window,
// tiny movement tolerance, low swipe-velocity threshold. DOM-free and
// unit-testable on its own.

import type { SwipeDirection } from '../game/intents';

/** tap = <350ms and <14px movement. */
export const TAP_MAX_DURATION_MS = 350;
export const TAP_MAX_DIST_PX = 14;
/** LOW velocity threshold (px/ms) so a gentle flick still counts as a swipe. */
export const SWIPE_MIN_VELOCITY_PX_MS = 0.15;

export type ClassifiedGesture =
  | { kind: 'tap' }
  | { kind: 'swipe'; dir: SwipeDirection }
  | { kind: 'drag' };

export interface GestureSample {
  durationMs: number;
  distPx: number;
  /** px/ms */
  vx: number;
  /** px/ms */
  vy: number;
}

/** Classifies a completed (pointerup) gesture from its down->up summary. */
export function classifyGesture(sample: GestureSample): ClassifiedGesture {
  if (sample.durationMs <= TAP_MAX_DURATION_MS && sample.distPx <= TAP_MAX_DIST_PX) {
    return { kind: 'tap' };
  }
  const speed = Math.hypot(sample.vx, sample.vy);
  if (speed >= SWIPE_MIN_VELOCITY_PX_MS) {
    const dir: SwipeDirection =
      Math.abs(sample.vx) > Math.abs(sample.vy)
        ? sample.vx > 0
          ? 'right'
          : 'left'
        : sample.vy > 0
          ? 'down'
          : 'up';
    return { kind: 'swipe', dir };
  }
  return { kind: 'drag' };
}

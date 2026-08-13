// src/input/index.ts — Gameplay owner.
// One-finger pointer handling on the provided element. Converts raw
// pointer events into DOM-free GameIntent values and classifies the
// completed gesture (tap/swipe) via the pure classifier in gestures.ts.
// `touch-action: none` is set by UX's styles; secondary pointers are
// ignored entirely (no multi-touch effects, no double-fire).

import { classifyGesture } from './gestures';
import type { GesturePoint } from './gestures';
import type { GameIntent } from '../game/intents';

export interface PointerInputHandle {
  dispose(): void;
}

export function createPointerInput(o: {
  element: HTMLElement;
  onIntent: (intent: GameIntent) => void;
}): PointerInputHandle {
  const { element, onIntent } = o;

  let activePointerId: number | null = null;
  let downX = 0;
  let downY = 0;
  let downT = 0;
  let lastX = 0;
  let lastY = 0;
  // Full down->up sample history (real event timestamps) so swipe
  // classification can scan a sliding window instead of averaging velocity
  // over the whole gesture — see gestures.ts for why that matters.
  let history: GesturePoint[] = [];

  function onPointerDown(e: PointerEvent): void {
    if (activePointerId !== null || !e.isPrimary) return;
    activePointerId = e.pointerId;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    downT = e.timeStamp;
    history = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
    onIntent({ kind: 'down', x: e.clientX, y: e.clientY, t: e.timeStamp });
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== activePointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx === 0 && dy === 0) return;
    history.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    onIntent({ kind: 'move', x: e.clientX, y: e.clientY, dx, dy, t: e.timeStamp });
  }

  function endGesture(e: PointerEvent, cancelled: boolean): void {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;

    if (cancelled) {
      history = [];
      onIntent({ kind: 'cancel', t: e.timeStamp });
      return;
    }

    onIntent({ kind: 'up', x: e.clientX, y: e.clientY, t: e.timeStamp });

    history.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    const durationMs = e.timeStamp - downT;
    // Whole-gesture average velocity: kept only for the swipe payload (e.g.
    // hoist's sway physics wants a feel-based px/ms), never for deciding
    // swipe-vs-not — that decision now belongs to classifyGesture's windowed
    // scan over `history`.
    const vx = durationMs > 0 ? (e.clientX - downX) / durationMs : 0;
    const vy = durationMs > 0 ? (e.clientY - downY) / durationMs : 0;
    const gesture = classifyGesture(history);
    history = [];

    if (gesture.kind === 'tap') {
      onIntent({ kind: 'tap', x: e.clientX, y: e.clientY, t: e.timeStamp });
    } else if (gesture.kind === 'swipe') {
      onIntent({ kind: 'swipe', dir: gesture.dir, vx, vy, x: e.clientX, y: e.clientY, t: e.timeStamp });
    }
  }

  function onPointerUp(e: PointerEvent): void {
    endGesture(e, false);
  }
  function onPointerCancel(e: PointerEvent): void {
    endGesture(e, true);
  }
  function onPointerLeave(e: PointerEvent): void {
    endGesture(e, true);
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('pointerleave', onPointerLeave);

  function dispose(): void {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('pointerleave', onPointerLeave);
  }

  return { dispose };
}

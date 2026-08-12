// src/input/pointer.ts
// DOM pointer layer for the canvas: tap/whistle-blow/long-press detection and
// the valve-turn circular gesture, wired to the shared EventBus per
// docs/CONTRACTS.md ("Worker C: registerInput(ctx)").

import type { GamePhase, SceneContext } from '../contracts';
import { createCircularGestureTracker } from './circularGesture';
import { getWhistleHotspot, isInsideHotspot } from './hotspots';

/** Large tolerance so an imprecise child tap still counts as a tap, not a drag. */
const TAP_MOVE_TOLERANCE_PX = 28;
const TAP_MAX_DURATION_MS = 350;
const LONG_PRESS_MIN_DURATION_MS = 350;
const LONG_PRESS_MAX_DURATION_MS = 1500;
/** Suppresses iOS Safari's legacy double-tap-to-zoom fallback. */
const DOUBLE_TAP_ZOOM_GUARD_MS = 350;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Tracks which canvases already have a live registration, to guard re-init. */
const activeCleanups = new WeakMap<HTMLElement, () => void>();

/**
 * Wires pointer/touch input on ctx.renderer.domElement to ActionIntents.
 * Safe to call repeatedly on the same canvas: any previous registration is
 * torn down first. Returns a cleanup function.
 */
export function registerInput(ctx: SceneContext): () => void {
  const canvas = ctx.renderer.domElement;

  // Idempotency: never stack duplicate listeners across re-init.
  activeCleanups.get(canvas)?.();

  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';

  let phase: GamePhase = 'title';
  const unsubscribePhase = ctx.bus.onEvent((event) => {
    if (event.kind === 'phase-changed') phase = event.phase;
  });

  const gesture = createCircularGestureTracker();

  let activePointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startT = 0;
  let moved = false;

  function toNormalized(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return {
      x: clamp01((clientX - rect.left) / w),
      y: clamp01((clientY - rect.top) / h),
    };
  }

  function emitTap(x: number, y: number): void {
    ctx.bus.emitIntent({ kind: 'tap', x, y });
    const hotspot = getWhistleHotspot();
    if (isInsideHotspot(x, y, hotspot)) {
      ctx.bus.emitIntent({ kind: 'whistle-blow' });
    }
  }

  function onPointerDown(e: PointerEvent): void {
    // One-finger only: ignore additional simultaneous touches.
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    moved = false;

    if (phase === 'valve-turn') {
      gesture.reset();
      gesture.addSample({ x: e.clientX, y: e.clientY, t: startT / 1000 });
    }

    canvas.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.hypot(dx, dy) > TAP_MOVE_TOLERANCE_PX) moved = true;

    if (phase === 'valve-turn') {
      const result = gesture.addSample({ x: e.clientX, y: e.clientY, t: performance.now() / 1000 });
      if (result) {
        ctx.bus.emitIntent({
          kind: 'valve-rotate',
          deltaAngleRad: result.deltaAngleRad,
          angularVelocityRadPerSec: result.angularVelocityRadPerSec,
        });
      }
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== activePointerId) return;
    const duration = performance.now() - startT;
    const { x, y } = toNormalized(e.clientX, e.clientY);
    activePointerId = null;

    if (!moved && duration <= TAP_MAX_DURATION_MS) {
      emitTap(x, y);
    } else if (
      !moved &&
      duration > LONG_PRESS_MIN_DURATION_MS &&
      duration <= LONG_PRESS_MAX_DURATION_MS
    ) {
      // Short long-press also counts as a whistle-blow (child UX: a held
      // finger on/near the whistle is as valid as a tap).
      ctx.bus.emitIntent({ kind: 'whistle-blow' });
    }

    if (phase === 'valve-turn') gesture.reset();
  }

  function onPointerCancel(e: PointerEvent): void {
    if (e.pointerId === activePointerId) {
      activePointerId = null;
      if (phase === 'valve-turn') gesture.reset();
    }
  }

  function preventDefault(e: Event): void {
    e.preventDefault();
  }

  let lastTouchEnd = 0;
  function onTouchEnd(e: Event): void {
    const now = Date.now();
    if (now - lastTouchEnd < DOUBLE_TAP_ZOOM_GUARD_MS) e.preventDefault();
    lastTouchEnd = now;
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  // touch-action:none already blocks native scroll/zoom on modern engines;
  // these are a defensive backstop for older iOS Safari behavior.
  canvas.addEventListener('touchstart', preventDefault, { passive: false });
  canvas.addEventListener('touchmove', preventDefault, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  // Non-standard iOS Safari gesture events (pinch) — typed generically.
  canvas.addEventListener('gesturestart', preventDefault as EventListener);
  canvas.addEventListener('gesturechange', preventDefault as EventListener);
  canvas.addEventListener('contextmenu', preventDefault);

  function cleanup(): void {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('touchstart', preventDefault);
    canvas.removeEventListener('touchmove', preventDefault);
    canvas.removeEventListener('touchend', onTouchEnd);
    canvas.removeEventListener('gesturestart', preventDefault as EventListener);
    canvas.removeEventListener('gesturechange', preventDefault as EventListener);
    canvas.removeEventListener('contextmenu', preventDefault);
    unsubscribePhase();
    activeCleanups.delete(canvas);
  }

  activeCleanups.set(canvas, cleanup);
  return cleanup;
}

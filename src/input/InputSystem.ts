import { clamp01, dragDeltaToProgressDelta } from '../core';
import type { ActionIntent, InputSystem as InputSystemContract } from '../core';

type InputMode = 'tap' | 'lock' | 'rope' | 'choice' | 'none';

/** A short downward swipe releases the rope lock (docs/MASTER_SPEC.md unlock phase). */
const LOCK_SWIPE_MIN_DY_PX = 24;
const LOCK_SWIPE_MAX_DURATION_MS = 600;
/** Pointer movement below this is still considered a tap, not a drag. */
const TAP_MAX_MOVEMENT_PX = 12;

// ---- pure helpers (unit-tested directly, no DOM required) ----

/**
 * Vertical-drag -> progress-delta conversion, per docs/MASTER_SPEC.md /
 * docs/STAGE_MECHANISM_ABSTRACTION.md "ストローク仕様": dp = dy / (viewportHeight * 0.6) * 0.35.
 * The horizontal component (dxPx) is intentionally unused: diagonal drags are
 * corrected to their Y-component only, so a diagonal stroke yields the same
 * deltaProgress as a purely vertical stroke covering the same dy. Delegates
 * the actual formula to core's dragDeltaToProgressDelta (single source of
 * truth for the MASTER_SPEC stroke constants) rather than duplicating it.
 */
export function computeRopeDeltaProgress(dxPx: number, dyPx: number, viewportHeightPx: number): number {
  void dxPx; // diagonal correction: X component never contributes to progress
  return dragDeltaToProgressDelta(dyPx, viewportHeightPx);
}

/** Normalizes a client-space point to element-local 0..1 coordinates, clamped in range. */
export function normalizePointerPosition(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): { x: number; y: number } {
  const rawX = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const rawY = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: clamp01(rawX), y: clamp01(rawY) };
}

/** True if the pointer-up gesture (tap OR short downward swipe) should release the rope lock. */
export function isLockReleaseGesture(dyPx: number, durationMs: number, moved: boolean): boolean {
  const isTap = !moved;
  const isShortDownSwipe = dyPx >= LOCK_SWIPE_MIN_DY_PX && durationMs <= LOCK_SWIPE_MAX_DURATION_MS;
  return isTap || isShortDownSwipe;
}

interface PointerTrack {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  lastY: number;
  readonly startTimeMs: number;
  moved: boolean;
}

/**
 * Real DOM implementation: pointer events -> ActionIntent, per
 * docs/CONTRACTS_ADDENDUM.md ("C's InputSystem is DOM-layer only, no game
 * logic beyond the MASTER_SPEC stroke-delta conversion").
 *
 * - pointer events only (no separate touch/mouse handling; works for mouse
 *   too, for desktop debugging).
 * - touch scroll / pinch-zoom / double-tap-zoom suppressed via touch-action:
 *   none plus preventDefault on the gesture-capable native events.
 * - mode 'tap': tap (pointerdown+up with little movement) -> normalized tap.
 * - mode 'lock': tap or short downward swipe -> lockRelease.
 * - mode 'rope': vertical drag -> ropeGrab/ropeDrag(deltaProgress)/ropeRelease.
 * - mode 'choice': treated like 'tap' as a canvas-level fallback — the
 *   choice screen's picture buttons are DOM elements owned by UiSystem and
 *   normally intercept the pointer before it reaches the canvas.
 * - mode 'none': input is inert.
 */
export class InputSystem implements InputSystemContract {
  private element: HTMLElement | null = null;
  private callback: ((intent: ActionIntent) => void) | null = null;
  private mode: InputMode = 'none';
  private track: PointerTrack | null = null;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.element || !this.callback) return;
    if (this.mode === 'none') return;
    // Only track the primary contact point; ignore secondary touches (pinch).
    if (this.track !== null) return;

    event.preventDefault();
    this.track = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      startTimeMs: nowMs(),
      moved: false
    };
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // Some environments (jsdom-less test doubles) may not implement pointer capture.
    }

    if (this.mode === 'rope') {
      const rect = this.element.getBoundingClientRect();
      const { y } = normalizePointerPosition(event.clientX, event.clientY, rect);
      this.callback({ kind: 'ropeGrab', y });
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const track = this.track;
    if (!track || track.pointerId !== event.pointerId || !this.callback) return;

    const dx = event.clientX - track.startX;
    const dyFromStart = event.clientY - track.startY;
    if (Math.hypot(dx, dyFromStart) > TAP_MAX_MOVEMENT_PX) track.moved = true;

    if (this.mode === 'rope') {
      event.preventDefault();
      const dy = event.clientY - track.lastY;
      track.lastY = event.clientY;
      if (dy !== 0) {
        const viewportHeight = window.innerHeight || this.element?.clientHeight || 0;
        const deltaProgress = computeRopeDeltaProgress(dx, dy, viewportHeight);
        if (deltaProgress !== 0) this.callback({ kind: 'ropeDrag', deltaProgress });
      }
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const track = this.track;
    if (!track || track.pointerId !== event.pointerId) return;
    this.track = null;
    if (!this.callback) return;

    const dyFromStart = event.clientY - track.startY;
    const durationMs = nowMs() - track.startTimeMs;

    if (this.mode === 'rope') {
      this.callback({ kind: 'ropeRelease' });
    } else if (this.mode === 'lock') {
      if (isLockReleaseGesture(dyFromStart, durationMs, track.moved)) {
        this.callback({ kind: 'lockRelease' });
      }
    } else if ((this.mode === 'tap' || this.mode === 'choice') && !track.moved && this.element) {
      const rect = this.element.getBoundingClientRect();
      const { x, y } = normalizePointerPosition(event.clientX, event.clientY, rect);
      this.callback({ kind: 'tap', x, y });
    }
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    const track = this.track;
    if (!track || track.pointerId !== event.pointerId) return;
    this.track = null;
    if (this.mode === 'rope') this.callback?.({ kind: 'ropeRelease' });
  };

  /** Safari's non-standard pinch-zoom gesture events (no 2-pointer PointerEvent equivalent). */
  private readonly handleGestureStart = (event: Event): void => {
    event.preventDefault();
  };

  private readonly handleTouchMove = (event: TouchEvent): void => {
    // Belt-and-braces alongside touch-action:none — blocks scroll/pinch on
    // browsers that still dispatch a cancelable touchmove.
    if (event.cancelable) event.preventDefault();
  };

  private readonly handleContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  attach(el: HTMLElement): void {
    this.element = el;
    el.style.touchAction = 'none';
    (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
    el.style.userSelect = 'none';

    el.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    el.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    el.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    el.addEventListener('pointercancel', this.handlePointerCancel, { passive: false });
    el.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    el.addEventListener('contextmenu', this.handleContextMenu);
    el.addEventListener('gesturestart', this.handleGestureStart as EventListener);
  }

  onIntent(cb: (intent: ActionIntent) => void): void {
    this.callback = cb;
  }

  setMode(mode: InputMode): void {
    this.mode = mode;
    this.track = null;
  }

  dispose(): void {
    const el = this.element;
    if (el) {
      el.removeEventListener('pointerdown', this.handlePointerDown);
      el.removeEventListener('pointermove', this.handlePointerMove);
      el.removeEventListener('pointerup', this.handlePointerUp);
      el.removeEventListener('pointercancel', this.handlePointerCancel);
      el.removeEventListener('touchmove', this.handleTouchMove);
      el.removeEventListener('contextmenu', this.handleContextMenu);
      el.removeEventListener('gesturestart', this.handleGestureStart as EventListener);
    }
    this.element = null;
    this.callback = null;
    this.track = null;
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Null-object stub — kept as the documented fallback path. `App.ts` (owned by
 * the Integrator, read-only for this area) currently wires this in; swapping
 * in the real `InputSystem` above requires an App.ts change (see report).
 * This placeholder only wires pointerdown -> 'tap' so the app boots
 * end-to-end; it deliberately holds no game logic (per docs/CONTRACTS.md
 * boundary).
 */
export class NullInputSystem implements InputSystemContract {
  private element: HTMLElement | null = null;
  private callback: ((intent: ActionIntent) => void) | null = null;
  private mode: InputMode = 'none';

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const el = this.element;
    if (!el || !this.callback) return;
    const rect = el.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    this.callback({ kind: 'tap', x, y });
  };

  attach(el: HTMLElement): void {
    this.element = el;
    el.addEventListener('pointerdown', this.handlePointerDown);
  }

  onIntent(cb: (intent: ActionIntent) => void): void {
    this.callback = cb;
  }

  setMode(mode: InputMode): void {
    this.mode = mode;
  }

  getMode(): InputMode {
    return this.mode;
  }

  dispose(): void {
    this.element?.removeEventListener('pointerdown', this.handlePointerDown);
    this.element = null;
    this.callback = null;
  }
}

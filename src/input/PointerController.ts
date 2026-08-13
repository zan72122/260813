/**
 * Generic single-active-pointer input primitive. Pointer Events only.
 * Knows nothing about the 3D scene or game semantics — it just reports
 * down/move/up in client (CSS pixel) coordinates and classifies a release
 * as a tap when movement stayed small and duration stayed short. All
 * gesture semantics (drag/swipe/trace/hold interpretation) live in the
 * scene-layer InteractionController that consumes these callbacks.
 */
export interface PointerHandlers {
  onDown: (clientX: number, clientY: number, pointerType: string) => void;
  onMove: (clientX: number, clientY: number) => void;
  onUp: (clientX: number, clientY: number, wasTap: boolean) => void;
  /**
   * M9 fix (fix-round-1): pointercancel is now routed to its own callback
   * instead of being forwarded through onUp with the cancel event's own
   * (often 0,0 or otherwise unreliable — the spec doesn't guarantee a
   * meaningful position) clientX/clientY. A caller that used those
   * coordinates for a completion threshold (e.g. "dragged up far enough")
   * could have a cancel accidentally satisfy it. onCancel takes no
   * coordinates at all, forcing every consumer to treat it as an abort.
   */
  onCancel: () => void;
  /** Fired on every down/move — used to reset the idle hint timer. */
  onActivity: () => void;
}

const TAP_MOVE_THRESHOLD_PX = 10;
const TAP_MAX_DURATION_MS = 500;

export class PointerController {
  private target: HTMLElement;
  private handlers: PointerHandlers;
  private activePointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private moved = false;

  constructor(target: HTMLElement, handlers: PointerHandlers) {
    this.target = target;
    this.handlers = handlers;
    this.target.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleCancel);
  }

  dispose(): void {
    this.target.removeEventListener('pointerdown', this.handleDown);
    window.removeEventListener('pointermove', this.handleMove);
    window.removeEventListener('pointerup', this.handleUp);
    window.removeEventListener('pointercancel', this.handleCancel);
  }

  private handleDown = (e: PointerEvent): void => {
    if (this.activePointerId !== null) return; // ignore extra touches while one is active
    this.activePointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTime = performance.now();
    this.moved = false;
    this.handlers.onActivity();
    this.handlers.onDown(e.clientX, e.clientY, e.pointerType);
  };

  private handleMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD_PX) this.moved = true;
    this.handlers.onActivity();
    this.handlers.onMove(e.clientX, e.clientY);
  };

  private handleUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    const duration = performance.now() - this.startTime;
    const wasTap = !this.moved && duration <= TAP_MAX_DURATION_MS;
    this.handlers.onUp(e.clientX, e.clientY, wasTap);
  };

  private handleCancel = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.handlers.onCancel();
  };
}

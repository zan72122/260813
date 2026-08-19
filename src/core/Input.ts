import * as THREE from 'three';

export interface Touch2D {
  /** normalised device coords, -1..1 */
  ndc: THREE.Vector2;
  /** css pixels */
  px: THREE.Vector2;
}

type Handler = (t: Touch2D) => void;

/**
 * One finger only. Pointer Events cover Safari touch and desktop mouse, and we
 * deliberately ignore every secondary pointer so a 4-year-old resting a palm on
 * the screen cannot break the drag.
 */
export class Input {
  readonly down: Handler[] = [];
  readonly move: Handler[] = [];
  readonly up: Handler[] = [];
  isDown = false;
  readonly current: Touch2D = { ndc: new THREE.Vector2(), px: new THREE.Vector2() };
  readonly start: Touch2D = { ndc: new THREE.Vector2(), px: new THREE.Vector2() };
  /** seconds the current press has been held */
  holdTime = 0;
  private activeId: number | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    el.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp, { passive: false });
    window.addEventListener('pointercancel', this.onUp, { passive: false });
    // Safari still fires these for double-tap zoom / rubber-band scroll.
    el.addEventListener('touchstart', prevent, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('gesturestart', prevent as EventListener);
    document.addEventListener('dblclick', prevent as EventListener);
  }

  private fill(t: Touch2D, e: PointerEvent) {
    const w = window.innerWidth, h = window.innerHeight;
    t.px.set(e.clientX, e.clientY);
    t.ndc.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
  }

  private onDown = (e: PointerEvent) => {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.isDown = true;
    this.holdTime = 0;
    this.fill(this.current, e);
    this.start.ndc.copy(this.current.ndc);
    this.start.px.copy(this.current.px);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    for (const h of this.down) h(this.current);
  };

  private onMove = (e: PointerEvent) => {
    if (this.activeId !== e.pointerId) return;
    this.fill(this.current, e);
    for (const h of this.move) h(this.current);
  };

  private onUp = (e: PointerEvent) => {
    if (this.activeId !== e.pointerId) return;
    this.activeId = null;
    this.isDown = false;
    this.fill(this.current, e);
    for (const h of this.up) h(this.current);
  };

  tick(dt: number) { if (this.isDown) this.holdTime += dt; }
}

function prevent(e: Event) {
  if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 1) { e.preventDefault(); return; }
  e.preventDefault();
}

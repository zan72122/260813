import * as THREE from 'three';

export interface DragState {
  /** Current pointer position, normalized device coords (-1..1). */
  ndc: THREE.Vector2;
  /** Where the drag began, NDC. */
  startNdc: THREE.Vector2;
  /** Total movement since start, NDC units. */
  delta: THREE.Vector2;
  /** Movement since last frame, NDC units. */
  frameDelta: THREE.Vector2;
  /** Seconds since the drag started. */
  age: number;
}

export interface InputHandlers {
  onDown?: (d: DragState) => void;
  onDrag?: (d: DragState) => void;
  onUp?: (d: DragState) => void;
}

/**
 * One finger only. First pointer wins; additional touches are ignored so a
 * resting palm or a second small hand never breaks a gesture.
 */
export class Input {
  private el: HTMLElement;
  private activeId: number | null = null;
  private state: DragState = {
    ndc: new THREE.Vector2(),
    startNdc: new THREE.Vector2(),
    delta: new THREE.Vector2(),
    frameDelta: new THREE.Vector2(),
    age: 0
  };
  private last = new THREE.Vector2();
  handlers: InputHandlers = {};
  down = false;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
  }

  private toNdc(e: PointerEvent): THREE.Vector2 {
    const r = this.el.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  }

  private onDown = (e: PointerEvent): void => {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    const p = this.toNdc(e);
    this.state.ndc.copy(p);
    this.state.startNdc.copy(p);
    this.state.delta.set(0, 0);
    this.state.frameDelta.set(0, 0);
    this.state.age = 0;
    this.last.copy(p);
    this.down = true;
    this.handlers.onDown?.(this.state);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    const p = this.toNdc(e);
    this.state.frameDelta.subVectors(p, this.last);
    this.last.copy(p);
    this.state.ndc.copy(p);
    this.state.delta.subVectors(p, this.state.startNdc);
    this.handlers.onDrag?.(this.state);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.down = false;
    this.handlers.onUp?.(this.state);
  };

  tick(dt: number): void {
    if (this.down) this.state.age += dt;
    else this.state.frameDelta.set(0, 0);
  }
}

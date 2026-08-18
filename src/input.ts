import * as THREE from 'three';

export interface PointerState {
  id: number;
  down: boolean;
  /** css px */
  x: number; y: number;
  startX: number; startY: number;
  /** 直近フレーム間の移動量 css px */
  dx: number; dy: number;
  /** px/s */
  vx: number; vy: number;
  downTime: number;
  /** NDC -1..1 */
  ndc: THREE.Vector2;
  /** 円運動検出用: 移動方向の累積曲率 (rad)。1周 ≈ ±2π */
  winding: number;
  totalDist: number;
}

export interface InputHandler {
  onDown?(p: PointerState): void;
  onMove?(p: PointerState): void;
  onUp?(p: PointerState): void;
}

/**
 * PointerManager — 一次ポインタのみをゲーム操作に採用する。
 * (二指目は無視。ピンチ要求なし)
 */
export class InputManager {
  readonly p: PointerState = {
    id: -1, down: false, x: 0, y: 0, startX: 0, startY: 0,
    dx: 0, dy: 0, vx: 0, vy: 0, downTime: 0,
    ndc: new THREE.Vector2(), winding: 0, totalDist: 0,
  };
  handler: InputHandler | null = null;
  /** 最後に意味のある操作をした時刻 */
  lastActive = performance.now();
  private el: HTMLElement;
  private raycaster = new THREE.Raycaster();
  onFirstGesture: (() => void) | null = null;
  private firstDone = false;
  private prevDir = new THREE.Vector2();
  private hasPrevDir = false;
  enabled = true;

  constructor(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up, { passive: false });
    el.addEventListener('pointercancel', this.up, { passive: false });
    // Safari のダブルタップズーム等を防止
    el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
  }

  private updNdc() {
    const r = this.el.getBoundingClientRect();
    this.p.ndc.set(
      ((this.p.x - r.left) / r.width) * 2 - 1,
      -((this.p.y - r.top) / r.height) * 2 + 1,
    );
  }

  private down = (e: PointerEvent) => {
    e.preventDefault();
    if (!this.firstDone) {
      this.firstDone = true;
      this.onFirstGesture?.();
    }
    if (this.p.down) return; // 2本目は無視
    try { this.el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const p = this.p;
    p.id = e.pointerId;
    p.down = true;
    p.x = p.startX = e.clientX;
    p.y = p.startY = e.clientY;
    p.dx = p.dy = p.vx = p.vy = 0;
    p.downTime = performance.now();
    p.winding = 0;
    p.totalDist = 0;
    this.hasPrevDir = false;
    this.updNdc();
    this.lastActive = performance.now();
    if (this.enabled) this.handler?.onDown?.(p);
  };

  private move = (e: PointerEvent) => {
    e.preventDefault();
    const p = this.p;
    if (!p.down || e.pointerId !== p.id) return;
    const now = performance.now();
    const dt = Math.max(1, now - (this as any)._lastMove || 16) / 1000;
    (this as any)._lastMove = now;
    p.dx = e.clientX - p.x;
    p.dy = e.clientY - p.y;
    p.vx = p.vx * 0.7 + (p.dx / dt) * 0.3;
    p.vy = p.vy * 0.7 + (p.dy / dt) * 0.3;
    p.totalDist += Math.hypot(p.dx, p.dy);
    // 円運動: 移動方向の曲率を累積 (中心位置に依存しない)
    if (Math.hypot(p.dx, p.dy) > 3) {
      if (this.hasPrevDir) {
        const a0 = Math.atan2(this.prevDir.y, this.prevDir.x);
        const a1 = Math.atan2(p.dy, p.dx);
        let da = a1 - a0;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        p.winding += da;
      }
      this.prevDir.set(p.dx, p.dy);
      this.hasPrevDir = true;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    this.updNdc();
    this.lastActive = now;
    if (this.enabled) this.handler?.onMove?.(p);
  };

  private up = (e: PointerEvent) => {
    const p = this.p;
    if (e.pointerId !== p.id) return;
    p.down = false;
    this.updNdc();
    this.lastActive = performance.now();
    if (this.enabled) this.handler?.onUp?.(p);
  };

  /** ndc から平面 y=h への交点 */
  planeHit(camera: THREE.Camera, h = 0, out = new THREE.Vector3()): THREE.Vector3 {
    this.raycaster.setFromCamera(this.p.ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h);
    this.raycaster.ray.intersectPlane(plane, out);
    return out;
  }

  /** ndc から任意平面への交点 */
  customPlaneHit(camera: THREE.Camera, plane: THREE.Plane, out = new THREE.Vector3()): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.p.ndc, camera);
    return this.raycaster.ray.intersectPlane(plane, out);
  }

  /** world 座標 → css px */
  static toScreen(v: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } {
    const p = v.clone().project(camera);
    return {
      x: (p.x * 0.5 + 0.5) * window.innerWidth,
      y: (-p.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** オブジェクトへのヒットテスト(半径付き寛容判定は呼び出し側で) */
  hitObjects(camera: THREE.Camera, objs: THREE.Object3D[]): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.p.ndc, camera);
    return this.raycaster.intersectObjects(objs, true);
  }
}

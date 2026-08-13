import type { Camera } from './camera';

export interface Touch {
  /** world 座標 */
  x: number;
  y: number;
  /** 画面座標（CSS px） */
  sx: number;
  sy: number;
}

export type TouchHandler = (t: Touch) => void;

/**
 * 一本指だけの入力。
 * 2本目以降の指は完全に無視する（4歳児の手のひらが触れても壊れないように）。
 * マウス／タッチ／ペンは PointerEvent で統一。
 */
export class Input {
  private activeId: number | null = null;
  down = false;
  current: Touch = { x: 0, y: 0, sx: 0, sy: 0 };

  onDown: TouchHandler = () => {};
  onMove: TouchHandler = () => {};
  onUp: TouchHandler = () => {};

  constructor(
    private el: HTMLElement,
    private cam: Camera,
  ) {
    el.addEventListener('pointerdown', this.handleDown, { passive: false });
    el.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp, { passive: false });
    window.addEventListener('pointercancel', this.handleUp, { passive: false });
    // ダブルタップ拡大・スクロール・引っぱり更新を止める
    el.addEventListener('touchstart', preventIfMulti, { passive: false });
    el.addEventListener('touchmove', prevent, { passive: false });
    el.addEventListener('contextmenu', prevent);
    el.addEventListener('dblclick', prevent);
  }

  private toTouch(sx: number, sy: number): Touch {
    const w = this.cam.toWorld(sx, sy);
    return { x: w.x, y: w.y, sx, sy };
  }

  private handleDown = (e: PointerEvent): void => {
    if (this.activeId !== null) return;
    this.activeId = e.pointerId;
    this.down = true;
    this.current = this.toTouch(e.clientX, e.clientY);
    (this.el as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
    this.onDown(this.current);
    e.preventDefault();
  };

  private handleMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    this.current = this.toTouch(e.clientX, e.clientY);
    this.onMove(this.current);
    e.preventDefault();
  };

  private handleUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.down = false;
    this.current = this.toTouch(e.clientX, e.clientY);
    this.onUp(this.current);
  };

  /** テスト・デモから合成タッチを流し込む用。 */
  synthDown(x: number, y: number): void {
    this.down = true;
    this.current = { x, y, sx: 0, sy: 0 };
    this.onDown(this.current);
  }

  synthMove(x: number, y: number): void {
    this.current = { x, y, sx: 0, sy: 0 };
    this.onMove(this.current);
  }

  synthUp(): void {
    this.down = false;
    this.onUp(this.current);
  }
}

function prevent(e: Event): void {
  e.preventDefault();
}

function preventIfMulti(e: TouchEvent): void {
  if (e.touches.length > 1) e.preventDefault();
}

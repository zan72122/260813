import { damp, type Rect } from './util';

/**
 * 自動カメラ。
 * プレイヤーは自由に動かせない（4歳児には自由カメラは難しい）。
 * ゲーム側が「実験台の全景」「模型の接写」「結果確認」の矩形を指示し、
 * カメラはそこへなめらかに寄る／引くだけ。
 *
 * 上下には HUD（もどる・道具ボタン）が乗るので、その分を避けて構図をとる。
 */
export class Camera {
  /** 現在の注視点（world 座標） */
  x = 600;
  y = 520;
  /** 現在の拡大率（screen px / world unit） */
  zoom = 0.5;

  private tx = 600;
  private ty = 520;
  private tzoom = 0.5;

  /** ビューポート（CSS px） */
  vw = 390;
  vh = 844;
  /** HUD にかくれる帯（CSS px） */
  insetTop = 0;
  insetBottom = 0;

  /** 寄り／引きの速さ */
  speed = 3.2;

  setViewport(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    // 画面が小さいときに余白を取りすぎると模型が小さくなるので上限をかける
    this.insetTop = Math.min(70, h * 0.11);
    this.insetBottom = Math.min(84, h * 0.12);
  }

  /** HUD を除いた「見せてよい高さ」 */
  private get usableH(): number {
    return Math.max(80, this.vh - this.insetTop - this.insetBottom);
  }

  /** カメラ中心が画面のどこに来るか（px） */
  private get screenCy(): number {
    return this.insetTop + this.usableH / 2;
  }

  /**
   * world 矩形が画面に収まるように寄る。
   *
   * たて長のスマホで横長の模型を映すと、素直に収めるだけでは上下がガラガラになる。
   * そこで「絶対に見せたい範囲（core）」を渡せるようにして、
   * core が切れない範囲でできるだけ大きく映す。
   */
  focusRect(r: Rect, opts: { fill?: number; instant?: boolean; core?: Rect } = {}): void {
    const fill = opts.fill ?? 0.94;
    const vh = this.usableH;
    const zx = this.vw / Math.max(1, r.w);
    const zy = vh / Math.max(1, r.h);
    let zoom = Math.min(zx, zy) * fill;
    const core = opts.core;
    if (core) {
      const zc = Math.min(this.vw / Math.max(1, core.w), vh / Math.max(1, core.h));
      zoom = Math.min(zc * fill, Math.max(zx, zy) * fill);
    }
    this.tzoom = zoom;
    const focus = core ?? r;
    this.tx = focus.x + focus.w / 2;
    this.ty = focus.y + focus.h / 2;
    if (opts.instant) {
      this.x = this.tx;
      this.y = this.ty;
      this.zoom = this.tzoom;
    }
  }

  update(dt: number): void {
    this.x = damp(this.x, this.tx, this.speed, dt);
    this.y = damp(this.y, this.ty, this.speed, dt);
    // 拡大率は対数空間で補間すると寄り／引きが自然になる
    const lz = damp(Math.log(this.zoom), Math.log(this.tzoom), this.speed, dt);
    this.zoom = Math.exp(lz);
  }

  applyTo(ctx: CanvasRenderingContext2D, dpr: number): void {
    ctx.setTransform(
      this.zoom * dpr,
      0,
      0,
      this.zoom * dpr,
      (this.vw / 2 - this.x * this.zoom) * dpr,
      (this.screenCy - this.y * this.zoom) * dpr,
    );
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.vw / 2) / this.zoom + this.x,
      y: (sy - this.screenCy) / this.zoom + this.y,
    };
  }

  /** 現在画面に映っている world 矩形（HUD の下も含む画面全体）。 */
  visibleRect(): Rect {
    const w = this.vw / this.zoom;
    const h = this.vh / this.zoom;
    return {
      x: this.x - w / 2,
      y: this.y - this.screenCy / this.zoom,
      w,
      h,
    };
  }
}

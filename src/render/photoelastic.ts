import type { Camera } from '../engine/camera';
import type { StressField } from '../sim/stress';
import type { Specimen } from '../sim/models';
import { FRINGE_LUT, LUT_LAST, LUT_SCALE } from './lut';
import type { Rect, Vec } from '../engine/util';

export interface PhotoOptions {
  /** 応力場を計算する格子の粗さ（画面 px）。大きいほど軽い */
  pixelSize: number;
  /** 1フレームで計算するセル数の上限 */
  maxCells: number;
}

/** 模型の輪郭パスを world 座標で引く。 */
export function tracePolys(ctx: CanvasRenderingContext2D, polys: Vec[][]): void {
  ctx.beginPath();
  for (const poly of polys) {
    if (poly.length < 3) continue;
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
  }
}

/**
 * 偏光板ではさんだ透明模型の描画。
 * 1. ガラスらしい下地を塗る
 * 2. 応力場から作った虹色の縞を加算合成でのせる（力ゼロ＝黒＝なにも足されない）
 * 3. ふちの光をのせて「とうめい」を見せる
 */
export class PhotoelasticRenderer {
  private off: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  /** 直近フレームで計算したセル数（デバッグ／テスト用） */
  lastCells = 0;
  /** 直近フレームの最大フリンジ次数 */
  lastMaxOrder = 0;

  constructor() {
    this.off = document.createElement('canvas');
    this.off.width = 8;
    this.off.height = 8;
    const c = this.off.getContext('2d', { willReadFrequently: false });
    if (!c) throw new Error('2d context unavailable');
    this.octx = c;
  }

  render(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    specimen: Specimen,
    field: StressField,
    opts: PhotoOptions,
  ): void {
    const bb = specimen.bbox;
    const vis = cam.visibleRect();
    const rect = intersect(
      { x: bb.x - 6, y: bb.y - 6, w: bb.w + 12, h: bb.h + 12 },
      { x: vis.x - 20, y: vis.y - 20, w: vis.w + 40, h: vis.h + 40 },
    );

    // --- 下地（ガラス） ---
    ctx.save();
    tracePolys(ctx, specimen.polys);
    ctx.fillStyle = 'rgba(16,26,44,0.92)';
    ctx.fill();
    ctx.restore();

    if (rect && rect.w > 1 && rect.h > 1) {
      this.drawFringes(ctx, cam, specimen, field, opts, rect);
    }

    // --- ふちの光 ---
    ctx.save();
    tracePolys(ctx, specimen.polys);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(122,186,240,0.42)';
    ctx.lineWidth = 5 / cam.zoom;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(226,244,255,0.62)';
    ctx.lineWidth = 1.6 / cam.zoom;
    ctx.stroke();
    ctx.restore();

    // --- ななめの照り（とうめい感） ---
    ctx.save();
    tracePolys(ctx, specimen.polys);
    ctx.clip();
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w * 0.55, bb.y + bb.h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.07)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(bb.x - 20, bb.y - 20, bb.w + 40, bb.h + 40);
    ctx.restore();
  }

  private drawFringes(
    ctx: CanvasRenderingContext2D,
    cam: Camera,
    specimen: Specimen,
    field: StressField,
    opts: PhotoOptions,
    rect: Rect,
  ): void {
    let cell = opts.pixelSize / cam.zoom;
    let w = Math.max(2, Math.ceil(rect.w / cell));
    let h = Math.max(2, Math.ceil(rect.h / cell));
    if (w * h > opts.maxCells) {
      const k = Math.sqrt((w * h) / opts.maxCells);
      cell *= k;
      w = Math.max(2, Math.ceil(rect.w / cell));
      h = Math.max(2, Math.ceil(rect.h / cell));
    }
    this.lastCells = w * h;

    if (this.off.width !== w || this.off.height !== h || !this.img) {
      this.off.width = w;
      this.off.height = h;
      this.img = this.octx.createImageData(w, h);
    }
    const data = this.img.data;
    const cw = rect.w / w;
    const ch = rect.h / h;
    let maxOrder = 0;

    for (let j = 0; j < h; j++) {
      const wy = rect.y + (j + 0.5) * ch;
      const row = j * w * 4;
      for (let i = 0; i < w; i++) {
        const wx = rect.x + (i + 0.5) * cw;
        const n = field.sample(wx, wy);
        if (n > maxOrder) maxOrder = n;
        let idx = (n * LUT_SCALE) | 0;
        idx = idx < 0 ? 0 : idx > LUT_LAST / 3 ? LUT_LAST / 3 : idx;
        const o = idx * 3;
        const p = row + i * 4;
        data[p] = FRINGE_LUT[o];
        data[p + 1] = FRINGE_LUT[o + 1];
        data[p + 2] = FRINGE_LUT[o + 2];
        data[p + 3] = 255;
      }
    }
    this.lastMaxOrder = maxOrder;
    this.octx.putImageData(this.img, 0, 0);

    ctx.save();
    tracePolys(ctx, specimen.polys);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // 黒（＝力ゼロ）は加算しても何も起きない。力の出た所だけが光る。
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.off, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bt = Math.min(a.y + a.h, b.y + b.h);
  if (r <= x || bt <= y) return null;
  return { x, y, w: r - x, h: bt - y };
}

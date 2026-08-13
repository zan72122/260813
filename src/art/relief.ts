import { CARD_TEX_H, CARD_TEX_W } from './cards';
import { Ctx2D, ctxOf, makeCanvas } from './draw';
import { drawMotifRelief, drawMotifShape } from './stamps';

export interface StampPlacement {
  u: number;
  v: number;
}

/** How big one press is, as a fraction of the card width. */
export const STAMP_SIZE = 0.17;

/**
 * The pressed micro-relief, rebuilt from the stamps the child actually placed.
 *
 * Both channels are drawn additively into one canvas: the height goes in red
 * and the decorative shape mask in green, so overlapping presses deepen each
 * other without a per-pixel merge pass.
 */
export function renderRelief(motif: number, stamps: StampPlacement[]): HTMLCanvasElement {
  const c = makeCanvas(CARD_TEX_W, CARD_TEX_H);
  const ctx = ctxOf(c);

  // a flat, unpressed sheet
  ctx.fillStyle = 'rgb(46,0,0)';
  ctx.fillRect(0, 0, CARD_TEX_W, CARD_TEX_H);

  ctx.globalCompositeOperation = 'lighter';
  const s = STAMP_SIZE * CARD_TEX_W;

  for (const st of stamps) {
    const cx = st.u * CARD_TEX_W;
    const cy = st.v * CARD_TEX_H;
    ctx.strokeStyle = 'rgb(255,0,0)';
    ctx.fillStyle = 'rgb(255,0,0)';
    drawMotifRelief(ctx, motif, cx, cy, s);
    ctx.fillStyle = 'rgb(0,215,0)';
    drawMotifShape(ctx, motif, cx, cy, s * 0.78);
  }

  ctx.globalCompositeOperation = 'source-over';
  return c;
}

/** Colourful thumbnail for the press-head picker. */
export function renderStampThumb(motif: number, size: number): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = ctxOf(c);

  ctx.save();
  roundedClip(ctx, size);

  const g = ctx.createLinearGradient(0, size, size, 0);
  ['#ff5f9e', '#ffd85e', '#7dffc2', '#45e0ff', '#b98cff'].forEach((col, k, arr) => {
    g.addColorStop(k / (arr.length - 1), col);
  });
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // the engraved rings, drawn in white so they read over the rainbow
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  drawMotifRelief(ctx, motif, size / 2, size / 2, size * 0.3);

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#fff';
  drawMotifShape(ctx, motif, size / 2, size / 2, size * 0.3);
  ctx.globalAlpha = 1;

  ctx.restore();
  return c;
}

function roundedClip(ctx: Ctx2D, size: number): void {
  const r = size * 0.22;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(size, 0, size, size, r);
  ctx.arcTo(size, size, 0, size, r);
  ctx.arcTo(0, size, 0, 0, r);
  ctx.arcTo(0, 0, size, 0, r);
  ctx.closePath();
  ctx.clip();
}

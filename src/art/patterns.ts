import { TAU, makeRng } from '../core/math';
import { CARD_TEX_H, CARD_TEX_W } from './cards';
import {
  Ctx2D,
  butterflyPath,
  ctxOf,
  heartPath,
  makeCanvas,
  moonPath,
  pawPath,
  roundRectPath,
  starPath,
} from './draw';

export interface PatternDef {
  id: string;
  name: string;
  /** Matches the `uPattern` branch in the hologram shader. */
  kind: 0 | 1 | 2;
}

export const PATTERNS: PatternDef[] = [
  { id: 'kira', name: 'きらきら', kind: 0 },
  { id: 'nami', name: 'なみなみ', kind: 1 },
  { id: 'heart', name: 'はーと', kind: 2 },
];

/* ------------------------------------------------------------------ *
 * Relief (the micro-pattern that gets pressed into the card)
 * R channel = emboss height, G channel = decorative shape mask.
 * ------------------------------------------------------------------ */

function heightKira(ctx: Ctx2D): void {
  const cx = CARD_TEX_W / 2;
  const cy = CARD_TEX_H / 2;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, CARD_TEX_W, CARD_TEX_H);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 4;
  const spokes = 96;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(a * 5));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
    ctx.lineTo(cx + Math.cos(a) * 900, cy + Math.sin(a) * 900);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function heightNami(ctx: Ctx2D): void {
  const cx = CARD_TEX_W / 2;
  const cy = CARD_TEX_H / 2;
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, CARD_TEX_W, CARD_TEX_H);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 5;
  for (let r = 14; r < 950; r += 11) {
    ctx.globalAlpha = 0.45 + 0.45 * Math.sin(r * 0.05);
    ctx.beginPath();
    for (let t = 0; t <= TAU + 0.05; t += 0.05) {
      const rr = r + Math.sin(t * 6 + r * 0.02) * 5;
      const x = cx + Math.cos(t) * rr;
      const y = cy + Math.sin(t) * rr;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function heightHeart(ctx: Ctx2D): void {
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, CARD_TEX_W, CARD_TEX_H);
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 5;
  const diag = CARD_TEX_W + CARD_TEX_H;
  for (let d = -diag; d < diag; d += 12) {
    ctx.globalAlpha = 0.45 + 0.45 * Math.sin(d * 0.06);
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + CARD_TEX_H, CARD_TEX_H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function shapesKira(ctx: Ctx2D): void {
  const rng = makeRng(31);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) {
    const x = 40 + rng() * (CARD_TEX_W - 80);
    const y = 40 + rng() * (CARD_TEX_H - 80);
    const r = 16 + rng() * 40;
    starPath(ctx, x, y, r, r * 0.4, rng() > 0.5 ? 5 : 4, rng() * TAU);
    ctx.fill();
  }
}

function shapesNami(ctx: Ctx2D): void {
  const rng = makeRng(97);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 34; i++) {
    const x = 30 + rng() * (CARD_TEX_W - 60);
    const y = 30 + rng() * (CARD_TEX_H - 60);
    const r = 12 + rng() * 34;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  // a few wave crests
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const y0 = 90 + k * 130;
    ctx.beginPath();
    for (let x = 20; x <= CARD_TEX_W - 20; x += 8) {
      const y = y0 + Math.sin(x * 0.03 + k) * 26;
      if (x === 20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function shapesHeart(ctx: Ctx2D): void {
  ctx.fillStyle = '#fff';
  const cols = 4;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = r % 2 === 0 ? 0 : (CARD_TEX_W / cols) * 0.5;
      const x = (c + 0.5) * (CARD_TEX_W / cols) + offset;
      const y = (r + 0.5) * (CARD_TEX_H / rows);
      if (x > CARD_TEX_W + 40) continue;
      heartPath(ctx, x, y, 38);
      ctx.fill();
    }
  }
}

const HEIGHT_FNS = [heightKira, heightNami, heightHeart];
const SHAPE_FNS = [shapesKira, shapesNami, shapesHeart];

/**
 * Pack height + shape masks into one RGBA texture:
 *   R = emboss height, G = decorative shape mask.
 */
export function renderRelief(patternIndex: number): HTMLCanvasElement {
  const i = patternIndex % PATTERNS.length;
  const w = CARD_TEX_W;
  const h = CARD_TEX_H;

  const hc = makeCanvas(w, h);
  const hctx = ctxOf(hc);
  HEIGHT_FNS[i](hctx);

  const sc = makeCanvas(w, h);
  const sctx = ctxOf(sc);
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, w, h);
  SHAPE_FNS[i](sctx);

  const out = makeCanvas(w, h);
  const octx = ctxOf(out);
  const hd = hctx.getImageData(0, 0, w, h).data;
  const sd = sctx.getImageData(0, 0, w, h).data;
  const img = octx.createImageData(w, h);
  const od = img.data;
  for (let p = 0; p < w * h; p++) {
    const k = p * 4;
    od[k] = hd[k];
    od[k + 1] = sd[k];
    od[k + 2] = 0;
    od[k + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Colourful thumbnail for the pattern picker - a cheap 2D fake of the shader. */
export function renderPatternThumb(patternIndex: number, size: number): HTMLCanvasElement {
  const i = patternIndex % PATTERNS.length;
  const c = makeCanvas(size, size);
  const ctx = ctxOf(c);

  ctx.save();
  roundRectPath(ctx, 0, 0, size, size, size * 0.22);
  ctx.clip();

  const g = ctx.createLinearGradient(0, size, size, 0);
  ['#ff5f9e', '#ffd85e', '#7dffc2', '#45e0ff', '#b98cff'].forEach((col, k, arr) => {
    g.addColorStop(k / (arr.length - 1), col);
  });
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // draw the pattern's motif in white over the rainbow
  const s = size / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = size * 0.035;

  if (i === 0) {
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(s + Math.cos(a) * s * 0.28, s + Math.sin(a) * s * 0.28);
      ctx.lineTo(s + Math.cos(a) * s * 1.6, s + Math.sin(a) * s * 1.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    starPath(ctx, s, s, s * 0.62, s * 0.26, 5, -Math.PI / 2);
    ctx.fill();
  } else if (i === 1) {
    ctx.globalAlpha = 0.6;
    for (let r = size * 0.12; r < size; r += size * 0.11) {
      ctx.beginPath();
      ctx.arc(s, s, r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = size * 0.075;
    ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      for (let x = size * 0.12; x <= size * 0.88; x += 4) {
        const y = s + k * size * 0.26 + Math.sin(x * 0.055) * size * 0.07;
        if (x === size * 0.12) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    ctx.globalAlpha = 0.5;
    for (let d = -size; d < size * 2; d += size * 0.13) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + size, size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    heartPath(ctx, s, s * 1.05, s * 0.72);
    ctx.fill();
  }

  ctx.restore();
  return c;
}

/* ------------------------------------------------------------------ *
 * Hidden emblems - the secret picture that swims into view on tilt.
 * ------------------------------------------------------------------ */

const HIDDEN_W = 256;
const HIDDEN_H = 366;

function hiddenPaw(ctx: Ctx2D): void {
  pawPath(ctx, HIDDEN_W / 2, HIDDEN_H * 0.46, 88);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    const s = 22 + i * 6;
    pawPath(ctx, 46 + i * 82, HIDDEN_H * 0.84, s);
    ctx.fill();
  }
}

function hiddenMoon(ctx: Ctx2D): void {
  moonPath(ctx, HIDDEN_W * 0.52, HIDDEN_H * 0.44, 92);
  ctx.fill();
  starPath(ctx, HIDDEN_W * 0.22, HIDDEN_H * 0.7, 32, 13, 5, -0.3);
  ctx.fill();
  starPath(ctx, HIDDEN_W * 0.78, HIDDEN_H * 0.74, 24, 10, 5, 0.4);
  ctx.fill();
  starPath(ctx, HIDDEN_W * 0.2, HIDDEN_H * 0.2, 20, 8, 4, 0.2);
  ctx.fill();
}

function hiddenButterfly(ctx: Ctx2D): void {
  butterflyPath(ctx, HIDDEN_W / 2, HIDDEN_H * 0.44, 108);
  ctx.fill();
  butterflyPath(ctx, HIDDEN_W * 0.24, HIDDEN_H * 0.8, 44);
  ctx.fill();
  butterflyPath(ctx, HIDDEN_W * 0.78, HIDDEN_H * 0.82, 36);
  ctx.fill();
}

const HIDDEN_FNS = [hiddenPaw, hiddenMoon, hiddenButterfly];

/** Mask (R channel) of the secret picture. One per base card. */
export function renderHidden(cardIndex: number): HTMLCanvasElement {
  const c = makeCanvas(HIDDEN_W, HIDDEN_H);
  const ctx = ctxOf(c);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, HIDDEN_W, HIDDEN_H);
  ctx.fillStyle = '#fff';
  HIDDEN_FNS[cardIndex % HIDDEN_FNS.length](ctx);
  return c;
}

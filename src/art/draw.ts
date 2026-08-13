import { TAU } from '../core/math';

export type Ctx2D = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctxOf(c: HTMLCanvasElement): Ctx2D {
  const ctx = c.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2d context unavailable');
  return ctx;
}

export function roundRectPath(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Spirograph rosette - the fine engraved curve you see on banknotes and ID
 * cards. Purely decorative, but it is what makes the blank card read as
 * "official document" rather than "sticker".
 */
export function guilloche(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  radius: number,
  amp: number,
  lobes: number,
  turns: number,
  step = 0.02,
): void {
  ctx.beginPath();
  for (let t = 0; t <= TAU * turns; t += step) {
    const r = radius + amp * Math.sin(lobes * t);
    const w = 1 + 0.06 * Math.sin(t * 3);
    const x = cx + Math.cos(t) * r * w;
    const y = cy + Math.sin(t) * r * w;
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** A row of tiny dashes that reads as microtext at a glance but says nothing. */
export function microDashRow(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  size = 3,
  gap = 2,
): void {
  let cx = x;
  let i = 0;
  while (cx < x + w) {
    const len = size * (1 + (i % 3 === 0 ? 1.4 : i % 2 === 0 ? 0.6 : 0));
    ctx.fillRect(cx, y, len, size * 0.8);
    cx += len + gap;
    i++;
  }
}

export function starPath(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points = 5,
  rot = -Math.PI / 2,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function heartPath(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.72);
  ctx.bezierCurveTo(cx - s * 1.35, cy - s * 0.25, cx - s * 0.55, cy - s * 1.05, cx, cy - s * 0.34);
  ctx.bezierCurveTo(cx + s * 0.55, cy - s * 1.05, cx + s * 1.35, cy - s * 0.25, cx, cy + s * 0.72);
  ctx.closePath();
}

export function pawPath(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.34, s * 0.62, s * 0.5, 0, 0, TAU);
  ctx.closePath();
  const toes: [number, number, number][] = [
    [-0.62, -0.34, 0.26],
    [-0.22, -0.62, 0.26],
    [0.22, -0.62, 0.26],
    [0.62, -0.34, 0.26],
  ];
  for (const [dx, dy, r] of toes) {
    ctx.moveTo(cx + dx * s + r * s, cy + dy * s);
    ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * s * 1.15, 0, 0, TAU);
  }
}

export function moonPath(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, s, Math.PI * 0.32, Math.PI * 1.68, false);
  ctx.arc(cx + s * 0.42, cy, s * 0.86, Math.PI * 1.62, Math.PI * 0.38, true);
  ctx.closePath();
}

export function butterflyPath(ctx: Ctx2D, cx: number, cy: number, s: number): void {
  ctx.beginPath();
  // upper wings
  ctx.ellipse(cx - s * 0.52, cy - s * 0.3, s * 0.5, s * 0.62, -0.5, 0, TAU);
  ctx.ellipse(cx + s * 0.52, cy - s * 0.3, s * 0.5, s * 0.62, 0.5, 0, TAU);
  // lower wings
  ctx.ellipse(cx - s * 0.42, cy + s * 0.42, s * 0.38, s * 0.46, 0.45, 0, TAU);
  ctx.ellipse(cx + s * 0.42, cy + s * 0.42, s * 0.38, s * 0.46, -0.45, 0, TAU);
  // body
  ctx.ellipse(cx, cy + s * 0.05, s * 0.11, s * 0.72, 0, 0, TAU);
}

export function petalFlowerPath(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  s: number,
  petals = 6,
): void {
  ctx.beginPath();
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    const px = cx + Math.cos(a) * s * 0.62;
    const py = cy + Math.sin(a) * s * 0.62;
    ctx.moveTo(px + s * 0.44, py);
    ctx.ellipse(px, py, s * 0.44, s * 0.32, a, 0, TAU);
  }
}

/** Soft radial blob used for foil brush stamps and shadows. */
export function radialSprite(size: number, inner = 'rgba(255,255,255,1)'): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = ctxOf(c);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.55, 'rgba(255,255,255,0.72)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

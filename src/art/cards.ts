import { TAU, makeRng } from '../core/math';
import {
  Ctx2D,
  ctxOf,
  guilloche,
  makeCanvas,
  microDashRow,
  moonPath,
  petalFlowerPath,
  roundRectPath,
  starPath,
} from './draw';

export const CARD_TEX_W = 512;
export const CARD_TEX_H = 731;
export const CARD_RADIUS = 46;

export interface CardTheme {
  id: string;
  name: string;
  emoji: string;
  top: string;
  bottom: string;
  ink: string;
  accent: string;
}

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'neko',
    name: 'ねこ',
    emoji: '🐱',
    top: '#ffe3f0',
    bottom: '#ff92c2',
    ink: '#8a2b56',
    accent: '#ffffff',
  },
  {
    id: 'hoshi',
    name: 'ほし',
    emoji: '⭐️',
    top: '#4b4fb4',
    bottom: '#241a5e',
    ink: '#ffe9a8',
    accent: '#ffd85e',
  },
  {
    id: 'hana',
    name: 'おはな',
    emoji: '🌸',
    top: '#e2fff5',
    bottom: '#6fe0c6',
    ink: '#12695c',
    accent: '#ffffff',
  },
];

function frame(ctx: Ctx2D, theme: CardTheme): void {
  const w = CARD_TEX_W;
  const h = CARD_TEX_H;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundRectPath(ctx, 0, 0, w, h, CARD_RADIUS);
  ctx.clip();

  const g = ctx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, theme.top);
  g.addColorStop(1, theme.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // engraved rosettes - the "official document" texture
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1;
  guilloche(ctx, w * 0.5, h * 0.42, 168, 42, 7, 12);
  guilloche(ctx, w * 0.5, h * 0.42, 108, 26, 11, 9);
  ctx.globalAlpha = 0.1;
  guilloche(ctx, w * 0.5, h * 0.78, 96, 22, 9, 8);
  ctx.globalAlpha = 1;

  // double border
  ctx.strokeStyle = theme.ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 6;
  roundRectPath(ctx, 16, 16, w - 32, h - 32, CARD_RADIUS - 10);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  roundRectPath(ctx, 30, 30, w - 60, h - 60, CARD_RADIUS - 20);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // "microtext" bands
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = 0.3;
  microDashRow(ctx, 46, h - 70, w - 92, 4, 3);
  microDashRow(ctx, 46, h - 56, w - 92, 3, 4);
  ctx.globalAlpha = 1;

  // corner registration marks
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.8;
  const corners: [number, number][] = [
    [52, 52],
    [w - 52, 52],
    [52, h - 104],
    [w - 52, h - 104],
  ];
  for (const [cx, cy] of corners) {
    starPath(ctx, cx, cy, 13, 5.5, 4, 0);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function catFace(ctx: Ctx2D, theme: CardTheme): void {
  const cx = CARD_TEX_W * 0.5;
  const cy = CARD_TEX_H * 0.42;
  const s = 150;

  ctx.save();
  ctx.fillStyle = '#fffaf5';
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 8;

  // ears
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.86, cy - s * 0.42);
  ctx.lineTo(cx - s * 0.62, cy - s * 1.06);
  ctx.lineTo(cx - s * 0.2, cy - s * 0.72);
  ctx.closePath();
  ctx.moveTo(cx + s * 0.86, cy - s * 0.42);
  ctx.lineTo(cx + s * 0.62, cy - s * 1.06);
  ctx.lineTo(cx + s * 0.2, cy - s * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // head
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.95, s * 0.84, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // eyes
  ctx.fillStyle = theme.ink;
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.36, cy - s * 0.06, s * 0.1, s * 0.15, 0, 0, TAU);
  ctx.ellipse(cx + s * 0.36, cy - s * 0.06, s * 0.1, s * 0.15, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - s * 0.32, cy - s * 0.12, s * 0.035, 0, TAU);
  ctx.arc(cx + s * 0.4, cy - s * 0.12, s * 0.035, 0, TAU);
  ctx.fill();

  // nose + mouth
  ctx.fillStyle = '#ff7fae';
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.22);
  ctx.lineTo(cx - s * 0.09, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.09, cy + s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx - s * 0.13, cy + s * 0.26, s * 0.14, 0, Math.PI);
  ctx.arc(cx + s * 0.13, cy + s * 0.26, s * 0.14, 0, Math.PI);
  ctx.stroke();

  // blush
  ctx.fillStyle = 'rgba(255,140,180,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.62, cy + s * 0.18, s * 0.17, s * 0.11, 0, 0, TAU);
  ctx.ellipse(cx + s * 0.62, cy + s * 0.18, s * 0.17, s * 0.11, 0, 0, TAU);
  ctx.fill();

  // whiskers
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.75;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.72, cy + s * 0.12 + i * s * 0.16);
    ctx.lineTo(cx - s * 1.25, cy + s * 0.04 + i * s * 0.24);
    ctx.moveTo(cx + s * 0.72, cy + s * 0.12 + i * s * 0.16);
    ctx.lineTo(cx + s * 1.25, cy + s * 0.04 + i * s * 0.24);
    ctx.stroke();
  }
  ctx.restore();
}

function starScene(ctx: Ctx2D, theme: CardTheme): void {
  const cx = CARD_TEX_W * 0.5;
  const cy = CARD_TEX_H * 0.42;
  const rng = makeRng(7);

  ctx.save();
  // scattered stars
  for (let i = 0; i < 42; i++) {
    const x = rng() * CARD_TEX_W;
    const y = 60 + rng() * (CARD_TEX_H - 190);
    const r = 3 + rng() * 9;
    ctx.globalAlpha = 0.35 + rng() * 0.55;
    ctx.fillStyle = '#fff';
    starPath(ctx, x, y, r, r * 0.42, 4, rng() * TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // moon
  ctx.fillStyle = theme.accent;
  ctx.strokeStyle = '#fff4cf';
  ctx.lineWidth = 6;
  moonPath(ctx, cx + 22, cy, 128);
  ctx.fill();
  ctx.stroke();

  // sleepy face on the moon
  ctx.strokeStyle = '#8a6a1f';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx - 26, cy - 14, 16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.arc(cx + 24, cy - 22, 16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx - 4, cy + 34, 20, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,150,180,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - 46, cy + 22, 20, 12, 0, 0, TAU);
  ctx.ellipse(cx + 46, cy + 14, 20, 12, 0, 0, TAU);
  ctx.fill();

  // one big shooting star
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - 190, cy + 210);
  ctx.quadraticCurveTo(cx - 120, cy + 176, cx - 54, cy + 196);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  starPath(ctx, cx - 44, cy + 198, 22, 9, 5, -0.4);
  ctx.fill();
  ctx.restore();
}

function flowerScene(ctx: Ctx2D, theme: CardTheme): void {
  const cx = CARD_TEX_W * 0.5;
  const cy = CARD_TEX_H * 0.42;

  ctx.save();
  // leaves
  ctx.fillStyle = '#3fae8c';
  ctx.beginPath();
  ctx.ellipse(cx - 120, cy + 150, 70, 34, -0.5, 0, TAU);
  ctx.ellipse(cx + 120, cy + 150, 70, 34, 0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy + 210);
  ctx.lineTo(cx, cy + 70);
  ctx.stroke();

  // petals
  ctx.fillStyle = '#ffd7ea';
  ctx.strokeStyle = '#ff8fbe';
  ctx.lineWidth = 7;
  petalFlowerPath(ctx, cx, cy, 168, 6);
  ctx.fill();
  ctx.stroke();

  // centre
  ctx.fillStyle = '#ffe17a';
  ctx.strokeStyle = '#e0a12a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // happy face
  ctx.strokeStyle = '#a0700f';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx - 22, cy - 10, 11, Math.PI * 1.05, Math.PI * 1.95);
  ctx.arc(cx + 22, cy - 10, 11, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 14, 20, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  // little sparkles around
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  for (const [dx, dy, r] of [
    [-190, -150, 15],
    [180, -180, 12],
    [200, 60, 10],
    [-200, 40, 11],
  ] as [number, number, number][]) {
    starPath(ctx, cx + dx, cy + dy, r, r * 0.36, 4, 0);
    ctx.fill();
  }
  ctx.restore();
}

const SCENES: Record<string, (ctx: Ctx2D, theme: CardTheme) => void> = {
  neko: catFace,
  hoshi: starScene,
  hana: flowerScene,
};

/** Full-resolution base card art. Alpha carries the rounded corners. */
export function renderCard(themeIndex: number): HTMLCanvasElement {
  const theme = CARD_THEMES[themeIndex % CARD_THEMES.length];
  const c = makeCanvas(CARD_TEX_W, CARD_TEX_H);
  const ctx = ctxOf(c);
  frame(ctx, theme);
  SCENES[theme.id](ctx, theme);
  ctx.restore(); // undo the clip pushed by frame()
  return c;
}

/** Small version for the picker buttons. */
export function renderCardThumb(themeIndex: number, w: number): HTMLCanvasElement {
  const full = renderCard(themeIndex);
  const h = Math.round((w / CARD_TEX_W) * CARD_TEX_H);
  const c = makeCanvas(w, h);
  const ctx = ctxOf(c);
  ctx.drawImage(full, 0, 0, w, h);
  return c;
}

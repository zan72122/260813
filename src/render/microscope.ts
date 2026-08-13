/**
 * 顕微鏡の外観と、接眼レンズへ寄っていくカメラ。
 * ワールド座標は 1000 x 1000 くらい（y は下向き）。
 */

import type { Layout } from '../layout';
import type { SlideDef } from '../core/slides';

/** 接眼レンズ（ここへ寄っていく） */
export const EYEPIECE = { x: 430, y: 172, r: 54 };

/** ステージのプレパラート置き場 */
export const SLIDE_SLOT = { x: 430, y: 606, w: 244, h: 74 };

export interface Camera {
  /** 画面の基準点に来るワールド座標 */
  wx: number;
  wy: number;
  scale: number;
}

export function fitCamera(l: Layout): Camera {
  const scale = Math.min(l.availW / 700, l.availH / 880) * 0.98;
  return { wx: 480, wy: 520, scale };
}

export function eyepieceCamera(l: Layout): Camera {
  return { wx: EYEPIECE.x, wy: EYEPIECE.y, scale: l.fieldR / EYEPIECE.r };
}

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  // スケールは対数で補間するとズームがなめらか
  const scale = a.scale * Math.pow(b.scale / a.scale, t);
  return {
    wx: a.wx + (b.wx - a.wx) * t,
    wy: a.wy + (b.wy - a.wy) * t,
    scale,
  };
}

export function worldToScreen(cam: Camera, l: Layout, wx: number, wy: number) {
  return {
    x: l.fieldCx + (wx - cam.wx) * cam.scale,
    y: l.fieldCy + (wy - cam.wy) * cam.scale,
  };
}

export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, l: Layout): void {
  ctx.translate(l.fieldCx, l.fieldCy);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.wx, -cam.wy);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
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

const BODY = '#79cfc4';
const BODY_DARK = '#4da79c';
const BODY_LIGHT = '#a5e4db';
const METAL = '#ffd79a';
const METAL_DARK = '#e8b06a';
const ACCENT = '#ff9fc0';

export interface MicroscopeDrawOptions {
  time: number;
  /** プレパラートを置く動き 0..1（1 で置き終わり） */
  slideDrop: number;
  slide: SlideDef | null;
  /** ランプの明るさ 0..1 */
  lamp: number;
  /** 偏光板が入っているか 0..1 */
  polar: number;
  /** ステージの回転（ラジアン） */
  stageAngle: number;
}

/** 背景（机の上） */
export function drawBackdrop(ctx: CanvasRenderingContext2D, l: Layout, time: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, l.h);
  g.addColorStop(0, '#fef6ee');
  g.addColorStop(0.55, '#fde9f1');
  g.addColorStop(1, '#e9e2ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, l.w, l.h);

  // ふわふわの水玉
  const cols = ['rgba(255,255,255,0.55)', 'rgba(255,214,235,0.5)', 'rgba(200,232,255,0.5)'];
  for (let i = 0; i < 14; i++) {
    const px = ((i * 137.5) % 100) / 100;
    const py = ((i * 61.8) % 100) / 100;
    const r = 14 + ((i * 7) % 5) * 6;
    const bob = Math.sin(time * 0.6 + i) * 6;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.arc(px * l.w, py * l.h + bob, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSlideGlass(
  ctx: CanvasRenderingContext2D,
  def: SlideDef,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  // ガラス
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
  ctx.fillStyle = 'rgba(236,250,255,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,170,0.85)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 中の石（薄片）
  const g = ctx.createLinearGradient(x - 40, y - 24, x + 40, y + 24);
  g.addColorStop(0, def.cardFrom);
  g.addColorStop(1, def.cardTo);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.2, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,80,110,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // ラベル
  roundRect(ctx, x + w / 2 - 52, y - h / 2 + 6, 44, h - 12, 5);
  ctx.fillStyle = '#fff6d8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,130,90,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.emoji, x + w / 2 - 30, y);
  ctx.restore();
}

export function drawMicroscope(
  ctx: CanvasRenderingContext2D,
  opts: MicroscopeDrawOptions,
): void {
  const { time, slideDrop, slide, lamp } = opts;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // 影
  ctx.fillStyle = 'rgba(120,100,140,0.16)';
  ctx.beginPath();
  ctx.ellipse(500, 905, 300, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- 台 ---
  roundRect(ctx, 250, 812, 520, 88, 30);
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.strokeStyle = BODY_DARK;
  ctx.lineWidth = 8;
  ctx.stroke();
  roundRect(ctx, 274, 826, 472, 26, 13);
  ctx.fillStyle = BODY_LIGHT;
  ctx.fill();

  // --- アーム ---
  roundRect(ctx, 588, 330, 112, 510, 52);
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.strokeStyle = BODY_DARK;
  ctx.lineWidth = 8;
  ctx.stroke();

  // アームと鏡筒をつなぐ腕
  roundRect(ctx, 420, 398, 236, 84, 40);
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.strokeStyle = BODY_DARK;
  ctx.lineWidth = 8;
  ctx.stroke();

  // --- ピントつまみ ---
  for (const [r, fill] of [
    [46, METAL],
    [26, METAL_DARK],
  ] as const) {
    ctx.beginPath();
    ctx.arc(644, 690, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,60,0.5)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // --- ランプ ---
  const lampGlow = 0.35 + lamp * 0.65;
  roundRect(ctx, 382, 700, 96, 78, 22);
  ctx.fillStyle = BODY_DARK;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(430, 706, 34, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,244,190,${lampGlow})`;
  ctx.fill();
  // 光のすじ
  const cone = ctx.createLinearGradient(0, 700, 0, 600);
  cone.addColorStop(0, `rgba(255,248,205,${0.75 * lamp})`);
  cone.addColorStop(1, 'rgba(255,248,205,0)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(396, 706);
  ctx.lineTo(464, 706);
  ctx.lineTo(492, 600);
  ctx.lineTo(368, 600);
  ctx.closePath();
  ctx.fill();

  // --- 偏光板（下） ---
  if (opts.polar > 0.02) {
    ctx.save();
    ctx.globalAlpha = opts.polar;
    roundRect(ctx, 352, 660, 156, 22, 11);
    ctx.fillStyle = 'rgba(120,90,190,0.85)';
    ctx.fill();
    ctx.restore();
  }

  // --- ステージ ---
  roundRect(ctx, 214, 594, 512, 56, 16);
  ctx.fillStyle = BODY_DARK;
  ctx.fill();
  roundRect(ctx, 214, 594, 512, 30, 15);
  ctx.fillStyle = BODY;
  ctx.fill();

  // ステージの穴（光がとおる）
  ctx.beginPath();
  ctx.arc(430, 622, 44, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,250,214,${0.5 + lamp * 0.5})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,90,90,0.4)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // --- プレパラート ---
  if (slide && slideDrop > 0.001) {
    const drop = Math.min(1, slideDrop);
    // 上から落ちてきて、ちょっとはずんで止まる
    const ease = 1 - Math.pow(1 - drop, 3);
    const bounce = drop >= 1 ? 0 : Math.sin(drop * Math.PI * 2) * 10 * (1 - drop);
    const y = SLIDE_SLOT.y - (1 - ease) * 320 + bounce;
    ctx.save();
    ctx.translate(SLIDE_SLOT.x, y);
    ctx.rotate(opts.stageAngle * 0.35 + (1 - ease) * 0.25);
    ctx.translate(-SLIDE_SLOT.x, -y);
    drawSlideGlass(ctx, slide, SLIDE_SLOT.x, y, SLIDE_SLOT.w, SLIDE_SLOT.h, 1);
    ctx.restore();
  }

  // ステージのクリップ
  for (const cx of [300, 560]) {
    roundRect(ctx, cx - 26, 586, 52, 18, 9);
    ctx.fillStyle = METAL;
    ctx.fill();
    ctx.strokeStyle = METAL_DARK;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // --- レボルバーと対物レンズ ---
  ctx.beginPath();
  ctx.arc(430, 500, 66, 0, Math.PI * 2);
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.strokeStyle = BODY_DARK;
  ctx.lineWidth = 8;
  ctx.stroke();

  for (const [ox, len, w0, w1] of [
    [-52, 44, 26, 20],
    [0, 74, 34, 26],
    [52, 44, 26, 20],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(430 + ox - w0 / 2, 540);
    ctx.lineTo(430 + ox + w0 / 2, 540);
    ctx.lineTo(430 + ox + w1 / 2, 540 + len);
    ctx.lineTo(430 + ox - w1 / 2, 540 + len);
    ctx.closePath();
    ctx.fillStyle = ox === 0 ? METAL : METAL_DARK;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,60,0.6)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // --- 鏡筒 ---
  roundRect(ctx, 384, 232, 92, 246, 34);
  ctx.fillStyle = BODY;
  ctx.fill();
  ctx.strokeStyle = BODY_DARK;
  ctx.lineWidth = 8;
  ctx.stroke();
  roundRect(ctx, 400, 250, 24, 210, 12);
  ctx.fillStyle = BODY_LIGHT;
  ctx.fill();

  // --- 偏光板（上・アナライザー） ---
  if (opts.polar > 0.02) {
    ctx.save();
    ctx.globalAlpha = opts.polar;
    roundRect(ctx, 356, 356, 148, 20, 10);
    ctx.fillStyle = 'rgba(120,90,190,0.85)';
    ctx.fill();
    ctx.restore();
  }

  // --- 接眼レンズ ---
  roundRect(ctx, 368, 186, 124, 76, 26);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.strokeStyle = '#e07a9e';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(EYEPIECE.x, EYEPIECE.y, EYEPIECE.r + 12, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.strokeStyle = '#e07a9e';
  ctx.lineWidth = 8;
  ctx.stroke();

  // レンズの中（ここが視野になる）
  ctx.beginPath();
  ctx.arc(EYEPIECE.x, EYEPIECE.y, EYEPIECE.r, 0, Math.PI * 2);
  ctx.fillStyle = '#2b2338';
  ctx.fill();

  // レンズの照り返し
  ctx.save();
  ctx.beginPath();
  ctx.arc(EYEPIECE.x, EYEPIECE.y, EYEPIECE.r, 0, Math.PI * 2);
  ctx.clip();
  const shine = ctx.createLinearGradient(
    EYEPIECE.x - 40,
    EYEPIECE.y - 40,
    EYEPIECE.x + 30,
    EYEPIECE.y + 40,
  );
  shine.addColorStop(0, 'rgba(255,255,255,0.4)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(EYEPIECE.x - 70, EYEPIECE.y - 70, 140, 140);
  ctx.restore();

  // きらきら
  for (let i = 0; i < 3; i++) {
    const a = time * 1.2 + i * 2.1;
    const sx = 300 + Math.sin(a) * 40 + i * 210;
    const sy = 260 + Math.cos(a * 1.3) * 40 + (i % 2) * 120;
    const sc = 8 + Math.sin(a * 2) * 3;
    ctx.strokeStyle = 'rgba(255,214,120,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx - sc, sy);
    ctx.lineTo(sx + sc, sy);
    ctx.moveTo(sx, sy - sc);
    ctx.lineTo(sx, sy + sc);
    ctx.stroke();
  }

  ctx.restore();
}

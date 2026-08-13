/**
 * 接眼レンズの中（まるい視野）を描く。
 */

import { rgbToCss, rgbaToCss, type RGB } from '../core/colors';
import type { Pt } from '../core/mosaic';
import {
  grainDisplayColor,
  grainIntensity,
  isSparkling,
  type Grain,
  type ThinSection,
} from '../core/slides';
import { Rng } from '../core/rng';

export interface FieldView {
  cx: number;
  cy: number;
  r: number;
}

export interface FieldDrawOptions {
  stageAngle: number;
  /** 0 = ふつうの光, 1 = 偏光オン。とちゅうはスイープ演出 */
  polarT: number;
  time: number;
  /** 目的モードで光らせたい粒 */
  hintGrain?: Grain | null;
  /** ヒントの強さ 0..1 */
  hintStrength?: number;
  /** 演出を減らす（テスト・低速端末むけ） */
  reduced?: boolean;
  /** 全体のフェード */
  alpha?: number;
}

/** 偏光スイープの向き（画面に固定。偏光板は顕微鏡側の部品なので回らない） */
const SWEEP_AX = 0.7071;
const SWEEP_AY = 0.7071;

interface Decor {
  dust: { x: number; y: number; r: number; a: number }[];
  bubbles: { x: number; y: number; r: number }[];
}

const decorCache = new Map<string, Decor>();

function getDecor(section: ThinSection): Decor {
  const key = section.def.id;
  const cached = decorCache.get(key);
  if (cached) return cached;
  const rng = new Rng(section.def.seed ^ 0x5eed);
  const dust: Decor['dust'] = [];
  for (let i = 0; i < 70; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = Math.sqrt(rng.next()) * 1.25;
    dust.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      r: rng.range(0.004, 0.013),
      a: rng.range(0.06, 0.22),
    });
  }
  const bubbles: Decor['bubbles'] = [];
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.25, 1.05);
    bubbles.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      r: rng.range(0.03, 0.062),
    });
  }
  const decor = { dust, bubbles };
  decorCache.set(key, decor);
  return decor;
}

function tracePolygon(ctx: CanvasRenderingContext2D, poly: Pt[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  alpha: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.6);
  g.addColorStop(0, `rgba(255,255,255,${0.75 * alpha})`);
  g.addColorStop(0.35, `rgba(255,250,220,${0.28 * alpha})`);
  g.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255,255,255,${0.85 * alpha})`;
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-size, 0);
  ctx.lineTo(size, 0);
  ctx.moveTo(0, -size);
  ctx.lineTo(0, size);
  ctx.stroke();
  ctx.restore();
}

export function drawField(
  ctx: CanvasRenderingContext2D,
  section: ThinSection,
  view: FieldView,
  opts: FieldDrawOptions,
): void {
  const { cx, cy, r } = view;
  const { stageAngle, polarT, time } = opts;
  const reduced = opts.reduced ?? false;
  const alpha = opts.alpha ?? 1;
  if (alpha <= 0 || r <= 1) return;

  const cosA = Math.cos(stageAngle);
  const sinA = Math.sin(stageAngle);
  // 偏光の波が視野を横切る位置
  const sweepPos = -1.3 + polarT * 2.6;

  ctx.save();
  ctx.globalAlpha = alpha;

  // まるい視野でクリップ
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // 下地（ステージの光）
  ctx.fillStyle = polarT > 0.5 ? '#0b0b12' : '#f3efe6';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(stageAngle);
  ctx.scale(r, r);

  const lineW = 1.1 / r;

  // --- 粒 ---
  const sparkles: { x: number; y: number; s: number }[] = [];
  for (const g of section.grains) {
    // この粒のところまで偏光の波が来ているか
    const px = g.c.x * cosA - g.c.y * sinA;
    const py = g.c.x * sinA + g.c.y * cosA;
    const proj = px * SWEEP_AX + py * SWEEP_AY;
    let local = (sweepPos - proj) / 0.34;
    local = local < 0 ? 0 : local > 1 ? 1 : local;

    const col = grainDisplayColor(g, stageAngle, local);
    tracePolygon(ctx, g.poly);
    ctx.fillStyle = rgbToCss(col);
    ctx.fill();

    // へき開（すじ）
    if (g.cleavage > 0.28 && !reduced) {
      ctx.save();
      ctx.clip();
      const dx = Math.cos(g.theta0);
      const dy = Math.sin(g.theta0);
      const step = g.r * 0.34;
      ctx.strokeStyle = `rgba(0,0,0,${0.13 * g.cleavage})`;
      ctx.lineWidth = lineW;
      ctx.beginPath();
      for (let k = -3; k <= 3; k++) {
        const ox = -dy * step * k;
        const oy = dx * step * k;
        ctx.moveTo(g.c.x + ox - dx * g.r * 2, g.c.y + oy - dy * g.r * 2);
        ctx.lineTo(g.c.x + ox + dx * g.r * 2, g.c.y + oy + dy * g.r * 2);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 粒のさかいめ
    tracePolygon(ctx, g.poly);
    ctx.strokeStyle = local > 0.5 ? 'rgba(0,0,0,0.42)' : 'rgba(120,104,88,0.35)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    if (local > 0.7 && isSparkling(g, stageAngle)) {
      sparkles.push({ x: g.c.x, y: g.c.y, s: Math.min(0.09, g.r * 0.55) });
    }
  }

  const decor = getDecor(section);

  // 気泡（プレパラートの中の空気）
  for (const b of decor.bubbles) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.strokeStyle = polarT > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(90,80,70,0.28)';
    ctx.lineWidth = lineW * 2.2;
    ctx.stroke();
  }

  // ちいさなゴミ
  if (!reduced) {
    for (const d of decor.dust) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = polarT > 0.5 ? `rgba(255,255,255,${d.a * 0.5})` : `rgba(70,60,50,${d.a})`;
      ctx.fill();
    }
  }

  // ヒントのリング
  if (opts.hintGrain && (opts.hintStrength ?? 0) > 0.01) {
    const hs = opts.hintStrength ?? 0;
    const g = opts.hintGrain;
    const pulse = 1 + Math.sin(time * 4.2) * 0.14;
    ctx.beginPath();
    ctx.arc(g.c.x, g.c.y, Math.max(g.r * 1.5, 0.09) * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * hs})`;
    ctx.lineWidth = lineW * 3.4;
    ctx.setLineDash([0.05, 0.04]);
    ctx.lineDashOffset = -time * 0.35;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // --- きらきら（画面座標で描く） ---
  if (polarT > 0.3) {
    sparkles.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
    const max = reduced ? 6 : 16;
    for (let i = 0; i < Math.min(max, sparkles.length); i++) {
      const s = sparkles[i];
      const sx = cx + (s.x * cosA - s.y * sinA) * r;
      const sy = cy + (s.x * sinA + s.y * cosA) * r;
      const tw = 0.55 + 0.45 * Math.sin(time * 3 + i * 1.7);
      drawStar(ctx, sx, sy, s.s * r * (0.85 + tw * 0.3), tw * polarT);
    }
  }

  // --- 偏光の波のライン ---
  if (polarT > 0.002 && polarT < 0.998) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    const lx = sweepPos * SWEEP_AX * r;
    const ly = sweepPos * SWEEP_AY * r;
    const grad = ctx.createLinearGradient(
      lx - SWEEP_AX * r * 0.3,
      ly - SWEEP_AY * r * 0.3,
      lx + SWEEP_AX * r * 0.3,
      ly + SWEEP_AY * r * 0.3,
    );
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,245,210,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.rotate(Math.atan2(SWEEP_AY, SWEEP_AX));
    ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    ctx.restore();
  }

  // --- 視野のふち（ケラレ） ---
  const vig = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, polarT > 0.5 ? 'rgba(0,0,0,0.62)' : 'rgba(60,45,30,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  ctx.restore();

  // レンズのふちのリング
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(20,16,30,0.55)';
  ctx.lineWidth = Math.max(3, r * 0.035);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r + Math.max(3, r * 0.035), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** 画面の点 -> 薄片の単位座標 */
export function screenToField(view: FieldView, stageAngle: number, x: number, y: number): Pt {
  const dx = (x - view.cx) / view.r;
  const dy = (y - view.cy) / view.r;
  const c = Math.cos(-stageAngle);
  const s = Math.sin(-stageAngle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

/** 薄片の単位座標 -> 画面の点 */
export function fieldToScreen(view: FieldView, stageAngle: number, p: Pt): Pt {
  const c = Math.cos(stageAngle);
  const s = Math.sin(stageAngle);
  return {
    x: view.cx + (p.x * c - p.y * s) * view.r,
    y: view.cy + (p.x * s + p.y * c) * view.r,
  };
}

/** いま光っている粒の色（当たり判定用） */
export function currentColorOf(g: Grain, stageAngle: number, polarT: number): RGB {
  return grainDisplayColor(g, stageAngle, polarT);
}

export function grainBrightness(g: Grain, stageAngle: number): number {
  return grainIntensity(g, stageAngle);
}

export { rgbaToCss };

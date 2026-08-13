// canvas 2D で描く絵アイコン群。UI画像ファイルは使わない(禁止)ための素のcanvas描画。
// jsdomではgetContext('2d')がnullを返す(S2既知の事情)ため、全関数はnullガード済み(例外を出さない)。
import type { BehaviorId, FoodKind } from "../core/types";

export function makeIconCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const dpr = typeof window !== "undefined" && window.devicePixelRatio ? Math.min(2, window.devicePixelRatio) : 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.scale(dpr, dpr);
  return canvas;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawVegetable(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  const cy = s * 0.56;
  const r = s * 0.32;
  ctx.fillStyle = "#ff9a52";
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.78, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e8823a";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.fillStyle = "#5aa860";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 1.05, r * 0.42, r * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.3, cy - r * 1.1, r * 0.4, r * 0.22, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawHayCube(ctx: CanvasRenderingContext2D, s: number): void {
  const pad = s * 0.2;
  const size = s - pad * 2;
  ctx.fillStyle = "#e3c876";
  rounded(ctx, pad, pad, size, size, s * 0.09);
  ctx.fill();
  ctx.strokeStyle = "#c9a94d";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();
  ctx.strokeStyle = "#b89238";
  ctx.lineWidth = Math.max(1, s * 0.025);
  for (let i = 0; i < 4; i++) {
    const y = pad + size * (0.2 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(pad + size * 0.1, y);
    ctx.lineTo(pad + size * 0.9, y - size * 0.05);
    ctx.stroke();
  }
}

function drawBananaStem(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = "#b8d48e";
  ctx.lineWidth = s * 0.24;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.82);
  ctx.quadraticCurveTo(s * 0.08, s * 0.5, s * 0.42, s * 0.2);
  ctx.stroke();
  ctx.strokeStyle = "#f2ecd4";
  ctx.lineWidth = s * 0.08;
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.82);
  ctx.quadraticCurveTo(s * 0.08, s * 0.5, s * 0.42, s * 0.2);
  ctx.stroke();
}

function drawBranch(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = "#7a9a5a";
  ctx.lineWidth = s * 0.14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.18, s * 0.85);
  ctx.lineTo(s * 0.82, s * 0.2);
  ctx.stroke();
  ctx.strokeStyle = "#5aa860";
  ctx.lineWidth = s * 0.09;
  for (const t of [0.35, 0.6, 0.8]) {
    const x = s * (0.18 + 0.64 * t);
    const y = s * (0.85 - 0.65 * t);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * 0.14, y - s * 0.14);
    ctx.stroke();
  }
}

function drawGrass(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = "#5aa860";
  ctx.lineCap = "round";
  ctx.lineWidth = s * 0.07;
  const blades = [-0.28, -0.1, 0.08, 0.26];
  for (const b of blades) {
    ctx.beginPath();
    ctx.moveTo(s * (0.5 + b), s * 0.86);
    ctx.quadraticCurveTo(s * (0.5 + b * 1.6), s * 0.5, s * (0.5 + b * 0.5), s * 0.16);
    ctx.stroke();
  }
}

const FOOD_DRAWERS: Record<FoodKind, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  vegetable: drawVegetable,
  "hay-cube": drawHayCube,
  "banana-stem": drawBananaStem,
  branch: drawBranch,
  grass: drawGrass
};

export function drawFoodIcon(canvas: HTMLCanvasElement, kind: FoodKind, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  FOOD_DRAWERS[kind](ctx, size);
}

// ===== 行動アイコン(アルバムカード用): 鼻+石垣/砂山/土管/バナナ/枝の5種 =====

function drawTrunkArc(ctx: CanvasRenderingContext2D, s: number, tipX: number, tipY: number): void {
  ctx.strokeStyle = "#8d8681";
  ctx.lineWidth = s * 0.11;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.28);
  ctx.quadraticCurveTo(s * 0.5, s * 0.55, tipX, tipY);
  ctx.stroke();
  ctx.fillStyle = "#c9a8a0";
  ctx.beginPath();
  ctx.arc(tipX, tipY, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
}

function drawProbeGap(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = "#d9cfc0";
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 1 && col === 1) continue; // 隙間
      const w = s * 0.27;
      const h = s * 0.16;
      rounded(ctx, s * 0.08 + col * (w + s * 0.02), s * 0.58 + row * (h + s * 0.02), w, h, s * 0.02);
      ctx.fill();
    }
  }
  drawTrunkArc(ctx, s, s * 0.5, s * 0.7);
}

function drawDigSand(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = "#e8d5a8";
  ctx.beginPath();
  ctx.moveTo(s * 0.1, s * 0.85);
  ctx.quadraticCurveTo(s * 0.5, s * 0.55, s * 0.9, s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#cbb387";
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.8, s * 0.16, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  drawTrunkArc(ctx, s, s * 0.5, s * 0.62);
}

function drawReachPipe(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = "#9aa0a0";
  rounded(ctx, s * 0.12, s * 0.62, s * 0.76, s * 0.22, s * 0.11);
  ctx.fill();
  ctx.fillStyle = "#6f7674";
  ctx.beginPath();
  ctx.ellipse(s * 0.16, s * 0.73, s * 0.06, s * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  drawTrunkArc(ctx, s, s * 0.32, s * 0.68);
}

function drawPeelBanana(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = "#b8d48e";
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.86);
  ctx.quadraticCurveTo(s * 0.14, s * 0.5, s * 0.42, s * 0.18);
  ctx.stroke();
  ctx.strokeStyle = "#f2ecd4";
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.86);
  ctx.quadraticCurveTo(s * 0.14, s * 0.5, s * 0.42, s * 0.18);
  ctx.stroke();
  drawTrunkArc(ctx, s, s * 0.66, s * 0.5);
}

function drawBreakBranch(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.strokeStyle = "#7a9a5a";
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.18, s * 0.82);
  ctx.lineTo(s * 0.55, s * 0.32);
  ctx.stroke();
  ctx.strokeStyle = "#5aa860";
  ctx.lineWidth = s * 0.07;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, s * 0.32);
  ctx.lineTo(s * 0.78, s * 0.44);
  ctx.stroke();
  drawTrunkArc(ctx, s, s * 0.68, s * 0.55);
}

const BEHAVIOR_DRAWERS: Record<BehaviorId, (ctx: CanvasRenderingContext2D, s: number) => void> = {
  "probe-gap": drawProbeGap,
  "dig-sand": drawDigSand,
  "reach-pipe": drawReachPipe,
  "peel-banana": drawPeelBanana,
  "break-branch": drawBreakBranch
};

export function drawBehaviorIcon(canvas: HTMLCanvasElement, id: BehaviorId, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  BEHAVIOR_DRAWERS[id](ctx, size);
}

export function drawPlayGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(size * 0.36, size * 0.24);
  ctx.lineTo(size * 0.36, size * 0.76);
  ctx.lineTo(size * 0.78, size * 0.5);
  ctx.closePath();
  ctx.fill();
}

export function drawInfoGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.28, size * 0.09, 0, Math.PI * 2);
  ctx.fill();
  rounded(ctx, size * 0.41, size * 0.44, size * 0.18, size * 0.34, size * 0.06);
  ctx.fill();
}

export function drawHomeGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.18);
  ctx.lineTo(size * 0.84, size * 0.46);
  ctx.lineTo(size * 0.74, size * 0.46);
  ctx.lineTo(size * 0.74, size * 0.82);
  ctx.lineTo(size * 0.26, size * 0.82);
  ctx.lineTo(size * 0.26, size * 0.46);
  ctx.lineTo(size * 0.16, size * 0.46);
  ctx.closePath();
  ctx.fill();
}

export function drawAgainGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.52, size * 0.28, Math.PI * 0.25, Math.PI * 1.85);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.14);
  ctx.lineTo(size * 0.66, size * 0.26);
  ctx.lineTo(size * 0.48, size * 0.34);
  ctx.closePath();
  ctx.fill();
}

export function drawShuffleGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(size * 0.2, size * 0.32);
  ctx.lineTo(size * 0.5, size * 0.32);
  ctx.lineTo(size * 0.8, size * 0.68);
  ctx.moveTo(size * 0.2, size * 0.68);
  ctx.lineTo(size * 0.5, size * 0.68);
  ctx.lineTo(size * 0.8, size * 0.32);
  ctx.stroke();
}

export function drawCompassGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = size * 0.06;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.32, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.26);
  ctx.lineTo(size * 0.58, size * 0.5);
  ctx.lineTo(size * 0.5, size * 0.74);
  ctx.lineTo(size * 0.42, size * 0.5);
  ctx.closePath();
  ctx.fill();
}

/** ヒント用の「そっと指差す」絵。矢印は使わず、指先だけで方向を示す(ART_DIRECTION: 矢印過多禁止)。 */
export function drawPointingHandGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#e0b088";
  ctx.beginPath();
  ctx.ellipse(size * 0.42, size * 0.62, size * 0.2, size * 0.24, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.55, size * 0.5);
  ctx.quadraticCurveTo(size * 0.86, size * 0.32, size * 0.9, size * 0.2);
  ctx.quadraticCurveTo(size * 0.95, size * 0.3, size * 0.7, size * 0.48);
  ctx.closePath();
  ctx.fill();
}

export function drawHandSwipeGlyph(canvas: HTMLCanvasElement, size: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#5a4a3a";
  ctx.beginPath();
  ctx.ellipse(size * 0.42, size * 0.55, size * 0.16, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(size * (0.34 + i * 0.09), size * 0.28, size * 0.06, size * 0.24);
  }
  ctx.strokeStyle = "#5a4a3a";
  ctx.lineWidth = size * 0.045;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(size * 0.66, size * 0.5);
  ctx.lineTo(size * 0.86, size * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.78, size * 0.42);
  ctx.lineTo(size * 0.86, size * 0.5);
  ctx.lineTo(size * 0.78, size * 0.58);
  ctx.stroke();
}

import type { Camera } from '../engine/camera';
import { GROUND_Y, type Specimen } from '../sim/models';
import { roundRectPath } from '../engine/util';

/** 偏光板のあいだ＝暗い実験箱。まっ黒に近いほど虹が映える。 */
export function drawBackground(ctx: CanvasRenderingContext2D, cam: Camera): void {
  const v = cam.visibleRect();
  const g = ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
  g.addColorStop(0, '#05070f');
  g.addColorStop(0.55, '#080b16');
  g.addColorStop(1, '#03040a');
  ctx.fillStyle = g;
  ctx.fillRect(v.x, v.y, v.w, v.h);

  // 光源（うしろの偏光板がぼんやり光っている）
  const r = ctx.createRadialGradient(600, 470, 40, 600, 470, 620);
  r.addColorStop(0, 'rgba(52,86,140,0.30)');
  r.addColorStop(0.5, 'rgba(28,46,86,0.14)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = r;
  ctx.fillRect(v.x, v.y, v.w, v.h);
}

/**
 * 前面の偏光板のわく（実験装置らしさ）。
 * 接写になったら消す —— 模型に寄っているときは、まわりはまっ黒なほうが虹が映える。
 */
export function drawPolariscopeFrame(ctx: CanvasRenderingContext2D, zoom: number): void {
  const a = Math.max(0, Math.min(1, (0.62 - zoom) / 0.2));
  if (a < 0.02) return;
  ctx.save();
  ctx.globalAlpha = a;
  roundRectPath(ctx, 96, 140, 1008, 760, 46);
  ctx.strokeStyle = 'rgba(96,132,190,0.30)';
  ctx.lineWidth = 7 / zoom;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,196,255,0.14)';
  ctx.lineWidth = 2 / zoom;
  ctx.stroke();

  // 偏光の向きを示す小さな矢印（たて／よこ）
  drawPolarMark(ctx, 150, 190, 0, zoom);
  drawPolarMark(ctx, 1050, 190, Math.PI / 2, zoom);
  ctx.restore();
}

function drawPolarMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  zoom: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(150,200,255,0.45)';
  ctx.lineWidth = 3 / zoom;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(0, 14);
  ctx.stroke();
  ctx.restore();
}

/** 実験台。 */
export function drawBench(ctx: CanvasRenderingContext2D): void {
  const top = GROUND_Y;
  ctx.save();
  const grad = ctx.createLinearGradient(0, top, 0, top + 80);
  grad.addColorStop(0, '#243352');
  grad.addColorStop(0.25, '#16203a');
  grad.addColorStop(1, '#0a1020');
  roundRectPath(ctx, 150, top, 900, 80, 16);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,190,255,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 天板のハイライト
  ctx.beginPath();
  ctx.moveTo(164, top + 4);
  ctx.lineTo(1036, top + 4);
  ctx.strokeStyle = 'rgba(190,225,255,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

/** 模型を支える台（橋のきょうきゃく・アーチの土台・はちなど）。 */
export function drawProps(ctx: CanvasRenderingContext2D, sp: Specimen): void {
  ctx.save();
  if (sp.id === 'bridge') {
    for (const a of sp.anchors) drawPier(ctx, a.x, a.y);
  } else if (sp.id === 'arch') {
    for (const a of sp.anchors) drawFootBlock(ctx, a.x, GROUND_Y);
  } else {
    drawPot(ctx, 600, GROUND_Y);
  }
  ctx.restore();
}

function drawPier(ctx: CanvasRenderingContext2D, x: number, topY: number): void {
  const h = GROUND_Y - topY;
  ctx.save();
  const grad = ctx.createLinearGradient(x - 52, 0, x + 52, 0);
  grad.addColorStop(0, '#16223c');
  grad.addColorStop(0.42, '#33507f');
  grad.addColorStop(1, '#101a30');
  ctx.beginPath();
  ctx.moveTo(x - 34, topY);
  ctx.lineTo(x + 34, topY);
  ctx.lineTo(x + 50, topY + h);
  ctx.lineTo(x - 50, topY + h);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,200,255,0.4)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawFootBlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  roundRectPath(ctx, x - 66, y - 14, 132, 30, 8);
  const grad = ctx.createLinearGradient(0, y - 14, 0, y + 16);
  grad.addColorStop(0, '#34517f');
  grad.addColorStop(1, '#111c33');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,200,255,0.4)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawPot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 78, y - 16);
  ctx.lineTo(x + 78, y - 16);
  ctx.lineTo(x + 58, y + 44);
  ctx.lineTo(x - 58, y + 44);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, y - 16, 0, y + 44);
  grad.addColorStop(0, '#4a6ea8');
  grad.addColorStop(1, '#16233d');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,205,255,0.45)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

/** 動かせる支えのつまみ。 */
export function drawAnchorHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  active: boolean,
): void {
  const pulse = active ? 1.15 : 1 + Math.sin(t * 3) * 0.06;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fillStyle = active ? 'rgba(255,214,102,0.95)' : 'rgba(120,190,255,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // ←→ のしるし
  ctx.strokeStyle = '#0b1226';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(12, 0);
  ctx.moveTo(-12, 0);
  ctx.lineTo(-6, -6);
  ctx.moveTo(-12, 0);
  ctx.lineTo(-6, 6);
  ctx.moveTo(12, 0);
  ctx.lineTo(6, -6);
  ctx.moveTo(12, 0);
  ctx.lineTo(6, 6);
  ctx.stroke();
  ctx.restore();
}

/** くまさん。 */
export function drawBear(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  phase: number,
  walking: boolean,
  cheer = 0,
): void {
  const bob = walking ? Math.abs(Math.sin(phase * 6)) * 5 : 0;
  const swing = walking ? Math.sin(phase * 6) * 10 : 0;
  ctx.save();
  ctx.translate(x, y - bob);
  const body = '#c8874c';
  const dark = '#8a5622';
  const light = '#f2d7b0';

  // あし
  ctx.lineCap = 'round';
  ctx.strokeStyle = dark;
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(-9, -14);
  ctx.lineTo(-9 + swing * 0.6, 0);
  ctx.moveTo(9, -14);
  ctx.lineTo(9 - swing * 0.6, 0);
  ctx.stroke();

  // からだ
  ctx.beginPath();
  ctx.ellipse(0, -33, 22, 21, 0, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.stroke();

  // て
  ctx.strokeStyle = dark;
  ctx.lineWidth = 11;
  ctx.beginPath();
  if (cheer > 0) {
    ctx.moveTo(-16, -38);
    ctx.lineTo(-28, -56);
    ctx.moveTo(16, -38);
    ctx.lineTo(28, -56);
  } else {
    ctx.moveTo(-16, -36);
    ctx.lineTo(-22 - swing * 0.3, -26);
    ctx.moveTo(16, -36);
    ctx.lineTo(22 + swing * 0.3, -26);
  }
  ctx.stroke();

  // みみ
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 17, -76, 10, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // あたま
  ctx.beginPath();
  ctx.arc(0, -63, 22, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 3;
  ctx.stroke();

  // はな・くち
  ctx.beginPath();
  ctx.ellipse(0, -56, 11, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -59, 3.4, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5a3a18';
  ctx.fill();

  // め
  ctx.fillStyle = '#2a1a08';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 8, -69, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // ほっぺ
  ctx.fillStyle = 'rgba(255,140,140,0.5)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * 15, -60, 4.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** くまさんの行き先（ゴール）のはた。 */
export function drawGoalFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  reached: boolean,
): void {
  const wave = Math.sin(t * 3) * 5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#dfeaff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -78);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -78);
  ctx.quadraticCurveTo(24, -70 + wave, 46, -62);
  ctx.quadraticCurveTo(24, -50 + wave, 0, -46);
  ctx.closePath();
  ctx.fillStyle = reached ? '#ffd24a' : '#ff6f8b';
  ctx.fill();
  if (reached) drawStar(ctx, 22, -94, 14, '#ffd24a', t * 2);
  ctx.restore();
}

/** おもり。 */
export function drawWeight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 1,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  // とって
  ctx.beginPath();
  ctx.arc(0, -46, 17, Math.PI, Math.PI * 2);
  ctx.strokeStyle = '#8fa6c8';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-40, -42);
  ctx.lineTo(40, -42);
  ctx.lineTo(30, 0);
  ctx.lineTo(-30, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(-40, -42, 40, 0);
  g.addColorStop(0, '#7d90b4');
  g.addColorStop(0.45, '#c3d3ea');
  g.addColorStop(1, '#5d6f92');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#e8f2ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

/** 「ここをおしてね」の指マーク。 */
export function drawHandHint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  const press = (Math.sin(t * 2.6) + 1) / 2;
  const rise = 26 * (1 - press);
  ctx.save();
  ctx.translate(x, y);

  // ひろがる輪
  for (let i = 0; i < 2; i++) {
    const p = ((t * 0.8 + i * 0.5) % 1);
    ctx.beginPath();
    ctx.arc(0, 0, 20 + p * 70, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.34 * (1 - p)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  ctx.translate(0, rise + 6);
  ctx.rotate(-0.22);
  // ゆび
  ctx.beginPath();
  roundRectPath(ctx, -11, 0, 22, 52, 11);
  ctx.fillStyle = '#fff6e8';
  ctx.fill();
  ctx.strokeStyle = '#3a2a18';
  ctx.lineWidth = 3;
  ctx.stroke();
  // こぶし
  ctx.beginPath();
  roundRectPath(ctx, -26, 34, 52, 44, 18);
  ctx.fillStyle = '#fff6e8';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** チャレンジの目標マーク（虹をここまで届かせる）。 */
export function drawTargetRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: number,
  t: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  const r = 40;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 7;
  ctx.stroke();
  if (fill > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, fill));
    ctx.strokeStyle = '#ffd34a';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  if (fill >= 1) {
    drawStar(ctx, 0, 0, 22, `rgba(255,225,110,${0.8 + Math.sin(t * 8) * 0.2})`);
  }
  ctx.restore();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  rot = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** 指の接地点にひろがる波紋。 */
export function drawTouchRipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  force: number,
  t: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 26 + force * 10 + Math.sin(t * 9) * 3;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.4, 'rgba(180,220,255,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

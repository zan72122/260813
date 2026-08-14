// 工房・桶・抄き枠・道具の描画。すべてワールド座標系で描く。
import { clamp, lerp, TAU, roundRect, makeNoise } from './util.js';

const nz = makeNoise(31);

// 液面用の低解像度バッファ。拡大スムージングで、塊の境目をとろけさせる。
const GW = 132, GH = 96;
let gooC = null, gooX = null;
function gooBuffer() {
  if (!gooC) {
    gooC = document.createElement('canvas');
    gooC.width = GW; gooC.height = GH;
    gooX = gooC.getContext('2d');
  }
  return gooX;
}

// noVignette: 背景をワールド空間のキャッシュへ焼くとき用（周辺減光は画面側で掛ける）
export function drawWorkshop(ctx, view, t, horizon = 0, props = null, noVignette = false) {
  const { x0, y0, x1, y1 } = view;
  const W = x1 - x0, H = y1 - y0;
  const g = ctx.createLinearGradient(0, horizon - 1400, 0, horizon);
  g.addColorStop(0, '#151d1a');
  g.addColorStop(0.6, '#1f2620');
  g.addColorStop(1, '#2a2b22');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, W, H);

  // 奥の板壁
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, W, Math.max(0, horizon - y0));
  ctx.clip();
  for (let i = -18; i < 18; i++) {
    const px = i * 160;
    if (px < x0 - 170 || px > x1 + 170) continue;
    ctx.fillStyle = i % 2 ? 'rgba(74,62,45,0.22)' : 'rgba(48,42,32,0.22)';
    ctx.fillRect(px, horizon - 1600, 160, 1600);
  }
  // 壁に掛かった簾（伏線）
  for (const mx of [-760, -430, 430, 780]) {
    if (mx < x0 - 240 || mx > x1 + 240) continue;
    const my = horizon - 560;
    ctx.fillStyle = 'rgba(96,78,50,0.30)';
    ctx.fillRect(mx - 95, my, 190, 300);
    ctx.strokeStyle = 'rgba(20,16,10,0.24)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(mx - 95, my + i * 30 + 12); ctx.lineTo(mx + 95, my + i * 30 + 12);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 窓あかり
  const lg = ctx.createRadialGradient(-320, horizon - 780, 30, -320, horizon - 780, 1000);
  lg.addColorStop(0, 'rgba(255,226,170,0.17)');
  lg.addColorStop(1, 'rgba(255,226,170,0)');
  ctx.fillStyle = lg;
  ctx.fillRect(x0, y0, W, H);

  // 床
  const fy = horizon;
  const fg = ctx.createLinearGradient(0, fy, 0, fy + 1500);
  fg.addColorStop(0, '#453a2b');
  fg.addColorStop(1, '#1e1a13');
  ctx.fillStyle = fg;
  ctx.fillRect(x0, fy, W, Math.max(0, y1 - fy));
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 10; i++) {
    const yy = fy + 1500 * (i / 10) * (i / 10);
    if (yy > y1) break;
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
  }
  drawProps(ctx, view, horizon, props);
  if (!noVignette) drawVignette(ctx, view);
}

export function drawVignette(ctx, view) {
  const { x0, y0, x1, y1 } = view;
  const vg = ctx.createRadialGradient((x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) * 0.28,
    (x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}

// 接地影。接触部のきつい暗さ(AO)と、やわらかい落ち影を分けて描く。
// 「置かれている」感の正体はこの2層。
export function contactShadow(ctx, x, y, rx, ry) {
  const g1 = ctx.createRadialGradient(x, y, 0, x, y, rx * 1.9);
  g1.addColorStop(0, 'rgba(0,0,0,0.34)');
  g1.addColorStop(0.55, 'rgba(0,0,0,0.14)');
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, (ry * 1.9) / (rx * 1.9));
  ctx.translate(-x, -y);
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(x, y, rx * 1.9, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 接触線の直下だけ強く暗く
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 0.94, ry * 0.42, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();
}

// 工房の小物（シルエット）。奥行きと「ここは何かを作る場所だ」感を出す。
function drawProps(ctx, view, horizon, props) {
  const { x0, x1 } = view;
  const bucket = (x, s, tone) => {
    if (x < x0 - 200 * s || x > x1 + 200 * s) return;
    ctx.save();
    ctx.translate(x, horizon);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-70, -150); ctx.lineTo(70, -150); ctx.lineTo(52, 8); ctx.lineTo(-52, 8);
    ctx.closePath();
    ctx.fillStyle = tone;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -150, 70, 20, 0, 0, TAU);
    ctx.fillStyle = 'rgba(24,20,13,0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,15,0.5)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-64, -90); ctx.lineTo(64, -90); ctx.stroke();
    ctx.restore();
  };
  // 立てかけた抄き枠
  const frames = (x, s) => {
    if (x < x0 - 260 * s || x > x1 + 260 * s) return;
    ctx.save();
    ctx.translate(x, horizon);
    ctx.scale(s, s);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(-0.14 + i * 0.045);
      ctx.fillStyle = `rgba(${86 - i * 10},${68 - i * 8},${42 - i * 5},0.9)`;
      ctx.fillRect(-110 + i * 24, -330, 210, 336);
      ctx.fillStyle = 'rgba(18,16,10,0.75)';
      ctx.fillRect(-92 + i * 24, -312, 174, 300);
      ctx.restore();
    }
    ctx.restore();
  };
  for (const p of props || []) {
    if (p.kind === 'frames') frames(p.x, p.s);
    else bucket(p.x, p.s, p.tone || 'rgba(68,54,35,0.92)');
  }
}

// ---- 桶とどろどろ ------------------------------------------------------
export function drawVat(ctx, vat, t, swirl, level = 1, mixed = 0) {
  const { x, y, rx, ry } = vat;
  ctx.save();
  contactShadow(ctx, x, y + ry * 1.62, rx * 0.94, ry * 0.34);

  // 桶の胴
  const body = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  body.addColorStop(0, '#5b452c');
  body.addColorStop(0.35, '#8a6a41');
  body.addColorStop(0.75, '#6d5232');
  body.addColorStop(1, '#4a381f');
  ctx.beginPath();
  ctx.moveTo(x - rx, y);
  ctx.lineTo(x - rx * 0.9, y + ry * 0.95);
  ctx.quadraticCurveTo(x, y + ry * 1.75, x + rx * 0.9, y + ry * 0.95);
  ctx.lineTo(x + rx, y);
  ctx.closePath();
  ctx.fillStyle = body;
  ctx.fill();
  // たが
  ctx.strokeStyle = 'rgba(40,30,18,0.55)';
  ctx.lineWidth = rx * 0.035;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y + ry * (0.4 * i + 0.25), rx * (1 - 0.05 * i), ry * (0.5 - 0.05 * i), 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  // 内側（液面より上の壁）
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = '#33261a';
  ctx.fill();

  // 液面
  const ly = y + ry * (1 - level) * 0.55;
  const lrx = rx * (0.9 + 0.1 * level), lry = ry * (0.86 + 0.14 * level);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, ly, lrx, lry, 0, 0, TAU);
  ctx.clip();
  const sg = ctx.createRadialGradient(x - lrx * 0.25, ly - lry * 0.35, lrx * 0.05, x, ly, lrx * 1.15);
  sg.addColorStop(0, '#1c2e21');
  sg.addColorStop(0.5, '#122016');
  sg.addColorStop(1, '#050c08');
  ctx.fillStyle = sg;
  ctx.fillRect(x - lrx, ly - lry, lrx * 2, lry * 2);

  // 渦: 半径ごとに回転速度を変えた粘い塊。
  // 低解像度に描いてから拡大するので、境目がとろけて「どろどろ」になる。
  const gx = gooBuffer();
  gx.setTransform(1, 0, 0, 1, 0, 0);
  gx.clearRect(0, 0, GW, GH);
  const blobs = 40;
  for (let i = 0; i < blobs; i++) {
    const rr = 0.12 + (i % 7) / 7 * 0.86;
    const base = (i / blobs) * TAU * 3.1;
    const a = base + swirl * (1.5 - rr * 0.9);
    const wob = nz.fbm(i * 0.7, t * 0.25, 2);
    const bx = GW / 2 + Math.cos(a) * (GW / 2) * rr * (0.86 + wob * 0.3);
    const by = GH / 2 + Math.sin(a) * (GH / 2) * rr * (0.86 + wob * 0.3);
    const s = GW * (0.055 + wob * 0.075);
    const light = (i % 5 === 0);
    gx.beginPath();
    gx.ellipse(bx, by, s, s * 0.66, a, 0, TAU);
    gx.ellipse(bx + s * 0.7, by + s * 0.2, s * 0.7, s * 0.5, a * 1.7, 0, TAU);
    gx.fillStyle = light
      ? `rgba(52,80,52,${0.30 + mixed * 0.18})`
      : `rgba(2,8,5,${0.5 + mixed * 0.16})`;
    gx.fill();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(gooC, x - lrx, ly - lry, lrx * 2, lry * 2);
  // ぶくっと浮く泡
  for (let i = 0; i < 5; i++) {
    const ph = (t * 0.32 + i * 0.2) % 1;
    const a = i * 2.31 + swirl * 0.4;
    const rr = 0.25 + (i % 3) * 0.22;
    const bx = x + Math.cos(a) * lrx * rr;
    const by = ly + Math.sin(a) * lry * rr;
    const s = lrx * 0.05 * Math.sin(ph * Math.PI);
    if (s <= 0.4) continue;
    ctx.beginPath();
    ctx.ellipse(bx, by, s, s * 0.72, 0, 0, TAU);
    ctx.fillStyle = 'rgba(26,44,28,0.8)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bx - s * 0.25, by - s * 0.3, s * 0.38, s * 0.22, -0.4, 0, TAU);
    ctx.fillStyle = 'rgba(160,200,160,0.28)';
    ctx.fill();
  }
  // てかり
  ctx.beginPath();
  ctx.ellipse(x - lrx * 0.32, ly - lry * 0.36, lrx * 0.40, lry * 0.20, -0.35, 0, TAU);
  ctx.fillStyle = 'rgba(184,220,190,0.11)';
  ctx.fill();
  ctx.restore();

  // 縁
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.lineWidth = rx * 0.075;
  ctx.strokeStyle = '#8d6c43';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y - rx * 0.012, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.lineWidth = rx * 0.03;
  ctx.strokeStyle = 'rgba(226,196,150,0.5)';
  ctx.stroke();
  ctx.restore();
}

// ---- 抄き枠 ------------------------------------------------------------
// geo.q(u,v) は枠内の正規化座標→ワールド。範囲外にも線形に外挿できる。
export function drawFrameBase(ctx, geo, t) {
  const q = geo.q;
  const m = 0.075;
  const o00 = q(-m, -m), o10 = q(1 + m, -m), o11 = q(1 + m, 1 + m), o01 = q(-m, 1 + m);

  ctx.save();
  // 落ち影（やわらかく大きく）と、接触部のきつい暗さ
  ctx.save();
  ctx.translate(geo.h * 0.035, geo.h * 0.075);
  ctx.filter = 'none';
  ctx.beginPath();
  ctx.moveTo(o00.x, o00.y); ctx.lineTo(o10.x, o10.y); ctx.lineTo(o11.x, o11.y); ctx.lineTo(o01.x, o01.y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.fill();
  ctx.restore();
  contactShadow(ctx, (o01.x + o11.x) / 2, o11.y - 2, Math.abs(o11.x - o01.x) * 0.5, geo.h * 0.05);

  // 木枠（外周）
  ctx.beginPath();
  ctx.moveTo(o00.x, o00.y); ctx.lineTo(o10.x, o10.y); ctx.lineTo(o11.x, o11.y); ctx.lineTo(o01.x, o01.y);
  ctx.closePath();
  const wg = ctx.createLinearGradient(o00.x, o00.y, o11.x, o11.y);
  wg.addColorStop(0, '#a07c4c');
  wg.addColorStop(0.5, '#7d5f38');
  wg.addColorStop(1, '#5c4426');
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,26,14,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 内側（簾）
  const i00 = q(0, 0), i10 = q(1, 0), i11 = q(1, 1), i01 = q(0, 1);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(i00.x, i00.y); ctx.lineTo(i10.x, i10.y); ctx.lineTo(i11.x, i11.y); ctx.lineTo(i01.x, i01.y);
  ctx.closePath();
  ctx.fillStyle = '#2a2419';
  ctx.fill();
  ctx.clip();
  // 竹ひご（横）
  const rows = 22;
  for (let i = 0; i <= rows; i++) {
    const v = i / rows;
    const a = q(0, v), b = q(1, v);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = i % 2 ? 'rgba(163,131,79,0.55)' : 'rgba(120,94,55,0.55)';
    ctx.lineWidth = lerp(2.2, 4.2, v);
    ctx.stroke();
  }
  // 糸（縦）
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    const a = q(u, 0), b = q(u, 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(226,206,168,0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

// 手前側のレール（シートより前に描く）
export function drawFrameFront(ctx, geo) {
  const q = geo.q;
  const m = 0.075;
  const a = q(-m, 1), b = q(1 + m, 1), c = q(1 + m, 1 + m), d = q(-m, 1 + m);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, a.y, 0, d.y);
  g.addColorStop(0, '#b08a55');
  g.addColorStop(1, '#6b5030');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,26,14,0.55)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

// ---- 道具 --------------------------------------------------------------
export function drawLadle(ctx, x, y, tilt, load) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  const R = 74;
  // 柄
  ctx.save();
  ctx.rotate(-0.5);
  const hg = ctx.createLinearGradient(0, -14, 0, 14);
  hg.addColorStop(0, '#c19a63');
  hg.addColorStop(1, '#7c5c34');
  ctx.fillStyle = hg;
  roundRect(ctx, -6, -13, 210, 26, 13);
  ctx.fill();
  ctx.restore();
  // 器
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.78, 0, 0, TAU);
  const bg = ctx.createLinearGradient(-R, -R, R, R);
  bg.addColorStop(0, '#a8814f');
  bg.addColorStop(1, '#5e4626');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,28,16,0.6)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // 中身
  if (load > 0.02) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.86, R * 0.66, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#1b2f21';
    ctx.fillRect(-R, -R + (1 - load) * R * 1.2, R * 2, R * 2);
    ctx.beginPath();
    ctx.ellipse(-R * 0.3, -R * 0.18 + (1 - load) * R * 1.2, R * 0.3, R * 0.12, -0.3, 0, TAU);
    ctx.fillStyle = 'rgba(160,200,164,0.2)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawSponge(ctx, x, y, squash) {
  ctx.save();
  ctx.translate(x, y);
  const w = 210 * (1 + squash * 0.14), h = 118 * (1 - squash * 0.34);
  contactShadow(ctx, 0, h * 0.60, w * 0.48, 18);
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, '#ffd772');
  g.addColorStop(0.55, '#f2b53f');
  g.addColorStop(1, '#c98a24');
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, -h / 2, w, h, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,74,12,0.45)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // 気泡
  ctx.fillStyle = 'rgba(150,92,18,0.28)';
  for (let i = 0; i < 16; i++) {
    const a = i * 2.399;
    const rr = Math.sqrt((i + 1) / 17);
    const px = Math.cos(a) * rr * w * 0.4, py = Math.sin(a) * rr * h * 0.3;
    ctx.beginPath();
    ctx.ellipse(px, py, 8 - rr * 3, 6 - rr * 2, 0, 0, TAU);
    ctx.fill();
  }
  // 上面ハイライト
  ctx.beginPath();
  roundRect(ctx, -w / 2 + 16, -h / 2 + 10, w - 32, h * 0.24, 16);
  ctx.fillStyle = 'rgba(255,246,206,0.4)';
  ctx.fill();
  ctx.restore();
}

export function drawFanAndLever(ctx, lever, fan, leverPull, spin, wind) {
  // 送風機
  ctx.save();
  ctx.translate(fan.x, fan.y);
  const R = 96;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.16, 0, TAU);
  ctx.fillStyle = '#3a3228';
  ctx.fill();
  ctx.strokeStyle = '#544636';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
  ctx.fillStyle = '#1a1712';
  ctx.fillRect(-R, -R, R * 2, R * 2);
  ctx.rotate(spin);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(TAU / 4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(R * 0.75, -R * 0.42, R * 0.94, R * 0.12);
    ctx.quadraticCurveTo(R * 0.5, R * 0.3, 0, 0);
    ctx.fillStyle = `rgba(198,206,196,${0.75 - Math.min(0.45, wind * 0.45)})`;
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.17, 0, TAU);
  ctx.fillStyle = '#8b7a5f'; ctx.fill();
  // 保護格子
  ctx.strokeStyle = 'rgba(220,220,220,0.16)';
  ctx.lineWidth = 3;
  for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, 0, R * i / 3.2, 0, TAU); ctx.stroke(); }
  ctx.restore();

  // レバー
  ctx.save();
  ctx.translate(lever.x, lever.y);
  ctx.fillStyle = '#4a3f30';
  roundRect(ctx, -16, -20, 32, 190, 12);
  ctx.fill();
  const ang = lerp(-0.5, 0.62, leverPull);
  ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -150, 0, 0);
  g.addColorStop(0, '#d8b070');
  g.addColorStop(1, '#8a6a3c');
  ctx.fillStyle = g;
  roundRect(ctx, -13, -152, 26, 160, 13);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -152, 34, 0, TAU);
  const kg = ctx.createRadialGradient(-10, -164, 4, 0, -152, 36);
  kg.addColorStop(0, '#ff9f7a');
  kg.addColorStop(1, '#c9503a');
  ctx.fillStyle = kg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,20,10,0.4)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

// ---- 仕上げ演出 --------------------------------------------------------
export function drawNoriSheetIcon(ctx, x, y, w, h, rot = 0, alpha = 1, curl = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.quadraticCurveTo(0, -h / 2 - curl * h * 0.12, w / 2, -h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.quadraticCurveTo(0, h / 2 + curl * h * 0.12, -w / 2, h / 2);
  ctx.closePath();
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#16271c');
  g.addColorStop(0.5, '#0e1b13');
  g.addColorStop(1, '#1a2e20');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,150,116,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export function drawOnigiri(ctx, x, y, s, wrap) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.ellipse(0, 96, 96, 22, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  // ごはん
  ctx.beginPath();
  ctx.moveTo(0, -104);
  ctx.quadraticCurveTo(70, -78, 96, 64);
  ctx.quadraticCurveTo(0, 100, -96, 64);
  ctx.quadraticCurveTo(-70, -78, 0, -104);
  ctx.closePath();
  const rg = ctx.createLinearGradient(-40, -100, 40, 90);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(1, '#e8e1cf');
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,150,126,0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // ごま粒
  ctx.fillStyle = 'rgba(190,180,158,0.8)';
  for (let i = 0; i < 22; i++) {
    const a = i * 2.399, rr = Math.sqrt(i / 22);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * rr * 66, Math.sin(a) * rr * 62 - 12, 3.4, 2.4, a, 0, TAU);
    ctx.fill();
  }
  // 海苔の帯
  if (wrap > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -104);
    ctx.quadraticCurveTo(70, -78, 96, 64);
    ctx.quadraticCurveTo(0, 100, -96, 64);
    ctx.quadraticCurveTo(-70, -78, 0, -104);
    ctx.closePath();
    ctx.clip();
    const w = 230 * wrap;
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#0a150e');
    g.addColorStop(0.45, '#1c3122');
    g.addColorStop(1, '#0a150e');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2, 4, w, 130);
    ctx.fillStyle = 'rgba(150,180,148,0.10)';
    ctx.fillRect(-w / 2, 12, w, 10);
    ctx.restore();
  }
  ctx.restore();
}

export function drawBento(ctx, x, y, s, open) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = open;
  roundRect(ctx, -230, -140, 460, 280, 26);
  const g = ctx.createLinearGradient(0, -140, 0, 140);
  g.addColorStop(0, '#d95b4a');
  g.addColorStop(1, '#a03526');
  ctx.fillStyle = g;
  ctx.fill();
  roundRect(ctx, -210, -120, 420, 240, 18);
  ctx.fillStyle = '#f5efe0';
  ctx.fill();
  // 巻物（断面）
  const spots = [[-110, -40], [10, -50], [-50, 55], [80, 45], [140, -20]];
  for (let i = 0; i < spots.length; i++) {
    const px = spots[i][0], py = spots[i][1];
    ctx.beginPath();
    ctx.arc(px, py, 44, 0, TAU);
    ctx.fillStyle = '#12241a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 36, 0, TAU);
    ctx.fillStyle = '#fbf7ec';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, TAU);
    ctx.fillStyle = '#e2683f';
    ctx.fill();
  }
  ctx.restore();
}

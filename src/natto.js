// 納豆の「塊」と「糸」を描く。
//
// 本物っぽさの大半は豆そのものではなく、豆と豆の“あいだ”にある：
//   ・粘りで豆どうしがつながって 1 つの塊になっていること
//   ・接触点に落ちる影と、濡れたふちの光
//   ・半透明で細さがばらつき、途中に液の玉ができる糸
// ここではその 3 つを作る。
import { TAU, clamp, lerp } from './util.js';

/* ------------------------------------------------------------------ */
/* 焼き込み済みスプライトの読み込み                                     */
/* ------------------------------------------------------------------ */

export const BEAN_ATLAS = {
  cell: 256, cols: 4, rows: 2, variants: 8,
  states: ['dry', 'soaked', 'steamed', 'fermented', 'mixed'],
};

const images = new Map();
let ready = false;

export function loadAssets(base = './assets/') {
  const jobs = BEAN_ATLAS.states.map((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { images.set(s, im); res(true); };
    im.onerror = () => res(false);
    im.src = `${base}bean-${s}.png`;
  }));
  return Promise.all(jobs).then((r) => { ready = r.every(Boolean); return ready; });
}

export const assetsReady = () => ready;

/** 豆スプライトを 1 粒描く。r は短半径。 */
export function drawBeanSprite(ctx, state, variant, x, y, r, rot = 0, alpha = 1) {
  const im = images.get(state);
  if (!im) return false;
  const C = BEAN_ATLAS.cell;
  const sx = (variant % BEAN_ATLAS.cols) * C;
  const sy = ((variant / BEAN_ATLAS.cols) | 0) * C;
  // スプライトの豆は短半径がセルの約 0.40（縦 0.94*aspect ≒ 0.72）
  const h = r / 0.36;
  const w = h;
  // 回転はしない。スプライトには光が焼き込まれているので、回すと光源まで回る。
  // 向きの違いは焼き込み側で 8 通り作ってある（variant で選ぶ）。
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(im, sx, sy, C, C, x - w / 2, y - h / 2, w, h);
  ctx.restore();
  return true;
}

/** 2 つの状態をまたぐ豆（発酵 → 混ぜた）。sticky で重ねる。 */
export function drawBeanBlend(ctx, from, to, t, variant, x, y, r, rot = 0) {
  drawBeanSprite(ctx, from, variant, x, y, r, rot, 1);
  if (t > 0.01) drawBeanSprite(ctx, to, variant, x, y, r, rot, clamp(t, 0, 1));
}

/* ------------------------------------------------------------------ */
/* 粘りの塊（メタボール）                                              */
/* ------------------------------------------------------------------ */

/** 作業用のオフスクリーン。塊はぼんやりした下地なので半解像度で十分。 */
class Buf {
  constructor() {
    this.c = document.createElement('canvas');
    this.x = this.c.getContext('2d');
    this.w = 0; this.h = 0; this.s = 1;
  }
  fit(w, h, scale) {
    const cw = Math.max(1, Math.ceil(w * scale));
    const ch = Math.max(1, Math.ceil(h * scale));
    if (this.c.width !== cw || this.c.height !== ch) {
      this.c.width = cw; this.c.height = ch;
    }
    this.w = w; this.h = h; this.s = scale;
    this.x.setTransform(scale, 0, 0, scale, 0, 0);
    this.x.clearRect(0, 0, w, h);
    return this.x;
  }
}

const maskBuf = new Buf();
const gooBuf = new Buf();

/**
 * 豆の集合を「粘りでつながった 1 つの塊」として描く。
 * beans: [{x, y}]（描画座標）。r は豆の短半径。
 * sticky 0..1 でつながりの太さと濡れ具合が増す。
 * 呼び出し側の変換はそのまま使うので、bounds は描画座標で渡すこと。
 */
export function drawStickyMass(ctx, beans, r, sticky, opt = {}) {
  if (!beans.length || sticky <= 0.02) return;
  const pad = r * 2.2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of beans) {
    if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x;
    if (b.y < y0) y0 = b.y; if (b.y > y1) y1 = b.y;
  }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;

  const scale = opt.scale ?? 0.5;          // 半解像度
  const mx = maskBuf.fit(w, h, scale);
  const gx = gooBuf.fit(w, h, scale);

  // --- 1. 塊のシルエット：豆の円 ∪ 近い豆どうしを結ぶ帯 ---
  const grow = r * (0.46 + sticky * 0.16);
  mx.fillStyle = '#fff';
  mx.beginPath();
  for (const b of beans) {
    mx.moveTo(b.x - x0 + grow, b.y - y0);
    mx.arc(b.x - x0, b.y - y0, grow, 0, TAU);
  }
  mx.fill();

  const linkMax = r * (2.1 + sticky * 1.5);
  const linkW = r * (0.30 + sticky * 0.62);
  mx.beginPath();
  for (let i = 0; i < beans.length; i++) {
    for (let j = i + 1; j < beans.length; j++) {
      const a = beans[i], b = beans[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > linkMax || d < 1e-3) continue;
      const k = clamp(1 - (d - r * 1.6) / (linkMax - r * 1.6), 0.15, 1);
      const hw = (linkW * k) / 2;
      const nx = (-dy / d) * hw, ny = (dx / d) * hw;
      mx.moveTo(a.x - x0 + nx, a.y - y0 + ny);
      mx.lineTo(b.x - x0 + nx, b.y - y0 + ny);
      mx.lineTo(b.x - x0 - nx, b.y - y0 - ny);
      mx.lineTo(a.x - x0 - nx, a.y - y0 - ny);
      mx.closePath();
    }
  }
  mx.fill();

  // --- 2. 塊の材質：上が明るく下が沈む、濁った半透明の粘り ---
  const g = gx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, opt.top ?? 'rgba(190,160,112,0.95)');
  g.addColorStop(0.55, opt.mid ?? 'rgba(150,118,74,0.95)');
  g.addColorStop(1, opt.bottom ?? 'rgba(104,78,46,0.95)');
  gx.fillStyle = g;
  gx.fillRect(0, 0, w, h);
  gx.globalCompositeOperation = 'destination-in';
  gx.setTransform(1, 0, 0, 1, 0, 0);
  gx.drawImage(maskBuf.c, 0, 0);
  gx.setTransform(scale, 0, 0, scale, 0, 0);
  gx.globalCompositeOperation = 'source-over';

  // --- 3. 本体へ。輪郭を少しぼかすと、ぬめった塊に見える ---
  ctx.save();
  const blur = (r * 0.16 * scale).toFixed(1);
  if (opt.blur !== false && typeof ctx.filter === 'string') ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = clamp(0.14 + sticky * 0.34, 0, 1);
  ctx.drawImage(gooBuf.c, 0, 0, gooBuf.c.width, gooBuf.c.height, x0, y0, w, h);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** 豆が地に落とす接触影。豆より先に描く。 */
export function drawContactShadows(ctx, beans, r, alpha = 0.3) {
  ctx.save();
  ctx.fillStyle = `rgba(58,38,16,${alpha})`;
  if (typeof ctx.filter === 'string') ctx.filter = `blur(${(r * 0.22).toFixed(1)}px)`;
  ctx.beginPath();
  for (const b of beans) {
    ctx.moveTo(b.x + r * 1.0, b.y + r * 0.30);
    ctx.ellipse(b.x + r * 0.10, b.y + r * 0.30, r * 1.0, r * 0.74, 0, 0, TAU);
  }
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();
}

/**
 * 濡れたつやを足す。輪郭をなぞると豆に「笑った口」が描かれたように見えるので、
 * 光っているのはあくまで面の一点、という描き方にする。
 */
export function drawWetRim(ctx, beans, r, sticky) {
  if (sticky <= 0.08) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp((sticky - 0.08) * 0.16, 0, 1);
  ctx.fillStyle = 'rgba(255,248,228,1)';
  for (const b of beans) {
    ctx.beginPath();
    ctx.ellipse(b.x - r * 0.30, b.y - r * 0.36, r * 0.18, r * 0.10, -0.55, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* 糸                                                                  */
/* ------------------------------------------------------------------ */

/**
 * 1 本の糸。ベタ塗りの白いリボンをやめ、
 * 「広くて薄い胴 → 中くらい → 鋭いコア」の 3 枚重ねで半透明にする。
 * 実物の納豆の糸は白ではなく、わずかに黄みがかった透明。
 */
export function drawThread(ctx, ax, ay, bx, by, opt = {}) {
  const {
    width = 3, sag = 0, wobble = 0, phase = 0, segs = 16,
    alpha = 1, tension = 0, curl = 0, beads = 0, shadow = true,
  } = opt;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;

  // 中心線を先に求めておく（3 回使う）
  const P = new Float64Array((segs + 1) * 2);
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const s = Math.sin(Math.PI * u);
    const w = Math.sin(u * Math.PI * (1.6 + curl) + phase) * wobble * s;
    P[i * 2] = ax + dx * u + nx * w;
    P[i * 2 + 1] = ay + dy * u + sag * s + ny * w;
  }

  const ribbon = (scale, color, a) => {
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const s = Math.sin(Math.PI * u);
      const taper = (1 - 0.55 * s) * lerp(1, 0.5, clamp(tension, 0, 1));
      const hw = Math.max(0.18, width * 0.5 * taper * scale);
      ctx.lineTo(P[i * 2] + nx * hw, P[i * 2 + 1] + ny * hw);
    }
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const s = Math.sin(Math.PI * u);
      const taper = (1 - 0.55 * s) * lerp(1, 0.5, clamp(tension, 0, 1));
      const hw = Math.max(0.18, width * 0.5 * taper * scale);
      ctx.lineTo(P[i * 2] - nx * hw, P[i * 2 + 1] - ny * hw);
    }
    ctx.closePath();
    ctx.globalAlpha = clamp(a * alpha, 0, 1);
    ctx.fillStyle = color;
    ctx.fill();
  };

  ctx.save();
  // 背景から浮かせるための、ごく薄い影（下地が明るいので必要）
  if (shadow) {
    ctx.save();
    ctx.translate(width * 0.22, width * 0.28);
    ribbon(1.0, 'rgba(96,72,40,0.85)', 0.10);
    ctx.restore();
  }
  ribbon(1.0, 'rgba(244,236,214,0.95)', 0.17);   // 胴（ほぼ透ける）
  ribbon(0.50, 'rgba(252,247,232,0.95)', 0.28);  // 中
  ribbon(0.18, 'rgba(255,255,250,1)', 0.78);     // コアの光

  // 液の玉
  if (beads > 0) {
    ctx.globalAlpha = clamp(alpha * 0.75, 0, 1);
    ctx.fillStyle = 'rgba(255,253,245,0.95)';
    for (let k = 0; k < beads; k++) {
      const u = (k + 1) / (beads + 1) + Math.sin(phase + k) * 0.06;
      const i = Math.round(clamp(u, 0, 1) * segs);
      const s = Math.sin(Math.PI * u);
      const rr = width * (0.62 + 0.3 * Math.sin(phase * 2 + k)) * (1 - tension * 0.45);
      ctx.beginPath();
      ctx.ellipse(P[i * 2], P[i * 2 + 1], rr * 0.55, rr * 0.85 * (0.6 + s * 0.5), 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

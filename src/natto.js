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
  if (!drawBeanSprite(ctx, from, variant, x, y, r, rot, 1)) {
    drawBeanFallback(ctx, from, x, y, r, rot);
    return;
  }
  if (t > 0.01) drawBeanSprite(ctx, to, variant, x, y, r, rot, clamp(t, 0, 1));
}

/** スプライトがまだ届いていないあいだのつなぎ（起動直後の数百 ms） */
let fallbackFn = null;
export function setBeanFallback(fn) { fallbackFn = fn; }
function drawBeanFallback(ctx, state, x, y, r, rot) {
  if (fallbackFn) fallbackFn(ctx, state, x, y, r, rot);
}

/** スプライトがあればそれを、なければベクターで描く */
export function drawBeanAuto(ctx, state, variant, x, y, r, rot = 0) {
  if (!drawBeanSprite(ctx, state, variant, x, y, r, rot, 1)) {
    drawBeanFallback(ctx, state, x, y, r, rot);
  }
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
// 直前に作った塊のシルエット。照りと泡を同じ形で切り抜くために覚えておく。
const lastMask = { valid: false, x0: 0, y0: 0, w: 0, h: 0, scale: 1 };

/**
 * 豆の集合を「粘りでつながった 1 つの塊」として描く。
 * beans: [{x, y}]（描画座標）。r は豆の短半径。
 * sticky 0..1 でつながりの太さと濡れ具合が増す。
 * 呼び出し側の変換はそのまま使うので、bounds は描画座標で渡すこと。
 */
export function drawStickyMass(ctx, beans, r, sticky, opt = {}) {
  lastMask.valid = false;
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

  lastMask.valid = true;
  lastMask.x0 = x0; lastMask.y0 = y0; lastMask.w = w; lastMask.h = h; lastMask.scale = scale;

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
/* 糸（最重要マテリアル）                                               */
/* ------------------------------------------------------------------ */

/**
 * 糸 1 本。
 *
 * 実物の納豆の糸は「白い線」ではなく、
 *   ・根もとが粘りの土台に太く食い込み、中ほどが髪より細い
 *   ・ほぼ透明で、円柱の稜に沿って細い光だけが強く走る
 *   ・下側にわずかな影があり、そこで初めて丸みが出る
 *   ・たるむと途中に液の玉が下がる
 * という物体。それを 4〜5 枚のリボンの重ねで作る。
 */
export function drawThread(ctx, ax, ay, bx, by, opt = {}) {
  const {
    width = 3, sag = 0, wobble = 0, phase = 0, segs = 18,
    alpha = 1, tension = 0, curl = 0, beads = 0,
    halo = true, shadow = true,
  } = opt;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;

  const P = new Float64Array((segs + 1) * 2);
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const s = Math.sin(Math.PI * u);
    const w = Math.sin(u * Math.PI * (1.4 + curl) + phase) * wobble * s;
    P[i * 2] = ax + dx * u + nx * w;
    P[i * 2 + 1] = ay + dy * u + sag * s + ny * w;
  }

  // 幅の分布：両端で太く（粘りの土台に生えている）、中ほどが最も細い。
  // 張るほど全体に細くなる。
  const thin = lerp(1, 0.42, clamp(tension, 0, 1));
  const profile = (u) => (0.30 + 0.70 * Math.pow(Math.abs(Math.cos(Math.PI * u)), 0.65)) * thin;

  const ribbon = (scale, color, a, ox = 0, oy = 0) => {
    if (a <= 0.004) return;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const hw = Math.max(0.14, width * 0.5 * profile(i / segs) * scale);
      ctx.lineTo(P[i * 2] + nx * hw + ox, P[i * 2 + 1] + ny * hw + oy);
    }
    for (let i = segs; i >= 0; i--) {
      const hw = Math.max(0.14, width * 0.5 * profile(i / segs) * scale);
      ctx.lineTo(P[i * 2] - nx * hw + ox, P[i * 2 + 1] - ny * hw + oy);
    }
    ctx.closePath();
    ctx.globalAlpha = clamp(a * alpha, 0, 1);
    ctx.fillStyle = color;
    ctx.fill();
  };

  ctx.save();
  const d = width * 0.30;
  if (halo) ribbon(2.4, 'rgba(250,244,226,1)', 0.045);        // まわりに滲む粘り
  if (shadow) ribbon(1.0, 'rgba(92,68,38,1)', 0.13, d, d);    // 下側の影＝丸み
  ribbon(1.0, 'rgba(246,239,219,1)', 0.20);                   // 胴（ほぼ透ける）
  ribbon(0.46, 'rgba(253,249,236,1)', 0.34);                  // 中
  ribbon(0.15, 'rgba(255,255,252,1)', 0.88, -d * 0.5, -d * 0.5); // 稜の光

  // 液の玉：たるんだ糸の下がったところに下がる
  if (beads > 0 && tension < 0.75) {
    for (let k = 0; k < beads; k++) {
      const u = clamp((k + 1) / (beads + 1) + Math.sin(phase + k * 2.1) * 0.12, 0.12, 0.88);
      const i = Math.round(u * segs);
      const bx2 = P[i * 2], by2 = P[i * 2 + 1];
      const rr = width * (0.48 + 0.30 * Math.sin(phase * 3 + k)) * (1 - tension);
      ctx.globalAlpha = clamp(alpha * 0.32, 0, 1);
      ctx.fillStyle = 'rgba(250,244,226,1)';
      ctx.beginPath();
      ctx.ellipse(bx2, by2 + rr * 0.25, rr * 0.62, rr * 0.95, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = clamp(alpha * 0.6, 0, 1);
      ctx.fillStyle = 'rgba(255,255,252,1)';
      ctx.beginPath();
      ctx.ellipse(bx2 - rr * 0.2, by2, rr * 0.2, rr * 0.28, -0.4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * 糸の膜。2 粒のあいだに張る薄い膜で、線を何本引いても出ない
 * 「ねばついた面」を作る。糸より先に描く。
 */
export function drawVeil(ctx, ax, ay, bx, by, opt = {}) {
  const { width = 10, sag = 0, phase = 0, alpha = 0.09, segs = 14 } = opt;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, s = Math.sin(Math.PI * u);
    const hw = width * 0.5 * (0.25 + 0.75 * Math.pow(Math.abs(Math.cos(Math.PI * u)), 0.5));
    ctx.lineTo(ax + dx * u + nx * hw, ay + dy * u + sag * s * 0.55 + ny * hw);
  }
  for (let i = segs; i >= 0; i--) {
    const u = i / segs, s = Math.sin(Math.PI * u);
    const hw = width * 0.5 * (0.25 + 0.75 * Math.pow(Math.abs(Math.cos(Math.PI * u)), 0.5));
    ctx.lineTo(ax + dx * u - nx * hw, ay + dy * u + sag * s * 1.25 - ny * hw);
  }
  ctx.closePath();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = 'rgba(252,247,232,1)';
  ctx.fill();
  ctx.globalAlpha = clamp(alpha * 2.2, 0, 1);
  ctx.strokeStyle = 'rgba(255,255,250,1)';
  ctx.lineWidth = Math.max(0.4, width * 0.05);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 塊の上に乗る「濡れ」                                                 */
/* ------------------------------------------------------------------ */

const glazeBuf = new Buf();

/**
 * 粘りの照り。豆を描いたあとに重ねる。
 * 直前の drawStickyMass が作ったシルエットを使い回す。
 */
export function drawStickyGlaze(ctx, sticky, opt = {}) {
  if (!lastMask.valid || sticky <= 0.12) return;
  const { x0, y0, w, h, scale } = lastMask;
  const gx = glazeBuf.fit(w, h, scale);

  // 上から差す光の帯
  const g = gx.createLinearGradient(0, 0, w * 0.35, h);
  g.addColorStop(0, 'rgba(255,252,240,0.85)');
  g.addColorStop(0.35, 'rgba(255,250,232,0.30)');
  g.addColorStop(0.75, 'rgba(255,246,220,0.02)');
  g.addColorStop(1, 'rgba(255,246,220,0)');
  gx.fillStyle = g;
  gx.fillRect(0, 0, w, h);

  // 泡：かき混ぜた納豆の表面に必ず立つ
  const n = Math.round(sticky * (opt.foam ?? 26));
  let s = 1234;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  gx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < n; i++) {
    const bx = rnd() * w, by = rnd() * h;
    const rr = (opt.foamR ?? 4) * (0.5 + rnd());
    gx.globalAlpha = 0.5 + rnd() * 0.4;
    gx.strokeStyle = 'rgba(255,255,250,0.9)';
    gx.lineWidth = Math.max(0.5, rr * 0.32);
    gx.beginPath();
    gx.arc(bx, by, rr, 0, TAU);
    gx.stroke();
    gx.globalAlpha = 0.5;
    gx.fillStyle = 'rgba(255,255,252,0.8)';
    gx.beginPath();
    gx.arc(bx - rr * 0.3, by - rr * 0.35, rr * 0.26, 0, TAU);
    gx.fill();
  }
  gx.globalAlpha = 1;

  // シルエットで切り抜く
  gx.globalCompositeOperation = 'destination-in';
  gx.setTransform(1, 0, 0, 1, 0, 0);
  gx.drawImage(maskBuf.c, 0, 0);
  gx.setTransform(scale, 0, 0, scale, 0, 0);
  gx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = clamp((sticky - 0.12) * 0.30, 0, 1);
  ctx.drawImage(glazeBuf.c, 0, 0, glazeBuf.c.width, glazeBuf.c.height, x0, y0, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

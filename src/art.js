// 描画パーツ：豆・糸・パック・道具・背景
// このゲームの最重要マテリアルは「糸」と「豆表面の粘り」なので、
// その 2 つに描画予算を集中している。
import { TAU, clamp, lerp, roundRect, mixHex } from './util.js';

/* ------------------------------------------------------------------ */
/* 豆                                                                  */
/* ------------------------------------------------------------------ */

// 各工程での豆の見た目。序盤は「納豆」と分からない乾いた豆から始める。
export const BEAN_LOOK = {
  dry:       { a: '#d8bb85', b: '#a9884f', gloss: 0.12, wrinkle: 1.0, film: 0 },
  soaked:    { a: '#f0e0ae', b: '#c6a768', gloss: 0.55, wrinkle: 0.15, film: 0 },
  steamed:   { a: '#f8ecc4', b: '#cfae72', gloss: 0.85, wrinkle: 0.05, film: 0 },
  fermented: { a: '#d3a969', b: '#8f6733', gloss: 0.28, wrinkle: 0.35, film: 0.12 },
  mixed:     { a: '#cfa059', b: '#845c2a', gloss: 0.55, wrinkle: 0.22, film: 1.0 },
};

export function blendLook(x, y, t) {
  return {
    a: mixHex(x.a, y.a, t),
    b: mixHex(x.b, y.b, t),
    gloss: lerp(x.gloss, y.gloss, t),
    wrinkle: lerp(x.wrinkle, y.wrinkle, t),
    film: lerp(x.film, y.film, t),
  };
}

/**
 * 豆 1 粒。r は短半径。
 * look は BEAN_LOOK 由来のオブジェクト（文字列キーでも可）。
 */
export function drawBean(ctx, x, y, r, rot = 0, look = BEAN_LOOK.dry, opt = {}) {
  const L = typeof look === 'string' ? BEAN_LOOK[look] : look;
  const rx = r * (opt.rx ?? 1.18) * (opt.squash ?? 1);
  const ry = r / (opt.squash ?? 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);

  // 影
  if (opt.shadow !== false) {
    ctx.fillStyle = 'rgba(90,60,25,0.16)';
    ctx.beginPath();
    ctx.ellipse(r * 0.14, r * 0.2, rx * 0.98, ry * 0.95, 0, 0, TAU);
    ctx.fill();
  }

  // 本体
  ctx.fillStyle = L.b;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = L.a;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.06, -ry * 0.08, rx * 0.93, ry * 0.9, 0, 0, TAU);
  ctx.fill();

  // へそ（豆らしさ）
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = L.b;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.62, ry * 0.08, rx * 0.13, ry * 0.09, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // しわ（乾いた豆ほど強い）
  if (L.wrinkle > 0.02) {
    ctx.globalAlpha = L.wrinkle * 0.4;
    ctx.strokeStyle = L.b;
    ctx.lineWidth = Math.max(0.6, r * 0.09);
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-rx * 0.45, ry * (0.15 + i * 0.42));
      ctx.quadraticCurveTo(0, ry * (0.3 + i * 0.45), rx * 0.5, ry * (0.05 + i * 0.4));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // つや（丸みの主張）
  if (L.gloss > 0.02) {
    ctx.globalAlpha = clamp(L.gloss, 0, 1) * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.3, -ry * 0.42, rx * 0.34, ry * 0.22, -0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = clamp(L.gloss, 0, 1) * 0.35;
    ctx.beginPath();
    ctx.ellipse(rx * 0.35, ry * 0.3, rx * 0.2, ry * 0.12, -0.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 粘りの膜：豆の色は残したまま、白いぬめりが乗るように薄く重ねる
  if (L.film > 0.02) {
    const f = clamp(L.film, 0, 1);
    ctx.globalAlpha = f * 0.22;
    ctx.fillStyle = '#fff8e8';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.02, ry * 1.02, 0, 0, TAU);
    ctx.fill();
    // ぬるっとした縁のハイライト
    ctx.globalAlpha = f * 0.62;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(0.8, r * 0.11);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.96, ry * 0.96, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = f * 0.85;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.28, -ry * 0.42, rx * 0.36, ry * 0.2, -0.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 糸（主役）                                                          */
/* ------------------------------------------------------------------ */

/**
 * 1 本の糸。両端 (ax,ay)-(bx,by) を結び、たるみ・ゆらぎ・
 * 先細りを持つリボンとして描く。
 */
export function drawStrand(ctx, ax, ay, bx, by, opt = {}) {
  const {
    width = 3, sag = 0, wobble = 0, phase = 0,
    alpha = 0.92, segs = 16, tension = 0, curl = 0,
  } = opt;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;

  const left = [], right = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const s = Math.sin(Math.PI * u);           // 端 0 / 中央 1
    let x = ax + dx * u;
    let y = ay + dy * u + sag * s;
    // ゆらぎ（法線方向）
    const w = Math.sin(u * Math.PI * (1.6 + curl) + phase) * wobble * s;
    x += nx * w; y += ny * w;
    // 先細り：豆側が太く、中央がいちばん細い（張るほど細くなる）
    const taper = (1 - 0.62 * s) * lerp(1, 0.55, clamp(tension, 0, 1));
    const hw = Math.max(0.35, width * 0.5 * taper);
    left.push(x + nx * hw, y + ny * hw);
    right.push(x - nx * hw, y - ny * hw);
  }

  ctx.beginPath();
  ctx.moveTo(left[0], left[1]);
  for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
  for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
  ctx.closePath();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = '#fffdf5';
  ctx.fill();

  // 芯のハイライト（糸のつやが「粘り」を伝える）
  ctx.globalAlpha = clamp(alpha, 0, 1) * 0.55;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(0.35, width * 0.22);
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const s = Math.sin(Math.PI * u);
    const w = Math.sin(u * Math.PI * (1.6 + curl) + phase) * wobble * s;
    const x = ax + dx * u + nx * w;
    const y = ay + dy * u + sag * s + ny * w;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------------ */
/* 器・道具                                                            */
/* ------------------------------------------------------------------ */

/** 発泡スチロールっぽい四角いパック */
export function drawPack(ctx, x, y, w, h, opt = {}) {
  const r = Math.min(w, h) * 0.12;
  const depth = opt.depth ?? h * 0.22;
  ctx.save();
  ctx.translate(x, y);

  // 落ち影
  ctx.fillStyle = 'rgba(120,88,40,0.18)';
  roundRect(ctx, -w / 2 + h * 0.04, -h / 2 + depth * 0.55, w, h, r);
  ctx.fill();

  // 側面
  ctx.fillStyle = opt.side ?? '#e2e6ea';
  roundRect(ctx, -w / 2, -h / 2 + depth * 0.3, w, h, r);
  ctx.fill();

  // 天面（内側）
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, opt.top ?? '#fbfdff');
  g.addColorStop(1, opt.bottom ?? '#e7ecf1');
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fill();

  // 内側の凹み
  const iw = w * 0.86, ih = h * 0.82;
  ctx.fillStyle = opt.inner ?? '#dfe6ec';
  roundRect(ctx, -iw / 2, -ih / 2 + h * 0.02, iw, ih, r * 0.8);
  ctx.fill();
  ctx.fillStyle = opt.innerLight ?? '#eef3f7';
  roundRect(ctx, -iw / 2, -ih / 2 + h * 0.02, iw, ih * 0.5, r * 0.8);
  ctx.fill();

  ctx.restore();
  return { iw, ih, iy: h * 0.02 };
}

/** 木の台（x0..x1 の帯として描く） */
export function drawTableRect(ctx, x0, x1, y, yBottom, color = '#d9a86a') {
  const w = x1 - x0, h = yBottom - y;
  if (h <= 0 || w <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x0, y, w, Math.max(2, h * 0.05));
  ctx.globalAlpha = 0.13;
  ctx.strokeStyle = '#7a4c1d';
  ctx.lineWidth = Math.max(1, w * 0.004);
  for (let i = 0; i < 5; i++) {
    const yy = y + h * (0.2 + i * 0.18);
    ctx.beginPath();
    ctx.moveTo(x0, yy);
    ctx.bezierCurveTo(x0 + w * 0.3, yy - 4, x0 + w * 0.7, yy + 4, x1, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawTable(ctx, W, H, y, color = '#d9a86a') {
  drawTableRect(ctx, 0, W, y, H, color);
}

/** ふんわりした背景（工場の壁） */
export function drawRoom(ctx, W, H, opt = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, opt.top ?? '#ffeecb');
  g.addColorStop(1, opt.bottom ?? '#f6d7a4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** やわらかい光の輪（注目させたい所に敷く） */
export function glowSpot(ctx, x, y, r, color = 'rgba(255,255,255,0.55)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** 混ぜ棒（丸い持ち手のスティック） */
export function drawStick(ctx, x, y, len, angle, w, opt = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // 影
  ctx.fillStyle = 'rgba(110,80,40,0.18)';
  roundRect(ctx, -w * 0.5 + w * 0.3, -len + w * 0.4, w, len, w * 0.5);
  ctx.fill();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, opt.dark ?? '#c98f4d');
  g.addColorStop(0.4, opt.light ?? '#f3c98c');
  g.addColorStop(1, opt.dark ?? '#c98f4d');
  ctx.fillStyle = g;
  roundRect(ctx, -w / 2, -len, w, len, w * 0.5);
  ctx.fill();
  // 持ち手
  ctx.fillStyle = opt.grip ?? '#ff9f7a';
  ctx.beginPath();
  ctx.arc(0, -len + w * 0.9, w * 0.95, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(-w * 0.3, -len + w * 0.6, w * 0.32, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** ゆびアイコン（無文字のヒント） */
export function drawHandHint(ctx, x, y, s, alpha = 1, rot = 0) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(60,40,20,0.22)';
  ctx.beginPath(); ctx.ellipse(s * 0.1, s * 0.12, s * 0.5, s * 0.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff6e8';
  ctx.strokeStyle = '#a2724a';
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, -s * 0.62);
  ctx.quadraticCurveTo(s * 0.24, -s * 0.62, s * 0.24, -s * 0.16);
  ctx.quadraticCurveTo(s * 0.62, -s * 0.1, s * 0.6, s * 0.3);
  ctx.quadraticCurveTo(s * 0.56, s * 0.78, s * 0.06, s * 0.8);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.8, -s * 0.52, s * 0.18);
  ctx.quadraticCurveTo(-s * 0.52, -s * 0.06, -s * 0.3, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.62, -s * 0.06, -s * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** タップの波紋 */
export function drawRipple(ctx, x, y, r, alpha, color = 'rgba(255,255,255,0.9)') {
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** まるいボタン（アイコンは callback で描く） */
export function drawRoundButton(ctx, x, y, r, drawIcon, opt = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(120,80,30,0.22)';
  ctx.beginPath(); ctx.arc(0, r * 0.12, r, 0, TAU); ctx.fill();
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, opt.top ?? '#ffd98a');
  g.addColorStop(1, opt.bottom ?? '#ffab4d');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, TAU); ctx.stroke();
  if (drawIcon) drawIcon(ctx, r);
  ctx.restore();
}

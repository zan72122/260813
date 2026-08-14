// 小さな数学 / 乱数 / スプライトのユーティリティ

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1), 0, 1);
export const mix = lerp;

export const easeInOut = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = TAU / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
// 0->1->0 の山
export const bump = (t) => Math.sin(clamp(t, 0, 1) * Math.PI);

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/* ------------------------------------------------------------------ */
/* 決定的な擬似乱数（E2E をぶれさせないため、常にシード付きで回す）      */
/* ------------------------------------------------------------------ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rand = mulberry32(20260814);

export function seedRandom(seed) {
  _rand = mulberry32(seed >>> 0);
}
export const rand = () => _rand();
export const rrange = (a, b) => a + (b - a) * _rand();
export const rsign = () => (_rand() < 0.5 ? -1 : 1);
export const rpick = (arr) => arr[(_rand() * arr.length) | 0];

/* ------------------------------------------------------------------ */
/* オフスクリーンスプライト（毎フレームのグラデーション生成を避ける）    */
/* ------------------------------------------------------------------ */
export function makeSprite(size, drawFn) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.max(2, Math.ceil(size));
  const x = c.getContext('2d');
  drawFn(x, c.width);
  return c;
}

let _softDisc = null;
export function softDisc() {
  if (!_softDisc) {
    _softDisc = makeSprite(128, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.72)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    });
  }
  return _softDisc;
}

let _star = null;
export function starSprite() {
  if (!_star) {
    _star = makeSprite(96, (x, s) => {
      const c = s / 2;
      const g = x.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,245,200,0.9)');
      g.addColorStop(1, 'rgba(255,230,150,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(c, c, c, 0, TAU); x.fill();
      // 4 方向のきらめき
      x.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < 4; i++) {
        x.save();
        x.translate(c, c);
        x.rotate((i * Math.PI) / 2);
        x.beginPath();
        x.moveTo(0, -c * 0.95);
        x.quadraticCurveTo(c * 0.10, -c * 0.12, 0, 0);
        x.quadraticCurveTo(-c * 0.10, -c * 0.12, 0, -c * 0.95);
        x.fill();
        x.restore();
      }
    });
  }
  return _star;
}

/* 角丸矩形（Safari の roundRect 未対応環境でも動くよう自前で） */
export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
}

/** 色を混ぜる（#rrggbb 前提） */
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
  const bl = Math.round(lerp(pa & 255, pb & 255, t));
  return `rgb(${r},${g},${bl})`;
}

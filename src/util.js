// 小さな数学/乱数ユーティリティ。外部依存なし。
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => clamp((v - a) / (b - a || 1e-6), 0, 1);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const smoothstep = (a, b, v) => smooth(inv(a, b, v));
export const TAU = Math.PI * 2;

// 決定的乱数（テストの再現性のため固定シードで使う）
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D値ノイズ + fbm。海苔の繊維ムラや液面の揺らぎに使う。
export function makeNoise(seed = 7) {
  const r = rng(seed);
  const N = 256;
  const g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = r();
  const at = (x, y) => g[(y & (N - 1)) * N + (x & (N - 1))];
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, oct = 3) {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += noise(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  }
  return { noise, fbm };
}

// 指数減衰で目標値へ追従（フレームレート非依存）
export function approach(cur, target, rate, dt) {
  return target + (cur - target) * Math.exp(-rate * dt);
}

export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// 角丸パス（Path2D の roundRect が無い環境向けフォールバック込み）
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

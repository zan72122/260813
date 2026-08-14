// 小さな数学ユーティリティ。依存なし。
export const TAU = Math.PI * 2;

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => (clamp(t) < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// フレームレート非依存の指数補間。
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

// 決定的な擬似乱数（E2E で見た目を安定させるため固定シード）。
export function makeRandom(seed = 1337) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rnd = makeRandom(20260813);

// 角度差を -PI..PI に丸める。
export function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

// #rrggbb 同士の線形補間。
export function mixHex(c1, c2, t) {
  const p = (c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ];
  const a = p(c1);
  const b = p(c2);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r},${g},${bl})`;
}

// 2 色を混ぜて透明度つきで返す。
export function mixHexA(c1, c2, t, alpha) {
  return mixHex(c1, c2, t).replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
}

export function rgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// バネ（過減衰しないよう半陰的オイラー）。ぷるん揺れの土台。
export class Spring {
  constructor(value = 0, stiffness = 120, damping = 12) {
    this.v = value;
    this.vel = 0;
    this.target = value;
    this.k = stiffness;
    this.d = damping;
  }
  step(dt) {
    // 大きな dt でも発散しないよう分割。
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      const a = (this.target - this.v) * this.k - this.vel * this.d;
      this.vel += a * h;
      this.v += this.vel * h;
      left -= h;
    }
    return this.v;
  }
  kick(amount) {
    this.vel += amount;
  }
  reset(value = 0) {
    this.v = value;
    this.vel = 0;
    this.target = value;
  }
}

// 焼き込み用のノイズ一式（実行時には読み込まれない）
// 単色べた塗りをやめて「色ムラ・シワ・毛穴」を作るための土台。

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** Perlin / fBm / Worley をまとめて返す */
export function makeNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  function grad(hash, x, y) {
    const g = GRAD[hash & 7];
    return g[0] * x + g[1] * y;
  }

  /** -1..1 */
  function perlin(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const X = xi & 255, Y = yi & 255;
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  function fbm(x, y, oct = 4, lac = 2.0, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += a * perlin(x * f, y * f);
      norm += a;
      a *= gain; f *= lac;
    }
    return sum / (norm || 1);
  }

  /** 稜線ノイズ：シワの筋を作るのに使う（0..1） */
  function ridged(x, y, oct = 4, lac = 2.1, gain = 0.5) {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(perlin(x * f, y * f));
      sum += a * n * n;
      norm += a;
      a *= gain; f *= lac;
    }
    return sum / (norm || 1);
  }

  const hash2 = (i, j) => {
    let h = perm[(perm[i & 255] + (j & 255)) & 511];
    return h / 255;
  };

  /** セル状の斑（豆の色ムラ）。F1 距離を 0..1 で返す */
  function worley(x, y, jitter = 1) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let best = 1e9;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const cx = xi + di, cy = yi + dj;
        const rx = hash2(cx, cy);
        const ry = hash2(cy + 71, cx + 37);
        const px = cx + 0.5 + (rx - 0.5) * jitter;
        const py = cy + 0.5 + (ry - 0.5) * jitter;
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < best) best = d;
      }
    }
    return Math.min(1, Math.sqrt(best));
  }

  return { perlin, fbm, ridged, worley, rnd };
}

/* ---------------- 色ユーティリティ（線形空間で計算する） ---------------- */

export const srgbToLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToLin(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [
    srgbToLin(((n >> 16) & 255) / 255),
    srgbToLin(((n >> 8) & 255) / 255),
    srgbToLin((n & 255) / 255),
  ];
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function normalize3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

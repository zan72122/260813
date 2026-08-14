// 米粒。納豆の隣に置かれるので、ここがベタ塗りだと納豆まで嘘に見える。
// 半透明で内側が乳白、表面が濡れて光る、という材質を作る。
import { makeNoise, hexToLin, linToSrgb, clamp01, mix3, normalize3 } from './noise.js';

const KEY = normalize3(-0.44, -0.66, 0.36);
const FILL = normalize3(0.72, 0.06, 0.42);
const KEY_COL = [1.38, 1.32, 1.20];
const FILL_COL = [0.26, 0.30, 0.38];

export function bakeRice(ctx2d, { size = 128, seed = 1, ss = 2, orient = 0 } = {}) {
  const N = size * ss;
  const nz = makeNoise(seed * 6151 + 7);
  const rnd = nz.rnd;

  const aspect = 0.36 + rnd() * 0.10;        // 細長い
  const bend = (rnd() - 0.5) * 0.30;         // わずかに反る
  const thickness = 0.52 + rnd() * 0.10;

  const bodyC = hexToLin('#fbf7ee');
  const coreC = hexToLin('#eee7d6');
  const deepC = hexToLin('#cfc4ac');

  const H = new Float32Array(N * N);
  const COV = new Float32Array(N * N);
  const co = Math.cos(orient), so = Math.sin(orient);

  for (let y = 0; y < N; y++) {
    const vs = ((y + 0.5) / N) * 2 - 1;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const us = ((x + 0.5) / N) * 2 - 1;
      let u = us * co + vs * so;
      let v = -us * so + vs * co;
      v -= bend * (1 - u * u);               // 反り

      const wob = 1 + 0.03 * nz.fbm(u * 2.2 + 4, v * 2.2, 2);
      const rr = Math.hypot(u / 0.94, v / (0.94 * aspect)) / wob;
      const cov = clamp01((1 - rr) * N * 0.30);
      COV[i] = cov;
      if (cov <= 0) continue;

      const t = Math.min(1, rr);
      let h = Math.pow(Math.max(0, 1 - t * t), 0.52) * thickness;
      // 背の浅い溝（米のすじ）
      h -= Math.exp(-((v / (aspect * 0.22)) ** 2)) * 0.020 * (1 - Math.abs(u));
      h += nz.fbm(u * 14, v * 30, 2) * 0.004;
      H[i] = h;
    }
  }

  const out = ctx2d.createImageData(size, size);
  const acc = new Float32Array(size * size * 4);
  const px = 2.0 / N;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const cov = COV[i];
      if (cov <= 0) continue;
      const xm = x > 0 ? i - 1 : i, xp = x < N - 1 ? i + 1 : i;
      const ym = y > 0 ? i - N : i, yp = y < N - 1 ? i + N : i;
      const [nx, ny, nzz] = normalize3(
        -(H[xp] - H[xm]) / (2 * px), -(H[yp] - H[ym]) / (2 * px), 1);

      const h = H[i];
      const thin = clamp01(1 - h / (thickness || 1));

      // 半透明：厚いところほど乳白が濃く、薄い縁は透ける
      let alb = mix3(bodyC, coreC, clamp01(h / thickness) * 0.7);
      alb = mix3(alb, deepC, Math.pow(thin, 2.5) * 0.55);

      const d1 = clamp01((nx * KEY[0] + ny * KEY[1] + nzz * KEY[2] + 0.35) / 1.35);
      const d2 = clamp01((nx * FILL[0] + ny * FILL[1] + nzz * FILL[2] + 0.6) / 1.6);
      let r = alb[0] * (KEY_COL[0] * d1 + FILL_COL[0] * d2);
      let g = alb[1] * (KEY_COL[1] * d1 + FILL_COL[1] * d2);
      let b = alb[2] * (KEY_COL[2] * d1 + FILL_COL[2] * d2);

      const fres = 0.03 + 0.97 * Math.pow(1 - clamp01(nzz), 5);
      const spec = (L, shin) => {
        const hz = L[2] + 1;
        const hl = Math.hypot(L[0], L[1], hz) || 1;
        return Math.pow(clamp01((nx * L[0] + ny * L[1] + nzz * hz) / hl), shin);
      };
      const s = spec(KEY, 200) * (0.55 + fres * 0.8) + spec(FILL, 70) * 0.16;
      r += s * KEY_COL[0]; g += s * KEY_COL[1]; b += s * KEY_COL[2];

      const ox = (x / ss) | 0, oy = (y / ss) | 0;
      const oi = (oy * size + ox) * 4;
      acc[oi] += r * cov; acc[oi + 1] += g * cov; acc[oi + 2] += b * cov; acc[oi + 3] += cov;
    }
  }

  const n2 = ss * ss;
  for (let i = 0, p = 0; i < size * size; i++, p += 4) {
    const a = acc[p + 3] / n2;
    if (a <= 0.0001) { out.data[p + 3] = 0; continue; }
    const inv = 1 / (a * n2);
    out.data[p] = Math.round(clamp01(linToSrgb(clamp01(acc[p] * inv))) * 255);
    out.data[p + 1] = Math.round(clamp01(linToSrgb(clamp01(acc[p + 1] * inv))) * 255);
    out.data[p + 2] = Math.round(clamp01(linToSrgb(clamp01(acc[p + 2] * inv))) * 255);
    out.data[p + 3] = Math.round(clamp01(a) * 255);
  }
  return out;
}

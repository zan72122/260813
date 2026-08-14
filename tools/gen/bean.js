// 豆 1 粒を per-pixel で焼く。
// 実行時には絶対に間に合わない計算（高さ場 → 法線 → 3灯ライティング →
// 表面下散乱 → 濡れコート → フレネル → AO）をここで全部やってしまう。
import { makeNoise, hexToLin, linToSrgb, clamp01, mix3, normalize3 } from './noise.js';

/* 工程ごとの材質。「乾いた豆」から「粘る豆」までを 1 本のパラメータ列で表す。 */
export const BEAN_STATES = {
  dry: {
    base: '#b39355', dark: '#7d6132', light: '#d3bb84',
    gloss: 0.12, wet: 0.05, wrinkle: 1.00, film: 0, plump: 0.84, mottle: 0.9,
  },
  soaked: {
    base: '#d8c48a', dark: '#a68d52', light: '#efe0b0',
    gloss: 0.40, wet: 0.55, wrinkle: 0.28, film: 0, plump: 1.0, mottle: 0.62,
  },
  steamed: {
    base: '#e6d199', dark: '#b89a5e', light: '#f9efcb',
    gloss: 0.55, wet: 0.72, wrinkle: 0.14, film: 0, plump: 1.05, mottle: 0.5,
  },
  fermented: {
    base: '#b08a55', dark: '#7a5c33', light: '#cfb07e',
    gloss: 0.34, wet: 0.38, wrinkle: 0.70, film: 0, plump: 1.0, mottle: 0.55,
  },
  mixed: {
    base: '#ab8452', dark: '#725430', light: '#caa876',
    gloss: 0.50, wet: 0.92, wrinkle: 0.62, film: 1.0, plump: 1.0, mottle: 0.5,
  },
};

/* 照明はシーン全体で共通。左上からの斜光キー（立体を出すため z を低く）、
   右からの空色フィル、背後からの抜け。 */
const KEY = normalize3(-0.44, -0.66, 0.36);
const FILL = normalize3(0.72, 0.06, 0.42);
const BACK = normalize3(0.18, 0.52, -0.62);
const KEY_COL = [1.42, 1.30, 1.10];
const FILL_COL = [0.26, 0.32, 0.42];
const BACK_COL = [0.85, 0.52, 0.26];

/**
 * @returns {ImageData} size x size の豆スプライト（周囲は透明）
 */
export function bakeBean(ctx2d, {
  size = 256, seed = 1, state = 'fermented', ss = 2, orient = 0,
} = {}) {
  const M = BEAN_STATES[state] || BEAN_STATES.fermented;
  const N = size * ss;
  const nz = makeNoise(seed * 7919 + 13);
  const rnd = nz.rnd;

  // 個体差：わずかな縦横比・色味・傾きのばらつき
  const aspect = 0.74 + rnd() * 0.12;
  const tint = (rnd() - 0.5) * 0.09;
  const hilAng = Math.PI + (rnd() - 0.5) * 0.7;
  const thickness = 0.78 * M.plump * (0.94 + rnd() * 0.12);
  const wobbleSeed = rnd() * 10;

  const baseC = hexToLin(M.base);
  const darkC = hexToLin(M.dark);
  const lightC = hexToLin(M.light);
  const filmC = hexToLin('#f6f0e2');

  const HF = new Float32Array(N * N);     // 形の高さ場（ドーム＋へそ）
  const HD = new Float32Array(N * N);     // 細部の高さ場（シワ・毛穴）
  const COV = new Float32Array(N * N);    // 被覆（内側 1）
  const MOT = new Float32Array(N * N);    // 色ムラ
  const CRV = new Float32Array(N * N);    // へその溝・シワの深さ（AO と膜だまりに使う）

  /* ---------- 1 パス目：形をつくる ----------
     形と細部を別々の高さ場に分けるのが要点。1 枚にまとめると
     シワの傾きがドームの傾きを食ってしまい、立体が消えて芋になる。 */
  // 豆の向きは「形」だけを回す。ライトは画面に固定したまま。
  // （描画時にスプライトを回すと、光の向きまで一緒に回ってしまい嘘になる）
  const co = Math.cos(orient), so = Math.sin(orient);

  for (let y = 0; y < N; y++) {
    const vs = ((y + 0.5) / N) * 2 - 1;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const us = ((x + 0.5) / N) * 2 - 1;
      const u = us * co + vs * so;
      const v = -us * so + vs * co;

      // 外形。真円・真楕円にしない（ただし崩しすぎると芋になる）
      const ang = Math.atan2(v, u);
      const wob = 1
        + 0.018 * nz.fbm(Math.cos(ang) * 1.6 + wobbleSeed, Math.sin(ang) * 1.6, 2)
        + 0.008 * nz.perlin(Math.cos(ang) * 3.4 + wobbleSeed, Math.sin(ang) * 3.4);
      const rr = Math.hypot(u / 0.94, v / (0.94 * aspect)) / wob;

      const cov = clamp01((1.0 - rr) * N * 0.32);
      COV[i] = cov;
      if (cov <= 0) continue;

      const t = Math.min(1, rr);
      // 縁で法線が寝るよう、指数を小さめにして肩を張らせる
      let h = Math.pow(Math.max(0, 1 - t * t), 0.46) * thickness;

      // へそ（種瘤）：小さくはっきりした長円の傷あと
      const hx = Math.cos(hilAng) * 0.60, hy = Math.sin(hilAng) * 0.58 * aspect;
      const dx = u - hx, dy = v - hy;
      const ca = Math.cos(hilAng + Math.PI / 2), sa = Math.sin(hilAng + Math.PI / 2);
      const lx = dx * ca + dy * sa;      // 溝の長手方向
      const ly = -dx * sa + dy * ca;
      const hil = Math.exp(-((lx / 0.22) ** 2 + (ly / 0.055) ** 2));
      h -= hil * 0.05;
      HF[i] = h;

      // シワ：発酵した豆の皮のたるみ。縁ほど強く出る
      const wr = (nz.ridged(u * 3.2 + 3, v * 3.2 - 2, 3) - 0.5);
      const wrMask = Math.pow(t, 1.6) * 0.8 + 0.2;
      const wrinkle = wr * M.wrinkle * 0.020 * wrMask;
      // 毛穴・微細な凹凸
      HD[i] = wrinkle + nz.fbm(u * 22, v * 22, 2) * 0.0025;

      CRV[i] = hil + Math.max(0, -wrinkle * 22);

      // 色ムラ：低周波の濃淡が主役。高周波を効かせすぎると「泥のはねた芋」になる
      const lf = nz.fbm(u * 1.15 + 11, v * 1.15 - 7, 3);
      const mf = nz.fbm(u * 2.6 - 3, v * 2.6 + 5, 2);
      const w1 = nz.worley(u * 2.2 + 5, v * 2.2 + 9, 0.9);
      MOT[i] = clamp01(0.5 + (lf * 0.85 + mf * 0.35 + (w1 - 0.5) * 0.22) * M.mottle);
    }
  }

  /* ---------- 2 パス目：法線を出して陰影をつける ---------- */
  const out = ctx2d.createImageData(size, size);
  const acc = new Float32Array(size * size * 4);
  const px = 2.0 / N;                     // 1 ピクセルのワールド幅

  for (let y = 0; y < N; y++) {
    const vs = ((y + 0.5) / N) * 2 - 1;
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const cov = COV[i];
      if (cov <= 0) continue;
      const us = ((x + 0.5) / N) * 2 - 1;
      const u = us * co + vs * so;
      const v = -us * so + vs * co;

      const xm = x > 0 ? i - 1 : i, xp = x < N - 1 ? i + 1 : i;
      const ym = y > 0 ? i - N : i, yp = y < N - 1 ? i + N : i;
      // 形の勾配（そのまま）＋ 細部の勾配（弱めて足す）
      const fx = (HF[xp] - HF[xm]) / (2 * px);
      const fy = (HF[yp] - HF[ym]) / (2 * px);
      const dx2 = (HD[xp] - HD[xm]) / (2 * px);
      const dy2 = (HD[yp] - HD[ym]) / (2 * px);
      const DETAIL = 0.55;
      const [nx, ny, nzz] = normalize3(-(fx + dx2 * DETAIL), -(fy + dy2 * DETAIL), 1);

      const h = HF[i];
      const thin = clamp01(1 - h / (thickness || 1));   // 縁ほど 1（薄い）

      /* --- アルベド --- */
      const m = MOT[i];
      let alb = m < 0.5 ? mix3(darkC, baseC, m * 2) : mix3(baseC, lightC, (m - 0.5) * 2);
      alb = [alb[0] * (1 + tint), alb[1], alb[2] * (1 - tint * 0.6)];
      // へそ（種瘤）は淡い茶。真っ黒にすると「目」や「割れ」に見えてしまう
      const hilD = clamp01(CRV[i]);
      alb = mix3(alb, [darkC[0] * 0.82, darkC[1] * 0.78, darkC[2] * 0.72], hilD * 0.42);
      // 縁の自己遮蔽
      const edge = Math.pow(clamp01((1 - cov) * 0.0 + thin), 3);
      alb = mix3(alb, [alb[0] * 0.55, alb[1] * 0.5, alb[2] * 0.48], edge * 0.35);

      /* --- 拡散（ラップ照明で表面下散乱を近似） --- */
      const nl1 = nx * KEY[0] + ny * KEY[1] + nzz * KEY[2];
      const nl2 = nx * FILL[0] + ny * FILL[1] + nzz * FILL[2];
      const nl3 = nx * BACK[0] + ny * BACK[1] + nzz * BACK[2];
      const wrap = (d, w) => clamp01((d + w) / (1 + w));
      const d1 = wrap(nl1, 0.30);
      const d2 = wrap(nl2, 0.55);

      // AO：溝とシワの底を暗くする
      const ao = clamp01(1 - hilD * 0.40) * (0.84 + 0.16 * clamp01(h / (thickness || 1) + 0.35));

      let r = alb[0] * (KEY_COL[0] * d1 + FILL_COL[0] * d2) * ao;
      let g = alb[1] * (KEY_COL[1] * d1 + FILL_COL[1] * d2) * ao;
      let b = alb[2] * (KEY_COL[2] * d1 + FILL_COL[2] * d2) * ao;

      // 透過（薄い縁が暖色に透ける）
      const trans = Math.pow(thin, 2.2) * clamp01(-nl3 * 0.5 + 0.6);
      r += BACK_COL[0] * trans * 0.55 * alb[0] * 3.0;
      g += BACK_COL[1] * trans * 0.5 * alb[1] * 3.0;
      b += BACK_COL[2] * trans * 0.45 * alb[2] * 3.0;

      /* --- 反射：肌のつやと、濡れコートの 2 ローブ --- */
      const fres = 0.035 + 0.965 * Math.pow(1 - clamp01(nzz), 5);
      const spec = (L, shin) => {
        const hx2 = L[0], hy2 = L[1], hz2 = L[2] + 1;
        const hl = Math.hypot(hx2, hy2, hz2) || 1;
        const nh = clamp01((nx * hx2 + ny * hy2 + nzz * hz2) / hl);
        return Math.pow(nh, shin);
      };
      const gloss = M.gloss * (0.85 + m * 0.3);
      const s1 = spec(KEY, 12 + gloss * 70) * (0.05 + gloss * 0.16);
      const wetAmt = M.wet * (0.75 + 0.25 * (1 - hilD));
      const s2 = spec(KEY, 260) * wetAmt * 1.35 * (0.35 + fres * 0.9);
      const s3 = spec(FILL, 90) * wetAmt * 0.30;
      const sTot = s1 + s2 + s3;
      r += sTot * KEY_COL[0];
      g += sTot * KEY_COL[1];
      b += sTot * KEY_COL[2];

      /* --- 粘りの膜（混ぜた後） --- */
      if (M.film > 0) {
        // 膜は「白く塗る」のではなく「溝と縁に薄く濁りが乗る」。
        // ここを強くすると豆が白い球になってしまう。
        const pool = clamp01(hilD * 0.8 + Math.pow(thin, 2.0) * 0.45);
        const fa = M.film * (0.045 + pool * 0.17 + fres * 0.13);
        r = r * (1 - fa) + filmC[0] * fa;
        g = g * (1 - fa) + filmC[1] * fa;
        b = b * (1 - fa) + filmC[2] * fa;
        // ごく小さな泡がまばらに
        const bub = nz.worley(u * 13 + 21, v * 13 - 8, 1);
        if (bub < 0.05) {
          const k = (1 - bub / 0.05) * 0.10 * M.film;
          r += k; g += k * 0.99; b += k * 0.94;
        }
      }

      // 蓄積（アルファ乗算済みで足してから最後に割る）
      const ox = (x / ss) | 0, oy = (y / ss) | 0;
      const oi = (oy * size + ox) * 4;
      acc[oi] += r * cov;
      acc[oi + 1] += g * cov;
      acc[oi + 2] += b * cov;
      acc[oi + 3] += cov;
    }
  }

  /* ---------- 縮小してガンマを戻す ---------- */
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

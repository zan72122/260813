/**
 * 干渉色（かんしょうしょく）の疑似表現。
 *
 * 本物の鉱物学計算はしていない。ミシェル・レビ色図の見た目だけを真似た
 * 「レターデーション(nm) -> 色」のグラデーション表を持ち、線形補間して返す。
 * 4歳の遊びに必要なのは「回すと色が変わる」だけなので、これで十分きれい。
 */

export type RGB = [number, number, number];

/** レターデーション(nm) と、そのときに見える色 */
const MICHEL_LEVY: ReadonlyArray<readonly [number, RGB]> = [
  [0, [14, 14, 20]],
  [90, [78, 78, 86]],
  [170, [140, 140, 140]],
  [230, [196, 196, 188]],
  [280, [226, 226, 210]],
  [340, [242, 236, 176]],
  [420, [250, 214, 96]],
  [480, [246, 168, 62]],
  [520, [234, 112, 66]],
  [545, [214, 62, 92]],
  [575, [168, 62, 168]],
  [600, [110, 78, 200]],
  [635, [62, 108, 214]],
  [670, [56, 160, 210]],
  [710, [64, 196, 170]],
  [755, [110, 208, 108]],
  [800, [172, 216, 82]],
  [845, [226, 214, 78]],
  [890, [240, 178, 68]],
  [935, [232, 116, 84]],
  [975, [206, 78, 138]],
  [1020, [162, 84, 190]],
  [1075, [106, 126, 208]],
  [1130, [92, 176, 198]],
  [1200, [118, 202, 172]],
  [1275, [166, 208, 140]],
  [1350, [214, 202, 124]],
  [1420, [224, 172, 126]],
  [1500, [216, 146, 148]],
  [1600, [196, 148, 186]],
  [1720, [166, 168, 200]],
  [1850, [162, 190, 190]],
  [2000, [182, 196, 178]],
  [2200, [196, 194, 182]],
];

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** あざやかさを上げる。子ども向けに、くすんだ色をへらす。 */
export function saturate(c: RGB, amount: number): RGB {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return clampRGB([
    lum + (c[0] - lum) * amount,
    lum + (c[1] - lum) * amount,
    lum + (c[2] - lum) * amount,
  ]);
}

/** レターデーション(nm) -> 干渉色 */
export function interferenceColor(retardation: number): RGB {
  return saturate(rawInterferenceColor(retardation), 1.42);
}

function rawInterferenceColor(retardation: number): RGB {
  const nm = Math.max(0, retardation);
  const last = MICHEL_LEVY.length - 1;
  if (nm >= MICHEL_LEVY[last][0]) return [...MICHEL_LEVY[last][1]] as RGB;
  let i = 0;
  while (i < last && MICHEL_LEVY[i + 1][0] < nm) i++;
  const [n0, c0] = MICHEL_LEVY[i];
  const [n1, c1] = MICHEL_LEVY[i + 1];
  const t = n1 === n0 ? 0 : (nm - n0) / (n1 - n0);
  return mixRGB(c0, c1, t);
}

export function rgbToCss(c: RGB): string {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
}

export function rgbaToCss(c: RGB, alpha: number): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

/** 見た目の近さ。0 = そっくり, 1 = 正反対。色あい重視で明るさは軽く見る。 */
export function colorDistance(a: RGB, b: RGB): number {
  const dr = (a[0] - b[0]) / 255;
  const dg = (a[1] - b[1]) / 255;
  const db = (a[2] - b[2]) / 255;
  // 人の目に合わせた重み付き距離
  const d = Math.sqrt(0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db);
  return Math.min(1, d);
}

export function brighten(c: RGB, amount: number): RGB {
  return mixRGB(c, [255, 255, 255], amount);
}

export function clampRGB(c: RGB): RGB {
  return [
    Math.max(0, Math.min(255, c[0])),
    Math.max(0, Math.min(255, c[1])),
    Math.max(0, Math.min(255, c[2])),
  ];
}

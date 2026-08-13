// レシピ（子どもが決めたこと）→ 結晶のかたち。
//
// ここは THREE を使わない純関数だけにしてある。
//   buildSpec(recipe) は、同じレシピなら いつでも まったく同じ結晶を返す。
// おかげで Node だけでテストでき、「操作 → 結果」の因果を機械的に検査できる。

import { makeRng } from './rng.js';

/* ---------------- しきい値 ---------------- */

export const MELT_R = 0.7; // たねを置ける半径（るつぼの内がわ）
export const TWIN_DIST = 0.3; // これより近い たねどうしは くっついて 双晶になる
export const MAX_SEEDS = 5;
export const MAX_CHUNKS = 5;
export const MIN_POUR = 0.3; // これだけ流さないと 結晶が液から出ない

const STEP_SLOW = 0.105; // ゆっくり冷やしたときの 一段の高さ
const STEP_FAST = 0.05; // 急いで冷やしたときの 一段の高さ

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- 名前 ---------------- */

export const COLORS = ['gin', 'kin', 'aka', 'murasaki', 'ao', 'midori'];
export const SHAPES = ['tsumiki', 'futago', 'takusan', 'tongari'];
export const RARES = ['oukan', 'nijinoshin', 'tamagoishi', 'kyodaibashira'];

export const LABEL = {
  gin: 'ぎん',
  kin: 'きん',
  aka: 'あか',
  murasaki: 'むらさき',
  ao: 'あお',
  midori: 'みどり',
  tsumiki: 'つみき',
  futago: 'ふたご',
  takusan: 'たくさん',
  tongari: 'とんがり',
  oukan: 'おうかん',
  nijinoshin: 'にじのしん',
  tamagoishi: 'たまごいし',
  kyodaibashira: 'きょだいばしら',
};

/* ---------------- レシピ ---------------- */

export function emptyRecipe(seed = 1) {
  return {
    seed: seed >>> 0 || 1,
    amount: 0, // かけらの数 1..5 → 大きさ
    seeds: [], // たねの位置 {x, z} 1..5 → 数・配置・双晶
    coolSpeed: 0.5, // あおいだ強さの平均 0..1 → 段の細かさ・空洞の深さ
    pour: 0, // 流した量 0..1 → 虹になる高さ
    pullTemp: 0.5, // 引き上げた瞬間の温度 0..1 → 色
    spice: 0, // ふりかけ 0=なし 1=すず 2=なまり → 形の系統
  };
}

/** たねを るつぼの中に おさめる */
export function clampSeed(s) {
  const r = Math.hypot(s.x, s.z);
  if (r <= MELT_R) return { x: s.x, z: s.z };
  const k = MELT_R / (r || 1);
  return { x: s.x * k, z: s.z * k };
}

/* ---------------- レシピ → 結晶 ---------------- */

export function buildSpec(recipeIn = {}) {
  const r = { ...emptyRecipe(recipeIn.seed ?? 1), ...recipeIn };
  const rng = makeRng(r.seed >>> 0 || 1);

  const amount = clamp(Math.round(r.amount) || 1, 1, MAX_CHUNKS);
  const cool = clamp(r.coolSpeed ?? 0.5, 0, 1);
  const pour = clamp(r.pour ?? 0, 0, 1);
  const pullTemp = clamp(r.pullTemp ?? 0.5, 0, 1);
  const spice = clamp(Math.round(r.spice) || 0, 0, 2);

  let seeds = (r.seeds || []).slice(0, MAX_SEEDS).map(clampSeed);
  if (!seeds.length) seeds = [{ x: 0, z: 0 }];

  // --- となりとの取り合い ---
  // まわりに余裕があるほど 融液を集められて 大きく育つ。
  // 係数 0.62 は「すこし重なる」ぶんで、近いたねどうしが 双晶に見えるようにするため。
  const space = seeds.map((s, i) => {
    let room = MELT_R - Math.hypot(s.x, s.z) + 0.16;
    for (let j = 0; j < seeds.length; j++) {
      if (i === j) continue;
      room = Math.min(room, Math.hypot(s.x - seeds[j].x, s.z - seeds[j].z) * 0.62);
    }
    return clamp(room, 0.085, 0.46);
  });
  const weight = space.map((s) => s * s);
  const wsum = weight.reduce((a, b) => a + b, 0) || 1;

  // --- 冷やす速さ → 段の細かさと 枠のほそさ（＝空洞の深さ） ---
  const step = lerp(STEP_SLOW, STEP_FAST, cool);
  const frameBase = lerp(0.36, 0.17, cool);
  const frameRatio = clamp(frameBase * (spice === 1 ? 0.72 : spice === 2 ? 1.35 : 1), 0.11, 0.48);
  const shrink = lerp(0.4, 0.66, cool);

  const crystals = seeds.map((s, i) => {
    const share = weight[i] / wsum;
    const k = Math.cbrt(Math.max(amount * share, 0.02));
    const size = clamp(0.21 * k * rng.range(0.93, 1.07), 0.085, space[i]);
    const wantH = clamp(0.55 * k * rng.range(0.92, 1.08) * (spice === 1 ? 0.8 : 1), 0.16, 1.3);
    const layers = clamp(Math.round(wantH / step), 4, 16);
    return {
      x: s.x,
      z: s.z,
      size,
      layers,
      step,
      frameRatio,
      shrink,
      twist: rng.range(-0.07, 0.07),
      lean: rng.range(-0.014, 0.014),
      rand: rng.next(),
      height: layers * step + 0.02,
    };
  });

  const maxLayers = crystals.reduce((m, c) => Math.max(m, c.layers), 0);
  const height = crystals.reduce((m, c) => Math.max(m, c.height), 0);
  const width = 2 * crystals.reduce((m, c) => Math.max(m, Math.hypot(c.x, c.z) + c.size), 0.1);

  // --- 流した量 → 液面線。これより下は 空気に触れないので 銀のまま ---
  const waterline = height * clamp(1 - pour, 0, 0.72);

  const twin = hasTwin(seeds);
  const ring = isRing(seeds);

  const spec = {
    crystals,
    seeds,
    maxLayers,
    height,
    width,
    waterline,
    filmBase: pour < MIN_POUR * 0.9 ? 0 : pullTemp,
    inner: false, // たまごいし用（空洞のなかの小さな石）
    seed: r.seed >>> 0,
    recipe: { amount, cool, pour, pullTemp, spice, seeds: seeds.map((s) => ({ ...s })) },
    twin,
    ring,
  };

  const cls = classify(spec);
  // 見せるときは 帯のまんなかの厚みを使う。そうすると 名前と色が ぴったり合う。
  spec.filmBand = (COLORS.indexOf(cls.color) + 0.5) / COLORS.length;
  spec.color = cls.color;
  spec.shape = cls.shape;
  spec.rare = cls.rare;
  spec.stars = cls.stars;
  spec.key = cls.key;
  spec.inner = cls.rare === 'tamagoishi';
  return spec;
}

/* ---------------- なにができたか ---------------- */

export function classify(spec) {
  const { crystals, seeds, maxLayers, height, twin, ring } = spec;
  const { amount, cool, pour, pullTemp } = spec.recipe;

  const color = COLORS[Math.min(COLORS.length - 1, Math.floor(spec.filmBase * COLORS.length))];

  let shape;
  if (crystals.length >= 3) shape = 'takusan';
  else if (twin) shape = 'futago';
  else if (maxLayers >= 11) shape = 'tongari';
  else shape = 'tsumiki';

  // レアは「運」ではなく「操作の組み合わせ」で出る。だから 親が教えられる。
  let rare = null;
  if (seeds.length >= 4 && ring && cool < 0.42) rare = 'oukan';
  else if (pour >= 0.42 && pour <= 0.62 && pullTemp >= 0.68) rare = 'nijinoshin';
  else if (seeds.length === 1 && cool > 0.68 && amount >= 4) rare = 'tamagoishi';
  else if (seeds.length === 1 && cool < 0.3 && amount >= 5) rare = 'kyodaibashira';

  let stars = 1;
  if (rare) stars = 3;
  else if (twin || crystals.length >= 4 || maxLayers >= 12 || height > 1.0) stars = 2;

  return { color, shape, rare, stars, key: rare ? `rare:${rare}` : `${color}|${shape}` };
}

/* ---------------- 小道具 ---------------- */

function hasTwin(seeds) {
  for (let i = 0; i < seeds.length; i++) {
    for (let j = i + 1; j < seeds.length; j++) {
      if (Math.hypot(seeds[i].x - seeds[j].x, seeds[i].z - seeds[j].z) < TWIN_DIST) return true;
    }
  }
  return false;
}

/** たねが 輪っかに ならんでいるか（おうかん用） */
function isRing(seeds) {
  if (seeds.length < 4) return false;
  const cx = seeds.reduce((a, s) => a + s.x, 0) / seeds.length;
  const cz = seeds.reduce((a, s) => a + s.z, 0) / seeds.length;
  const angles = [];
  for (const s of seeds) {
    const d = Math.hypot(s.x - cx, s.z - cz);
    if (d < 0.24) return false; // まんなかに たねがあると 輪にならない
    angles.push(Math.atan2(s.z - cz, s.x - cx));
  }
  angles.sort((a, b) => a - b);
  let maxGap = angles[0] + Math.PI * 2 - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
  return maxGap < 2.3; // ぐるりと ならんでいる
}

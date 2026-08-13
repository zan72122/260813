/**
 * 薄片（プレパラート）の定義と生成。
 *
 * それぞれの粒は「向き(theta0)」と「レターデーション(nm)」を持つ。
 * ステージを回すと向きと偏光板の角度の関係が変わるので、
 *   あかるさ = sin^2( 2 * (向き + ステージ角) )
 * で明暗し、色そのものはレターデーションで決まる。
 * これで「回すと粒の色が変わる」体験になる（本物の計算ではない疑似表現）。
 */

import { interferenceColor, mixRGB, type RGB } from './colors';
import { buildMosaic, polygonArea, polygonCentroid, type Pt } from './mosaic';
import { Rng } from './rng';

/**
 * 消光しても真っ暗にはしない。4歳が「こわれた」と思わないように、
 * いちばん暗いときでも「その粒の色のまま、すこし暗い」だけにする。
 */
export const EXTINCTION_FLOOR = 0.4;

export interface Grain {
  poly: Pt[];
  /** 重心（単位座標） */
  c: Pt;
  /** だいたいの半径 */
  r: number;
  /** 結晶の向き（ラジアン） */
  theta0: number;
  /** レターデーション(nm) */
  retardation: number;
  /** 等方体（回しても色が変わらない粒） */
  isotropic: boolean;
  /** 偏光オフのときの色 */
  ppl: RGB;
  /** いちばん明るいときの干渉色 */
  xpl: RGB;
  /** へき開（すじ）の強さ 0..1 */
  cleavage: number;
  /** 粒ごとの明るさのゆらぎ */
  tint: number;
  /** モザイクの上にのせた大きな粒（下の粒を隠す） */
  overlay?: boolean;
}

export interface ThinSection {
  def: SlideDef;
  grains: Grain[];
  /** 下の粒を隠している粒（きらきらを出さないための判定に使う） */
  overlays: Grain[];
}

export interface SlideDef {
  id: string;
  /** ひらがなの名前 */
  name: string;
  /** ひとこと */
  sub: string;
  emoji: string;
  cardFrom: string;
  cardTo: string;
  seed: number;
  count: number;
  elongation: number;
  foliation: number;
  cleavage: number;
  isotropicChance: number;
  /** レターデーション(nm) を決める */
  retard: (rng: Rng) => number;
  /** 偏光オフのときの色 */
  ppl: (rng: Rng) => RGB;
  /** 大きな丸い粒（ざくろ石など） */
  blobs?: {
    count: number;
    rMin: number;
    rMax: number;
    ppl: RGB;
  };
}

function jitter(rng: Rng, base: RGB, amount: number): RGB {
  const d = rng.bell() * amount;
  return [base[0] + d, base[1] + d, base[2] + d];
}

export const SLIDES: SlideDef[] = [
  {
    id: 'kori',
    name: 'こおりいし',
    sub: 'しろくて しずか',
    emoji: '❄️',
    cardFrom: '#dff1ff',
    cardTo: '#a9d8f5',
    seed: 20250813,
    count: 150,
    elongation: 1.15,
    foliation: 0.4,
    cleavage: 0.05,
    isotropicChance: 0.02,
    retard: (rng) => {
      // ほとんどは白～灰色。ときどき色つきの粒がまざる。
      const roll = rng.next();
      if (roll < 0.14) return rng.range(400, 620);
      if (roll < 0.24) return rng.range(240, 400);
      return rng.range(30, 240);
    },
    ppl: (rng) => jitter(rng, [236, 236, 232], 12),
  },
  {
    id: 'niji',
    name: 'にじいし',
    sub: 'いちばん カラフル',
    emoji: '🌈',
    cardFrom: '#ffe3f1',
    cardTo: '#ffd08a',
    seed: 777001,
    count: 92,
    elongation: 1.12,
    foliation: -0.6,
    cleavage: 0.12,
    isotropicChance: 0.03,
    // かんらん石ふうに、たっぷり色がつく高いレターデーション
    retard: (rng) => rng.range(600, 1560),
    ppl: (rng) => jitter(rng, [226, 232, 210], 14),
  },
  {
    id: 'hoshizora',
    name: 'ほしぞらいし',
    sub: 'ながい つぶが きらり',
    emoji: '✨',
    cardFrom: '#e6e0ff',
    cardTo: '#8fa6e8',
    seed: 424242,
    count: 128,
    elongation: 2.8,
    foliation: -0.34,
    cleavage: 0.75,
    isotropicChance: 0.1,
    retard: (rng) => {
      const roll = rng.next();
      if (roll < 0.35) return rng.range(560, 700); // 青むらさき
      return rng.range(360, 1180);
    },
    ppl: (rng) => jitter(rng, [214, 206, 194], 18),
  },
  {
    id: 'tamago',
    name: 'たまごいし',
    sub: 'たまごが かくれてる',
    emoji: '🥚',
    cardFrom: '#ffe8e4',
    cardTo: '#f2a6b8',
    seed: 90210,
    count: 140,
    elongation: 1.05,
    foliation: 0.9,
    cleavage: 0.1,
    isotropicChance: 0.04,
    retard: (rng) => rng.range(260, 980),
    ppl: (rng) => jitter(rng, [232, 224, 224], 14),
    blobs: {
      count: 4,
      rMin: 0.17,
      rMax: 0.29,
      ppl: [238, 206, 206],
    },
  },
];

export function getSlideDef(id: string): SlideDef {
  return SLIDES.find((s) => s.id === id) ?? SLIDES[0];
}

/** 丸い粒（ざくろ石など）のポリゴンを作る */
function blobPolygon(rng: Rng, cx: number, cy: number, r: number): Pt[] {
  const n = 18;
  const wob = rng.range(0.04, 0.1);
  const phase = rng.range(0, Math.PI * 2);
  const poly: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + Math.sin(a * 3 + phase) * wob + Math.sin(a * 5 - phase) * wob * 0.5);
    poly.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return poly;
}

export function buildThinSection(def: SlideDef): ThinSection {
  const rng = new Rng(def.seed);
  const cells = buildMosaic(rng, {
    count: def.count,
    elongation: def.elongation,
    foliation: def.foliation,
    relax: 2,
  });

  const grains: Grain[] = [];
  for (const poly of cells) {
    const c = polygonCentroid(poly);
    const area = polygonArea(poly);
    const isotropic = rng.next() < def.isotropicChance;
    const retardation = isotropic ? 0 : def.retard(rng);
    grains.push({
      poly,
      c,
      r: Math.sqrt(area / Math.PI),
      theta0: rng.range(0, Math.PI),
      retardation,
      isotropic,
      ppl: def.ppl(rng),
      xpl: interferenceColor(retardation),
      cleavage: rng.next() < 0.55 ? def.cleavage * rng.range(0.6, 1) : 0,
      tint: rng.range(0.9, 1.1),
    });
  }

  // 大きな丸い粒を上にのせる
  if (def.blobs) {
    for (let i = 0; i < def.blobs.count; i++) {
      const a = (i / def.blobs.count) * Math.PI * 2 + rng.range(-0.5, 0.5);
      const dist = rng.range(0.2, 0.78);
      const cx = Math.cos(a) * dist;
      const cy = Math.sin(a) * dist;
      const r = rng.range(def.blobs.rMin, def.blobs.rMax);
      const poly = blobPolygon(rng, cx, cy, r);
      grains.push({
        poly,
        c: { x: cx, y: cy },
        r,
        theta0: 0,
        retardation: 0,
        isotropic: true,
        ppl: [...def.blobs.ppl] as RGB,
        xpl: [18, 16, 22],
        cleavage: 0,
        tint: 1,
        overlay: true,
      });
    }
  }

  return { def, grains, overlays: grains.filter((g) => g.overlay) };
}

/** 粒のあかるさ 0..1（偏光オンのとき） */
export function grainIntensity(g: Grain, stageAngle: number): number {
  if (g.isotropic) return 0;
  const s = Math.sin(2 * (g.theta0 + stageAngle));
  return s * s;
}

/** いま画面に見えている色 */
export function grainDisplayColor(g: Grain, stageAngle: number, polarized: number): RGB {
  const ppl = g.ppl;
  if (polarized <= 0) return ppl;

  let xpl: RGB;
  if (g.isotropic) {
    // 等方体は回しても真っ暗のまま
    xpl = mixRGB([24, 20, 38], g.ppl, 0.16);
  } else {
    // 暗いほうも「黒」ではなく「その粒の色の暗いほう」にして、色あいを残す
    const dim = mixRGB([18, 16, 32], g.xpl, EXTINCTION_FLOOR);
    const bright = mixRGB(g.xpl, [255, 252, 240], 0.06);
    const k = Math.min(1, grainIntensity(g, stageAngle) * g.tint);
    xpl = mixRGB(dim, bright, k);
  }
  return polarized >= 1 ? xpl : mixRGB(ppl, xpl, polarized);
}

/** きらきら（星）を出すほど明るいか */
export function isSparkling(g: Grain, stageAngle: number): boolean {
  if (g.isotropic) return false;
  if (g.retardation < 380) return false;
  return grainIntensity(g, stageAngle) > 0.88;
}

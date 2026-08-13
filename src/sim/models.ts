import type { Anchor, Beam } from './stress';
import { polyBBox, type Rect, type Vec } from '../engine/util';

export type ModelId = 'bridge' | 'arch' | 'flower';

/** 実験台の地面（模型が載る高さ） */
export const GROUND_Y = 720;
/** 実験台の全景（自動カメラの「ひき」の画） */
export const BENCH_RECT: Rect = { x: 120, y: 170, w: 960, h: 700 };

export interface Specimen {
  id: ModelId;
  /** ひらがなの名前 */
  label: string;
  /** 透明模型の形（重なってよい。合併として塗る） */
  polys: Vec[][];
  /** 支点 */
  anchors: Anchor[];
  /** 模型の外接矩形 */
  bbox: Rect;
  /** 「ここを押してね」の指マークを出す場所 */
  hint: Vec;
  /** 接写のときに合わせる矩形 */
  focus: Rect;
  /** 接写で「ぜったいに切ってはいけない」範囲（たて画面での寄り具合を決める） */
  core: Rect;
  /** 支えを指で動かせるか */
  anchorsMovable: boolean;
  /** はりの曲げを足す模型（橋げた）だけ設定する */
  beam?: Beam;
}

export interface ModelParams {
  /** 橋：左右の支えの位置 */
  pierL: number;
  pierR: number;
  /** おはな：ひらき具合 0〜1 */
  bloom: number;
}

export const defaultParams = (): ModelParams => ({ pierL: 350, pierR: 850, bloom: 0 });

export function buildSpecimen(id: ModelId, p: ModelParams): Specimen {
  switch (id) {
    case 'bridge':
      return buildBridge(p);
    case 'arch':
      return buildArch();
    case 'flower':
      return buildFlower(p);
  }
}

export const MODEL_ORDER: ModelId[] = ['bridge', 'arch', 'flower'];

export const MODEL_LABEL: Record<ModelId, string> = {
  bridge: 'はし',
  arch: 'アーチ',
  flower: 'おはな',
};

/* ------------------------------------------------------------------ 橋 */

export const BRIDGE_DECK_TOP = 430;
export const BRIDGE_LEFT = 240;
export const BRIDGE_RIGHT = 960;
const BRIDGE_DECK_BOTTOM = 508;

function buildBridge(p: ModelParams): Specimen {
  const pts: Vec[] = [];
  const steps = 40;
  // 上の面はほんの少しだけ反っている（まん中が高い）
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = BRIDGE_LEFT + (BRIDGE_RIGHT - BRIDGE_LEFT) * t;
    const camber = Math.sin(t * Math.PI) * 10;
    pts.push({ x, y: BRIDGE_DECK_TOP - camber });
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const x = BRIDGE_LEFT + (BRIDGE_RIGHT - BRIDGE_LEFT) * t;
    const camber = Math.sin(t * Math.PI) * 4;
    pts.push({ x, y: BRIDGE_DECK_BOTTOM - camber });
  }
  const polys = [pts];
  const anchors: Anchor[] = [
    { x: p.pierL, y: BRIDGE_DECK_BOTTOM, weight: 1 },
    { x: p.pierR, y: BRIDGE_DECK_BOTTOM, weight: 1 },
  ];
  const bbox = polyBBox(polys);
  return {
    id: 'bridge',
    label: MODEL_LABEL.bridge,
    polys,
    anchors,
    bbox,
    hint: { x: 600, y: BRIDGE_DECK_TOP - 10 },
    focus: { x: 190, y: 300, w: 820, h: 440 },
    core: { x: 236, y: 348, w: 728, h: 392 },
    anchorsMovable: true,
    beam: { x0: p.pierL, x1: p.pierR, yc: (BRIDGE_DECK_TOP + BRIDGE_DECK_BOTTOM) / 2 },
  };
}

/* ---------------------------------------------------------------- アーチ */

const ARCH_CX = 600;
const ARCH_CY = GROUND_Y;
const ARCH_RO = 318;
const ARCH_RI = 244;

function buildArch(): Specimen {
  const pts: Vec[] = [];
  const steps = 56;
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI - (Math.PI * i) / steps;
    pts.push({ x: ARCH_CX + Math.cos(a) * ARCH_RO, y: ARCH_CY - Math.sin(a) * ARCH_RO });
  }
  for (let i = steps; i >= 0; i--) {
    const a = Math.PI - (Math.PI * i) / steps;
    pts.push({ x: ARCH_CX + Math.cos(a) * ARCH_RI, y: ARCH_CY - Math.sin(a) * ARCH_RI });
  }
  const polys = [pts];
  const footL = ARCH_CX - (ARCH_RO + ARCH_RI) / 2;
  const footR = ARCH_CX + (ARCH_RO + ARCH_RI) / 2;
  const anchors: Anchor[] = [
    { x: footL, y: ARCH_CY - 6, weight: 1 },
    { x: footR, y: ARCH_CY - 6, weight: 1 },
  ];
  return {
    id: 'arch',
    label: MODEL_LABEL.arch,
    polys,
    anchors,
    bbox: polyBBox(polys),
    hint: { x: ARCH_CX, y: ARCH_CY - ARCH_RO + 34 },
    focus: { x: 220, y: 340, w: 760, h: 430 },
    core: { x: 268, y: 366, w: 664, h: 386 },
    anchorsMovable: false,
  };
}

/** アーチの足もと（チャレンジの目標地点） */
export function archFeet(): Vec[] {
  const footL = ARCH_CX - (ARCH_RO + ARCH_RI) / 2;
  const footR = ARCH_CX + (ARCH_RO + ARCH_RI) / 2;
  return [
    { x: footL, y: ARCH_CY - 40 },
    { x: footR, y: ARCH_CY - 40 },
  ];
}

/* --------------------------------------------------------------- おはな */

export const FLOWER_CX = 600;
export const FLOWER_CY = 452;
const PETALS = 6;

function buildFlower(p: ModelParams): Specimen {
  const bloom = Math.max(0, Math.min(1, p.bloom));
  const polys: Vec[][] = [];

  // まんなかの丸
  const core: Vec[] = [];
  const coreR = 80;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    core.push({ x: FLOWER_CX + Math.cos(a) * coreR, y: FLOWER_CY + Math.sin(a) * coreR });
  }

  // 花びら（ひらくほど外へ・大きく）
  const petalDist = 104 + bloom * 34;
  const petalLong = 74 + bloom * 22;
  const petalWide = 50 + bloom * 6;
  for (let k = 0; k < PETALS; k++) {
    const a = -Math.PI / 2 + (k / PETALS) * Math.PI * 2;
    const cx = FLOWER_CX + Math.cos(a) * petalDist;
    const cy = FLOWER_CY + Math.sin(a) * petalDist;
    const petal: Vec[] = [];
    for (let i = 0; i < 26; i++) {
      const t = (i / 26) * Math.PI * 2;
      const ex = Math.cos(t) * petalLong;
      const ey = Math.sin(t) * petalWide;
      petal.push({
        x: cx + ex * Math.cos(a) - ey * Math.sin(a),
        y: cy + ex * Math.sin(a) + ey * Math.cos(a),
      });
    }
    polys.push(petal);
  }
  polys.push(core);

  // くき
  const stemW = 26;
  polys.push([
    { x: FLOWER_CX - stemW / 2, y: FLOWER_CY },
    { x: FLOWER_CX + stemW / 2, y: FLOWER_CY },
    { x: FLOWER_CX + stemW / 2 + 4, y: GROUND_Y },
    { x: FLOWER_CX - stemW / 2 - 4, y: GROUND_Y },
  ]);

  const anchors: Anchor[] = [{ x: FLOWER_CX, y: GROUND_Y - 8, weight: 1.6 }];
  // 花びらの付け根も「支え」。花びらを押すと付け根に虹が出る
  for (let k = 0; k < PETALS; k++) {
    const a = -Math.PI / 2 + (k / PETALS) * Math.PI * 2;
    anchors.push({
      x: FLOWER_CX + Math.cos(a) * 58,
      y: FLOWER_CY + Math.sin(a) * 58,
      weight: 0.55,
    });
  }

  return {
    id: 'flower',
    label: MODEL_LABEL.flower,
    polys,
    anchors,
    bbox: polyBBox(polys),
    hint: { x: FLOWER_CX, y: FLOWER_CY - petalDist - petalLong * 0.35 },
    focus: { x: 300, y: 200, w: 600, h: 580 },
    core: { x: 345, y: 230, w: 510, h: 520 },
    anchorsMovable: false,
  };
}

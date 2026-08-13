/**
 * 薄片の「粒（つぶ）」のかたちを作る。
 * ボロノイ分割 + ロイド緩和で、岩石薄片らしいモザイクにする。
 * 座標は半径1の円（視野）を基準にした単位座標。
 */

import { Rng } from './rng';

export interface Pt {
  x: number;
  y: number;
}

/** 半平面クリップ: site に近い側だけ残す */
function clipToBisector(poly: Pt[], site: Pt, other: Pt): Pt[] {
  const nx = other.x - site.x;
  const ny = other.y - site.y;
  const mx = (site.x + other.x) / 2;
  const my = (site.y + other.y) / 2;
  // 内側 = (p - m)·n <= 0
  const side = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny;

  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = side(a);
    const db = side(b);
    if (da <= 0) out.push(a);
    if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function boundingSquare(size: number): Pt[] {
  return [
    { x: -size, y: -size },
    { x: size, y: -size },
    { x: size, y: size },
    { x: -size, y: size },
  ];
}

/** 1サイト分のボロノイ領域 */
function voronoiCell(sites: Pt[], index: number, bound: number): Pt[] {
  let poly = boundingSquare(bound);
  const site = sites[index];
  for (let j = 0; j < sites.length && poly.length > 2; j++) {
    if (j === index) continue;
    const o = sites[j];
    // 遠すぎるサイトは影響しない（軽量化）
    const dx = o.x - site.x;
    const dy = o.y - site.y;
    if (dx * dx + dy * dy > bound * bound * 4) continue;
    poly = clipToBisector(poly, site, o);
  }
  return poly;
}

export function polygonCentroid(poly: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) return { ...poly[0] };
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function pointInPolygon(poly: Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export interface MosaicOptions {
  /** 粒の数のめやす */
  count: number;
  /** 1 で等方的、2 以上で細長い粒（片理のある岩石むけ） */
  elongation?: number;
  /** 細長い方向（ラジアン） */
  foliation?: number;
  /** ロイド緩和の回数。多いほど粒がそろう */
  relax?: number;
}

/** 視野の外側まで少し余分に作る（回転しても端が欠けないように） */
const FIELD_BOUND = 1.35;

export function buildMosaic(rng: Rng, opts: MosaicOptions): Pt[][] {
  const { count, elongation = 1, foliation = 0, relax = 2 } = opts;

  // サイトを円内にばらまく
  let sites: Pt[] = [];
  for (let i = 0; i < count; i++) {
    // 一様に円内へ
    const r = Math.sqrt(rng.next()) * FIELD_BOUND;
    const a = rng.next() * Math.PI * 2;
    sites.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }

  // ロイド緩和で粒の大きさをそろえる
  for (let k = 0; k < relax; k++) {
    const moved: Pt[] = [];
    for (let i = 0; i < sites.length; i++) {
      const cell = voronoiCell(sites, i, FIELD_BOUND);
      if (cell.length < 3) {
        moved.push(sites[i]);
        continue;
      }
      const c = polygonCentroid(cell);
      // 少しだけランダムを残すと自然に見える
      moved.push({
        x: c.x + rng.bell() * 0.012,
        y: c.y + rng.bell() * 0.012,
      });
    }
    sites = moved;
  }

  // 細長い粒にする: つぶした空間でボロノイを取り、元に戻す
  const cos = Math.cos(foliation);
  const sin = Math.sin(foliation);
  const squashed: Pt[] = sites.map((p) => {
    // 片理方向へ回してから、その方向にだけ縮める
    const rx = p.x * cos + p.y * sin;
    const ry = -p.x * sin + p.y * cos;
    return { x: rx / elongation, y: ry };
  });

  const cells: Pt[][] = [];
  for (let i = 0; i < squashed.length; i++) {
    const cell = voronoiCell(squashed, i, FIELD_BOUND * Math.max(1, elongation));
    if (cell.length < 3) continue;
    // 元の空間へ戻す
    const restored = cell.map((p) => {
      const sx = p.x * elongation;
      const sy = p.y;
      return { x: sx * cos - sy * sin, y: sx * sin + sy * cos };
    });
    // 視野からまったく外れている粒は捨てる
    const c = polygonCentroid(restored);
    if (Math.hypot(c.x, c.y) > FIELD_BOUND + 0.15) continue;
    cells.push(restored);
  }
  return cells;
}

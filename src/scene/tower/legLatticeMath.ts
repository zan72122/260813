/**
 * Pure geometric math for one leg's battered box-truss lattice: 4 corner
 * "chords" running from the leg's wide base to its narrow top, joined by
 * horizontal rungs and diagonal cross-braces at each lattice level. No
 * Three.js import — every function returns plain number tuples so the
 * segment layout (and therefore the eventual InstancedMesh instance count)
 * is unit-testable without constructing any GPU-facing object.
 *
 * `legLatticeGeometry.ts` consumes this to build the actual InstancedMesh
 * (PERFORMANCE_BUDGET.md "足場・リベットはInstancedMesh").
 */
import type { LegId } from '../../contracts/types';
import {
  GIRDER_RING_Y,
  GROUND_Y,
  LEG_CHORD_HALF_WIDTH_BASE,
  LEG_CHORD_HALF_WIDTH_TOP,
  LEG_LATTICE_LEVELS,
  legBaseXZ,
  legRadialUnit,
  legTangentUnit,
  legTopXZ,
} from '../layout';

export type Vec3 = readonly [number, number, number];
export interface Segment {
  a: Vec3;
  b: Vec3;
}

/** The 4 sign combinations (radial, tangential) that define a leg's square cross-section corners, in loop order (0→1→2→3→0 forms the perimeter). */
const CORNER_SIGNS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

function cornerPoint(leg: LegId, cornerIndex: number, y: number, halfWidth: number): Vec3 {
  const center = y === GROUND_Y ? legBaseXZ(leg) : legTopXZ(leg);
  const r = legRadialUnit(leg);
  const t = legTangentUnit(leg);
  const signPair = CORNER_SIGNS[cornerIndex % 4];
  const sr = signPair?.[0] ?? 1;
  const st = signPair?.[1] ?? 1;
  return [center.x + (r.x * sr + t.x * st) * halfWidth, y, center.z + (r.z * sr + t.z * st) * halfWidth];
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The 4 bottom (ground-level) corner points of leg `leg`'s box-truss footprint. */
export function legBottomCorners(leg: LegId): Vec3[] {
  return [0, 1, 2, 3].map((i) => cornerPoint(leg, i, GROUND_Y, LEG_CHORD_HALF_WIDTH_BASE));
}

/** The 4 top (girder-ring-level) corner points of leg `leg`'s box-truss footprint, just under the pin. */
export function legTopCorners(leg: LegId): Vec3[] {
  return [0, 1, 2, 3].map((i) => cornerPoint(leg, i, GIRDER_RING_Y, LEG_CHORD_HALF_WIDTH_TOP));
}

/** Corner `cornerIndex`'s position at lattice level `level` (0 = base, `LEG_LATTICE_LEVELS - 1` = top), linearly interpolated between bottom and top corners. */
export function legCornerAtLevel(leg: LegId, cornerIndex: number, level: number, levels = LEG_LATTICE_LEVELS): Vec3 {
  const bottom = cornerPoint(leg, cornerIndex, GROUND_Y, LEG_CHORD_HALF_WIDTH_BASE);
  const top = cornerPoint(leg, cornerIndex, GIRDER_RING_Y, LEG_CHORD_HALF_WIDTH_TOP);
  const t = levels <= 1 ? 1 : level / (levels - 1);
  return lerpVec3(bottom, top, t);
}

/** The 4 corner chord segments (base→top) for one leg. */
export function legChordSegments(leg: LegId): Segment[] {
  const bottoms = legBottomCorners(leg);
  const tops = legTopCorners(leg);
  return bottoms.map((b, i) => ({ a: b, b: tops[i] ?? b }));
}

/** Horizontal rung segments (perimeter square at each lattice level) for one leg. */
export function legRungSegments(leg: LegId, levels = LEG_LATTICE_LEVELS): Segment[] {
  const segs: Segment[] = [];
  for (let level = 0; level < levels; level++) {
    const corners = [0, 1, 2, 3].map((c) => legCornerAtLevel(leg, c, level, levels));
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      if (a && b) segs.push({ a, b });
    }
  }
  return segs;
}

/** Diagonal "X" cross-brace segments between consecutive lattice levels, on all 4 faces, for one leg. */
export function legBraceSegments(leg: LegId, levels = LEG_LATTICE_LEVELS): Segment[] {
  const segs: Segment[] = [];
  for (let level = 0; level < levels - 1; level++) {
    const lower = [0, 1, 2, 3].map((c) => legCornerAtLevel(leg, c, level, levels));
    const upper = [0, 1, 2, 3].map((c) => legCornerAtLevel(leg, c, level + 1, levels));
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const li = lower[i];
      const uj = upper[j];
      const lj = lower[j];
      const ui = upper[i];
      if (li && uj) segs.push({ a: li, b: uj });
      if (lj && ui) segs.push({ a: lj, b: ui });
    }
  }
  return segs;
}

/** Small rivet-marker points spaced along a chord segment (excludes the very ends). */
export function chordRivetPoints(segment: Segment, count = 5): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 1; i <= count; i++) {
    pts.push(lerpVec3(segment.a, segment.b, i / (count + 1)));
  }
  return pts;
}

/** All structural bar segments (chords + rungs + braces) for one leg. */
export function legAllBarSegments(leg: LegId, levels = LEG_LATTICE_LEVELS): Segment[] {
  return [...legChordSegments(leg), ...legRungSegments(leg, levels), ...legBraceSegments(leg, levels)];
}

/** All structural bar segments for all 4 legs, in leg order. */
export function allLegsBarSegments(levels = LEG_LATTICE_LEVELS): Segment[] {
  const legs: LegId[] = [0, 1, 2, 3];
  return legs.flatMap((leg) => legAllBarSegments(leg, levels));
}

/** All rivet marker points for all 4 legs' chords (4 chords × 4 legs × `perChord` points). */
export function allLegsRivetPoints(perChord = 5): Vec3[] {
  const legs: LegId[] = [0, 1, 2, 3];
  return legs.flatMap((leg) => legChordSegments(leg).flatMap((seg) => chordRivetPoints(seg, perChord)));
}

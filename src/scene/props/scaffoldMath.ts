/**
 * Pure segment math for one leg's timber scaffolding: a ring of vertical
 * poles surrounding the leg's base footprint, joined by a few horizontal
 * brace rings. No Three import — mirrors tower/legLatticeMath.ts's
 * separation of pure geometry math from the InstancedMesh builder.
 */
import type { LegId } from '../../contracts/types';
import { GROUND_Y, LEG_CHORD_HALF_WIDTH_BASE, legBaseXZ } from '../layout';
import type { Segment, Vec3 } from '../tower/legLatticeMath';

/** Radius (world units) of the pole ring around a leg's base — outside the leg's own lattice footprint. */
export const SCAFFOLD_RADIUS = LEG_CHORD_HALF_WIDTH_BASE + 1.6;

/** Number of vertical poles per leg. */
export const SCAFFOLD_POLE_COUNT = 6;

/** Number of horizontal brace-ring levels per leg (including the base level). */
export const SCAFFOLD_BRACE_LEVELS = 3;

/** Scaffold height (world units) — historically ~30m falsework against a 57m first level; kept proportionate here. */
export function scaffoldHeight(towerHeight: number): number {
  return towerHeight * 0.55;
}

function poleXZ(leg: LegId, poleIndex: number, poleCount: number): { x: number; z: number } {
  const base = legBaseXZ(leg);
  const angle = (poleIndex / poleCount) * Math.PI * 2;
  return { x: base.x + Math.cos(angle) * SCAFFOLD_RADIUS, z: base.z + Math.sin(angle) * SCAFFOLD_RADIUS };
}

/** Vertical pole segments for one leg's scaffold. */
export function scaffoldPoleSegments(leg: LegId, height: number, poleCount = SCAFFOLD_POLE_COUNT): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < poleCount; i++) {
    const p = poleXZ(leg, i, poleCount);
    segs.push({ a: [p.x, GROUND_Y, p.z], b: [p.x, GROUND_Y + height, p.z] });
  }
  return segs;
}

/** Horizontal brace-ring segments for one leg's scaffold, at `levels` evenly-spaced heights. */
export function scaffoldBraceSegments(
  leg: LegId,
  height: number,
  poleCount = SCAFFOLD_POLE_COUNT,
  levels = SCAFFOLD_BRACE_LEVELS,
): Segment[] {
  const segs: Segment[] = [];
  for (let lvl = 0; lvl < levels; lvl++) {
    const y = GROUND_Y + (levels <= 1 ? 0 : (height * lvl) / (levels - 1));
    const points: Vec3[] = [];
    for (let i = 0; i < poleCount; i++) {
      const p = poleXZ(leg, i, poleCount);
      points.push([p.x, y, p.z]);
    }
    for (let i = 0; i < poleCount; i++) {
      const a = points[i];
      const b = points[(i + 1) % poleCount];
      if (a && b) segs.push({ a, b });
    }
  }
  return segs;
}

/** All scaffold segments (poles + brace rings) for one leg. */
export function scaffoldSegmentsForLeg(leg: LegId, height: number): Segment[] {
  return [...scaffoldPoleSegments(leg, height), ...scaffoldBraceSegments(leg, height)];
}

/** All scaffold segments for all 4 legs, combined. */
export function allScaffoldSegments(height: number): Segment[] {
  const legs: LegId[] = [0, 1, 2, 3];
  return legs.flatMap((leg) => scaffoldSegmentsForLeg(leg, height));
}

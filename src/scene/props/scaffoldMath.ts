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

function poleXZ(leg: LegId, poleIndex: number, poleCount: number, angleOffsetRad = 0): { x: number; z: number } {
  const base = legBaseXZ(leg);
  const angle = (poleIndex / poleCount) * Math.PI * 2 + angleOffsetRad;
  return { x: base.x + Math.cos(angle) * SCAFFOLD_RADIUS, z: base.z + Math.sin(angle) * SCAFFOLD_RADIUS };
}

/**
 * Vertical pole segments for one leg's scaffold. `angleOffsetRad` (F8,
 * review round 1) rotates the whole pole ring's starting angle — sourced
 * from `contracts/rng.ts`'s `legScenario(seed, leg).propVariant` by
 * `sceneBuilder.ts` — so each leg's scaffold dressing reads as a distinct
 * arrangement instead of 4 identical rings, without changing the pole
 * COUNT (so PERFORMANCE_BUDGET's segment-count bound is untouched). Default
 * 0 keeps every pre-existing call site (and this file's own budget test)
 * byte-identical to the pre-F8 layout.
 */
export function scaffoldPoleSegments(
  leg: LegId,
  height: number,
  poleCount = SCAFFOLD_POLE_COUNT,
  angleOffsetRad = 0,
): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < poleCount; i++) {
    const p = poleXZ(leg, i, poleCount, angleOffsetRad);
    segs.push({ a: [p.x, GROUND_Y, p.z], b: [p.x, GROUND_Y + height, p.z] });
  }
  return segs;
}

/** Horizontal brace-ring segments for one leg's scaffold, at `levels` evenly-spaced heights. `angleOffsetRad` — see `scaffoldPoleSegments`. */
export function scaffoldBraceSegments(
  leg: LegId,
  height: number,
  poleCount = SCAFFOLD_POLE_COUNT,
  levels = SCAFFOLD_BRACE_LEVELS,
  angleOffsetRad = 0,
): Segment[] {
  const segs: Segment[] = [];
  for (let lvl = 0; lvl < levels; lvl++) {
    const y = GROUND_Y + (levels <= 1 ? 0 : (height * lvl) / (levels - 1));
    const points: Vec3[] = [];
    for (let i = 0; i < poleCount; i++) {
      const p = poleXZ(leg, i, poleCount, angleOffsetRad);
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

/** All scaffold segments (poles + brace rings) for one leg, at an optional per-leg arrangement angle offset — see `scaffoldPoleSegments`. */
export function scaffoldSegmentsForLeg(leg: LegId, height: number, angleOffsetRad = 0): Segment[] {
  return [
    ...scaffoldPoleSegments(leg, height, SCAFFOLD_POLE_COUNT, angleOffsetRad),
    ...scaffoldBraceSegments(leg, height, SCAFFOLD_POLE_COUNT, SCAFFOLD_BRACE_LEVELS, angleOffsetRad),
  ];
}

/**
 * All scaffold segments for all 4 legs, combined. `angleOffsetsByLeg`
 * (F8) lets each leg rotate its own pole ring's starting angle
 * independently — `sceneBuilder.ts` derives these from
 * `legScenario(seed, leg).propVariant`. Omitted (or any leg's value
 * omitted) defaults that leg to 0, matching the pre-F8 layout exactly —
 * this file's own "scaffold segment count…bounded" test calls this with no
 * second argument at all and must keep passing unchanged.
 */
export function allScaffoldSegments(height: number, angleOffsetsByLeg?: readonly number[]): Segment[] {
  const legs: LegId[] = [0, 1, 2, 3];
  return legs.flatMap((leg) => scaffoldSegmentsForLeg(leg, height, angleOffsetsByLeg?.[leg] ?? 0));
}

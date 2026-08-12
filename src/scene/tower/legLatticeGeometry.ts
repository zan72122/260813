/**
 * Three.js geometry for the 4 lattice-truss legs: ONE InstancedMesh per
 * leg for its structural bars (chords + rungs + diagonal braces) and one
 * for its rivet studs — 2 draw calls per leg, 8 total for the whole tower
 * — satisfying PERFORMANCE_BUDGET.md's InstancedMesh requirement for
 * repeated bars/rivets. Built per-leg (rather than one mesh for all 4)
 * specifically so each leg's InstancedMesh can be parented under that
 * leg's own moving rig Group (scene/legRig.ts) and animate with a single
 * `Group.position.y` write — no per-frame instance-matrix recompute needed.
 *
 * Deliberately material-agnostic: callers (scene/sceneBuilder.ts) inject the
 * hero "dark wrought iron" material so this module — and its geometry/
 * instance-count output — stays testable without constructing any texture
 * or WebGL context.
 */
import * as THREE from 'three';
import type { LegId } from '../../contracts/types';
import { allLegsBarSegments, allLegsRivetPoints, legAllBarSegments, legChordSegments, chordRivetPoints } from './legLatticeMath';
import { LEG_LATTICE_LEVELS } from '../layout';
import { buildBarInstancedMesh, buildPointInstancedMesh } from '../segmentInstancing';

/** Cross-section thickness (world units) of one lattice bar. */
export const LATTICE_BAR_THICKNESS = 0.34;

/** World-unit "radius" of one rivet stud (octahedron half-extent). */
export const RIVET_SCALE = 0.16;

/** Rivet studs placed along each of a leg's 4 corner chords. */
export const RIVETS_PER_CHORD = 5;

/** Unit bar geometry: a thin box authored along +Y, unit length/cross-section — scaled per-instance to span each lattice segment. */
export function createUnitBarGeometry(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/** Unit rivet-stud geometry: a small low-poly octahedron (8 tris) — cheap enough that hundreds of instances stay a rounding error against the 300k triangle budget. */
export function createUnitRivetGeometry(): THREE.OctahedronGeometry {
  return new THREE.OctahedronGeometry(1, 0);
}

export interface LatticeBuildResult {
  bars: THREE.InstancedMesh;
  rivets: THREE.InstancedMesh;
  /** Bar segment count — informational, matches `bars.count`. */
  barCount: number;
  /** Rivet stud count — informational, matches `rivets.count`. */
  rivetCount: number;
}

/** Builds one leg's lattice (bars + rivets), each as its own InstancedMesh — see module doc for why per-leg. */
export function buildLegLattice(
  leg: LegId,
  barMaterial: THREE.Material,
  rivetMaterial: THREE.Material,
  levels = LEG_LATTICE_LEVELS,
): LatticeBuildResult {
  const barGeom = createUnitBarGeometry();
  const rivetGeom = createUnitRivetGeometry();

  const segments = legAllBarSegments(leg, levels);
  const rivetPoints = legChordSegments(leg).flatMap((seg) => chordRivetPoints(seg, RIVETS_PER_CHORD));

  const bars = buildBarInstancedMesh(barGeom, barMaterial, segments, LATTICE_BAR_THICKNESS);
  bars.castShadow = true;
  bars.receiveShadow = true;

  const rivets = buildPointInstancedMesh(rivetGeom, rivetMaterial, rivetPoints, RIVET_SCALE);

  return { bars, rivets, barCount: segments.length, rivetCount: rivetPoints.length };
}

/**
 * Total bar + rivet triangle/instance counts across all 4 legs combined —
 * used by budget tests and by sceneBuilder for `renderInfo()`-style
 * accounting. Does not construct any InstancedMesh (cheap, geometry-count
 * math only via the same pure segment lists `buildLegLattice` uses).
 */
export function allLegsLatticeCounts(levels = LEG_LATTICE_LEVELS): { barCount: number; rivetCount: number } {
  return {
    barCount: allLegsBarSegments(levels).length,
    rivetCount: allLegsRivetPoints(RIVETS_PER_CHORD).length,
  };
}

/**
 * The fixed first-level girder ring: 4 giant lattice girders connecting
 * adjacent legs' top corners, floating permanently at GIRDER_RING_Y — it
 * never moves (PRODUCT_SPEC: legs travel to meet it, not the reverse).
 * Pure segment math (no Three import) + a thin Three.js builder on top,
 * mirroring tower/legLatticeMath.ts + legLatticeGeometry.ts.
 */
import * as THREE from 'three';
import type { LegId } from '../../contracts/types';
import { GIRDER_RING_Y, legTopXZ } from '../layout';
import type { Segment, Vec3 } from './legLatticeMath';
import { buildBarInstancedMesh } from '../segmentInstancing';

/** Half-width (world units) of one girder's box-lattice cross-section — deliberately thicker than a leg's own bars ("giant" girders per PRODUCT_SPEC). */
export const GIRDER_HALF_WIDTH = 1.6;

/** Cross-section thickness (world units) of one girder's structural bars. */
export const GIRDER_BAR_THICKNESS = 0.42;

/** Lengthwise lattice subdivisions per girder. */
export const GIRDER_LEVELS = 6;

const CORNER_SIGNS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function addScaled(v: Vec3, dir: Vec3, s: number): Vec3 {
  return [v[0] + dir[0] * s, v[1] + dir[1] * s, v[2] + dir[2] * s];
}
function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export interface GirderSpan {
  start: Vec3;
  end: Vec3;
}

/** The 4 girder spans (start/end world points) connecting adjacent legs' tops, in leg order (span i runs from leg i to leg (i+1)%4). */
export function girderSpans(): GirderSpan[] {
  const legs: LegId[] = [0, 1, 2, 3];
  return legs.map((leg) => {
    const a = legTopXZ(leg);
    const b = legTopXZ(((leg + 1) % 4) as LegId);
    return { start: [a.x, GIRDER_RING_Y, a.z], end: [b.x, GIRDER_RING_Y, b.z] };
  });
}

function cornerAt(span: GirderSpan, cornerIndex: number, level: number, levels: number): Vec3 {
  const dir = normalize(sub(span.end, span.start));
  const vertical: Vec3 = [0, 1, 0];
  const crossA = normalize(cross(dir, vertical)); // horizontal, perpendicular to the span
  const crossB = vertical;
  const t = levels <= 1 ? 1 : level / (levels - 1);
  const center = lerpVec3(span.start, span.end, t);
  const signs = CORNER_SIGNS[cornerIndex % 4];
  const sa = signs?.[0] ?? 1;
  const sb = signs?.[1] ?? 1;
  let p = addScaled(center, crossA, sa * GIRDER_HALF_WIDTH);
  p = addScaled(p, crossB, sb * GIRDER_HALF_WIDTH);
  return p;
}

/** One girder's chord (4) + rung + diagonal-brace segments. */
export function girderSegments(span: GirderSpan, levels = GIRDER_LEVELS): Segment[] {
  const segs: Segment[] = [];
  for (let c = 0; c < 4; c++) {
    segs.push({ a: cornerAt(span, c, 0, levels), b: cornerAt(span, c, levels - 1, levels) });
  }
  for (let level = 0; level < levels; level++) {
    const corners = [0, 1, 2, 3].map((c) => cornerAt(span, c, level, levels));
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      if (a && b) segs.push({ a, b });
    }
  }
  for (let level = 0; level < levels - 1; level++) {
    const lower = [0, 1, 2, 3].map((c) => cornerAt(span, c, level, levels));
    const upper = [0, 1, 2, 3].map((c) => cornerAt(span, c, level + 1, levels));
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

/** All 4 girders' segments, combined. */
export function allGirderSegments(levels = GIRDER_LEVELS): Segment[] {
  return girderSpans().flatMap((span) => girderSegments(span, levels));
}

/** Builds the combined 4-girder ring as a single InstancedMesh. */
export function buildGirderRing(material: THREE.Material, levels = GIRDER_LEVELS): THREE.InstancedMesh {
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const segments = allGirderSegments(levels);
  const mesh = buildBarInstancedMesh(geom, material, segments, GIRDER_BAR_THICKNESS);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

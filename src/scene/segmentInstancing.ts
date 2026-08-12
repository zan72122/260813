/**
 * Shared helper turning a list of line `Segment`s (legLatticeMath.ts /
 * girderLatticeMath.ts) into a single InstancedMesh of oriented unit bars —
 * the InstancedMesh usage PERFORMANCE_BUDGET.md mandates for repeated
 * lattice bars and rivet strips ("足場・リベットはInstancedMesh徹底").
 */
import * as THREE from 'three';
import type { Segment, Vec3 } from './tower/legLatticeMath';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Composes the local→world matrix for a unit bar (assumed authored along
 * +Y, unit length, unit cross-section) so it exactly spans `segment` with
 * the given cross-section `thickness`. Degenerate (zero-length) segments
 * fall back to an identity-oriented, zero-length instance rather than
 * producing a NaN matrix.
 */
export function segmentToMatrix(segment: Segment, thickness: number, out = new THREE.Matrix4()): THREE.Matrix4 {
  const a = new THREE.Vector3(...segment.a);
  const b = new THREE.Vector3(...segment.b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const length = dir.length();
  const quat =
    length > 1e-6
      ? new THREE.Quaternion().setFromUnitVectors(UP, dir.multiplyScalar(1 / length))
      : new THREE.Quaternion();
  return out.compose(mid, quat, new THREE.Vector3(thickness, length, thickness));
}

/** Builds a new InstancedMesh of `unitBarGeometry` (authored along +Y, unit length/cross-section), one instance per segment, oriented/scaled to span it. */
export function buildBarInstancedMesh(
  unitBarGeometry: THREE.BufferGeometry,
  material: THREE.Material,
  segments: readonly Segment[],
  thickness: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(unitBarGeometry, material, Math.max(segments.length, 1));
  const m = new THREE.Matrix4();
  segments.forEach((seg, i) => {
    segmentToMatrix(seg, thickness, m);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = segments.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Builds a new InstancedMesh of `unitGeometry` placed (uniform scale, no rotation) at each of `points`. */
export function buildPointInstancedMesh(
  unitGeometry: THREE.BufferGeometry,
  material: THREE.Material,
  points: readonly Vec3[],
  scale: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(unitGeometry, material, Math.max(points.length, 1));
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3(scale, scale, scale);
  const q = new THREE.Quaternion();
  points.forEach((p, i) => {
    m.compose(new THREE.Vector3(...p), q, s);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = points.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Total triangle count of a BufferGeometry (indexed or not). */
export function triCount(geometry: THREE.BufferGeometry): number {
  const idx = geometry.index;
  if (idx) return idx.count / 3;
  const pos = geometry.attributes.position;
  return pos ? pos.count / 3 : 0;
}

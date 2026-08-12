/**
 * Simple articulated worker silhouette — built from a handful of boxes
 * (legs, torso, arms, head) merged into ONE low-poly geometry, then
 * reused across every worker via a single InstancedMesh (PRODUCT_SPEC/
 * PERFORMANCE_BUDGET instancing rule). Purely a scale reference ("作業員が
 * シルエット規模比較"), so no rigging/animation — zero physics, parameter/
 * pose-free per PERFORMANCE_BUDGET.
 *
 * Target height ≈ 1/30 of the tower's leg height (GIRDER_RING_Y −
 * GROUND_Y = 32 world units ⇒ ≈ 1.07), per the deliverable brief, so
 * workers read as tiny next to the colossal legs.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GIRDER_RING_Y, GROUND_Y } from '../layout';

/** Documented target worker height (world units) — 1/30 of the leg height. */
export const WORKER_TARGET_HEIGHT = (GIRDER_RING_Y - GROUND_Y) / 30;

function box(w: number, h: number, d: number, cx: number, cy: number, cz: number, rz = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz !== 0) g.rotateZ(rz);
  g.translate(cx, cy, cz);
  return g;
}

/** Builds one merged humanoid-silhouette geometry, authored at roughly WORKER_TARGET_HEIGHT tall, feet at local Y=0. */
export function createWorkerGeometry(): THREE.BufferGeometry {
  const legL = box(0.13, 0.5, 0.13, -0.09, 0.25, 0, 0.05);
  const legR = box(0.13, 0.5, 0.13, 0.09, 0.25, 0, -0.05);
  const torso = box(0.32, 0.42, 0.18, 0, 0.71, 0);
  const armL = box(0.1, 0.38, 0.1, -0.25, 0.68, 0, 0.35);
  const armR = box(0.1, 0.38, 0.1, 0.25, 0.68, 0, -0.35);
  const head = box(0.2, 0.2, 0.2, 0, 1.02, 0);

  return mergeGeometries([legL, legR, torso, armL, armR, head], false);
}

/** Per-instance placement for a worker at world XZ `pos`, facing `yawRad`, with a small height jitter for naturalism. */
export interface WorkerPlacement {
  x: number;
  z: number;
  yawRad: number;
  scale: number;
}

/** Builds the InstancedMesh for all worker placements, sharing one merged geometry. */
export function buildWorkerInstances(material: THREE.Material, placements: readonly WorkerPlacement[]): THREE.InstancedMesh {
  const geometry = createWorkerGeometry();
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(placements.length, 1));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((p, i) => {
    q.setFromAxisAngle(up, p.yawRad);
    m.compose(new THREE.Vector3(p.x, GROUND_Y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = placements.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

/**
 * Small shared geometry helpers: orienting a unit strut (box/cylinder
 * authored along local +Y) to span two world points. Used by the lattice
 * leg's instanced struts and by the carrier/cabin parallelogram linkage
 * bars alike.
 */

import * as THREE from 'three';

const UP_Y = new THREE.Vector3(0, 1, 0);

/** Compose a unit (1x1x1, centered, authored along +Y) strut's matrix spanning `a` -> `b` into `out`. */
export function computeStrutMatrix(a: THREE.Vector3, b: THREE.Vector3, thickness: number, out: THREE.Matrix4): void {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const length = Math.max(dir.length(), 1e-6);
  dir.normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_Y, dir);
  out.compose(mid, quat, new THREE.Vector3(thickness, length, thickness));
}

/** Orient a real Object3D (mesh authored as a unit +Y strut) to span `a` -> `b`. */
export function orientSegmentObject(
  object: THREE.Object3D & { scale: THREE.Vector3 },
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness: number,
): void {
  const dir = b.clone().sub(a);
  const length = Math.max(dir.length(), 1e-6);
  dir.normalize();
  object.position.copy(a).add(b).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(UP_Y, dir);
  object.scale.set(thickness, length, thickness);
}

/** Rotate `(x, y)` by `angleRad` about the Z axis (2D rotation used throughout the travel plane). */
export function rotate2D(x: number, y: number, angleRad: number): readonly [number, number] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return [x * c - y * s, x * s + y * c];
}

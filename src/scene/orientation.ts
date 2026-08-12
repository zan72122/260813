/**
 * The carrier/cabin quaternion composition (MATH_CONTRACT §3), factored out
 * of `carrierCabin.ts` so it is directly unit-testable without building any
 * meshes: `q_carrier = axisAngle(+Z, carrierAngleRad)`,
 * `q_cabin_local = axisAngle(+Z, -carrierAngleRad + errorRad)`, and their
 * composition's world rotation about +Z must equal `errorRad` for every
 * input (the carrier's tilt and the cabin's counter-tilt cancel by
 * construction).
 */

import * as THREE from 'three';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** `q_carrier = Quaternion.setFromAxisAngle(+Z, carrierAngleRad)` — MATH_CONTRACT §3. */
export function carrierQuaternion(carrierAngleRad: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(Z_AXIS, carrierAngleRad);
}

/** `q_cabin_local = Quaternion.setFromAxisAngle(+Z, -carrierAngleRad + errorRad)` — MATH_CONTRACT §3. */
export function cabinLocalQuaternion(carrierAngleRad: number, errorRad: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -carrierAngleRad + errorRad);
}

/** Signed rotation about +Z (radians) a quaternion represents, assuming it is a pure Z-axis rotation. */
export function zRotationOf(q: THREE.Quaternion): number {
  // For a pure +Z-axis rotation, q = (0, 0, sin(a/2), cos(a/2)).
  return 2 * Math.atan2(q.z, q.w);
}

/**
 * Compose the carrier's world quaternion with the cabin's local quaternion
 * (as three.js actually would via parent/child transforms) and return the
 * resulting world rotation about +Z, radians. Used both by
 * `carrierCabin.ts` (to sanity-check itself is unnecessary at runtime --
 * the sim already guarantees this identity) and directly by
 * `tests/unit/render/**` to prove the composition is correct.
 */
export function composedWorldTiltRad(carrierAngleRad: number, errorRad: number): number {
  const carrier = carrierQuaternion(carrierAngleRad);
  const cabinLocal = cabinLocalQuaternion(carrierAngleRad, errorRad);
  const world = carrier.clone().multiply(cabinLocal);
  return zRotationOf(world);
}

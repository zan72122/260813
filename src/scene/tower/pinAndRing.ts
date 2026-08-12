/**
 * The alignment pin (mounted on each leg's top, travels with it) and the
 * target ring (mounted at the fixed girder end the pin must enter) —
 * PRODUCT_SPEC's "誇張されたalignment pin" + "半透明target ring". Kept
 * deliberately exaggerated in scale relative to the leg's own cross-section
 * so the gap between them reads clearly even at establish distance.
 */
import * as THREE from 'three';
import type { LegId } from '../../contracts/types';
import { GIRDER_RING_Y, legTopXZ } from '../layout';

/** Pin total height (world units) — spike + collar. */
export const PIN_HEIGHT = 2.6;
export const PIN_RADIUS = 0.58;
export const PIN_RADIAL_SEGMENTS = 10;

export const TARGET_RING_RADIUS = 1.05;
export const TARGET_RING_TUBE = 0.14;
export const TARGET_RING_RADIAL_SEGMENTS = 8;
export const TARGET_RING_TUBULAR_SEGMENTS = 16;

/** Cone-shaped alignment-pin geometry, apex up, base at local origin. */
export function createPinGeometry(): THREE.ConeGeometry {
  const g = new THREE.ConeGeometry(PIN_RADIUS, PIN_HEIGHT, PIN_RADIAL_SEGMENTS);
  g.translate(0, PIN_HEIGHT / 2, 0); // base sits at local Y=0 instead of centered
  return g;
}

/** Torus target-ring geometry, laid flat (hole facing +Y) so a pin can pass through it vertically. */
export function createTargetRingGeometry(): THREE.TorusGeometry {
  const g = new THREE.TorusGeometry(TARGET_RING_RADIUS, TARGET_RING_TUBE, TARGET_RING_RADIAL_SEGMENTS, TARGET_RING_TUBULAR_SEGMENTS);
  g.rotateX(Math.PI / 2);
  return g;
}

/** World-space anchor for leg `leg`'s pin at legOffsetY=0 (i.e. its resting/local position before the per-frame vertical offset is applied by the leg rig group). */
export function pinRestPosition(leg: LegId): THREE.Vector3 {
  const xz = legTopXZ(leg);
  return new THREE.Vector3(xz.x, GIRDER_RING_Y, xz.z);
}

/** World-space (fixed, never moves) position of leg `leg`'s target ring, at its girder end. */
export function targetRingPosition(leg: LegId): THREE.Vector3 {
  const xz = legTopXZ(leg);
  return new THREE.Vector3(xz.x, GIRDER_RING_Y, xz.z);
}

export interface PinAndRing {
  pin: THREE.Mesh;
  ring: THREE.Mesh;
}

/** Builds one leg's pin + target ring meshes, each with its OWN material instance (a clone of the shared template) so per-leg emissive glow (alignmentError-driven) can be set independently. */
export function buildPinAndRing(
  leg: LegId,
  pinMaterialTemplate: THREE.MeshStandardMaterial,
  ringMaterialTemplate: THREE.MeshStandardMaterial,
): PinAndRing {
  const pin = new THREE.Mesh(createPinGeometry(), pinMaterialTemplate.clone());
  pin.position.copy(pinRestPosition(leg));
  pin.castShadow = true;

  const ring = new THREE.Mesh(createTargetRingGeometry(), ringMaterialTemplate.clone());
  ring.position.copy(targetRingPosition(leg));

  return { pin, ring };
}

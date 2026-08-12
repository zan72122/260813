/**
 * The permanent wedge + its slot, and the hammer that seats it — mounted
 * at leg `leg`'s FIXED top junction (targetRingPosition), not on the
 * moving leg rig: by the time the wedge phase begins the leg has already
 * snapped to legOffsetY=0 (contracts/legModel.ts `snap`), so the junction
 * itself is at rest for the remainder of that leg's sequence.
 */
import * as THREE from 'three';
import type { LegId } from '../../contracts/types';
import { legOutwardYawRadians } from '../layout';
import { targetRingPosition } from './pinAndRing';
import { createWedgeGeometry } from '../props/wedgeGeometry';
import type { HeroMaterials } from '../../render/materials';

const WEDGE_WIDTH = 0.55;
const WEDGE_HEIGHT = 0.65;
const WEDGE_LENGTH = 1.25;

export interface WedgeAndHammer {
  /** Fixed group (added directly to the scene) at leg `leg`'s junction. */
  group: THREE.Group;
  /** Position lerps from `wedgeRestLocal` to `wedgeInsertedLocal` as wedgeProgress 0→1. HandleId 'wedge' anchor. */
  wedge: THREE.Object3D;
  wedgeRestLocal: THREE.Vector3;
  wedgeInsertedLocal: THREE.Vector3;
  /** HandleId 'hammer' anchor; also the node a brief strike animation (on 'hammered') tweens. */
  hammer: THREE.Object3D;
  hammerRestRotationX: number;
}

export function buildWedgeAndHammer(leg: LegId, materials: HeroMaterials): WedgeAndHammer {
  const group = new THREE.Group();
  const anchor = targetRingPosition(leg);
  group.position.copy(anchor);
  group.rotation.y = legOutwardYawRadians(leg);

  // The slot the wedge drives into: a dark recessed box just outboard of the ring.
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(WEDGE_WIDTH + 0.15, WEDGE_HEIGHT * 0.4, WEDGE_LENGTH + 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0f0b08, roughness: 0.9 }),
  );
  slot.position.set(0, -0.1, 0.35);
  group.add(slot);

  const wedge = new THREE.Mesh(createWedgeGeometry(WEDGE_WIDTH, WEDGE_HEIGHT, WEDGE_LENGTH), materials.forgedWedge);
  const wedgeRestLocal = new THREE.Vector3(0, 0.9, 0.9);
  const wedgeInsertedLocal = new THREE.Vector3(0, 0, 0.35);
  wedge.position.copy(wedgeRestLocal);
  wedge.rotation.x = Math.PI; // tip (authored at -Z) points toward the slot when driven in from above/outboard
  wedge.castShadow = true;
  group.add(wedge);

  // Hammer: cylindrical handle + box head, resting beside the wedge, ready to swing.
  const hammer = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), materials.wood);
  handle.position.set(0, 0.55, 0);
  hammer.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.24), materials.hammer);
  head.position.set(0, 1.05, 0);
  hammer.add(head);
  hammer.position.set(0.85, 0.3, 1.1);
  hammer.rotation.z = -0.4;
  group.add(hammer);

  return { group, wedge, wedgeRestLocal, wedgeInsertedLocal, hammer, hammerRestRotationX: hammer.rotation.x };
}

/** Lerps the wedge's local position from rest to inserted for a given wedgeProgress (0..1). */
export function wedgeLocalPositionForProgress(rig: WedgeAndHammer, progress: number): THREE.Vector3 {
  const t = Math.min(1, Math.max(0, progress));
  return rig.wedgeRestLocal.clone().lerp(rig.wedgeInsertedLocal, t);
}

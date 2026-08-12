/**
 * The signature mechanism: the carrier (rigid truck, tilts with the track)
 * and the passenger cabin mounted on it through a visible parallelogram
 * linkage, counter-rotating so its floor stays level
 * (MATH_CONTRACT §3, HISTORICAL_NOTES "Carrier vs passenger cabin").
 *
 * `carrierGroup`'s own quaternion/position IS the sim's authority — this
 * module only ever reads `arcLength`, `carrierAngleDeg` and
 * `cabinTiltErrorDeg` off the snapshot and turns them into transforms; it
 * never computes leveling itself.
 */

import * as THREE from 'three';

import type { GameSnapshot } from '../contracts/store.ts';
import { trackPoint } from '../game/track.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import { RAIL_GAUGE_HALF } from './trackCorridor.ts';
import { orientSegmentObject, rotate2D } from './geomUtils.ts';
import { cabinLocalQuaternion, carrierQuaternion } from './orientation.ts';

const DEG2RAD = Math.PI / 180;

/** Cabin offset from the carrier's local origin (toward the open corridor / viewer side). */
const CABIN_OFFSET = new THREE.Vector3(2.05, 0.25, 0);
/** Cabin interior half-extents (floor footprint), meters — exported for the interior rig. */
export const CABIN_FLOOR_HALF_EXTENTS = { x: 0.85, z: 0.85 } as const;
export const CABIN_INTERIOR_HEIGHT = 2.1;

const CHASSIS_SIZE = new THREE.Vector3(1.15, 3.3, RAIL_GAUGE_HALF * 2 + 0.5);
const WHEEL_RADIUS = 0.34;

const LINKAGE_CARRIER_ANCHORS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0.55, 1.05, RAIL_GAUGE_HALF + 0.35),
  new THREE.Vector3(0.55, -1.05, RAIL_GAUGE_HALF + 0.35),
  new THREE.Vector3(0.55, 1.05, -(RAIL_GAUGE_HALF + 0.35)),
  new THREE.Vector3(0.55, -1.05, -(RAIL_GAUGE_HALF + 0.35)),
];
/** Matching anchors in cabin-local space (before the cabin's own counter-rotation). */
const LINKAGE_CABIN_ANCHORS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.95, 0.75, RAIL_GAUGE_HALF + 0.35),
  new THREE.Vector3(-0.95, -0.75, RAIL_GAUGE_HALF + 0.35),
  new THREE.Vector3(-0.95, 0.75, -(RAIL_GAUGE_HALF + 0.35)),
  new THREE.Vector3(-0.95, -0.75, -(RAIL_GAUGE_HALF + 0.35)),
];

export interface CarrierCabinResult {
  readonly carrierGroup: THREE.Group;
  readonly cabinGroup: THREE.Group;
  update(snapshot: GameSnapshot): void;
}

function buildChassis(materials: MaterialLibrary, registry: DisposeRegistry): THREE.Group {
  const group = new THREE.Group();
  const frameGeometry = registry.track(
    new THREE.BoxGeometry(CHASSIS_SIZE.x, CHASSIS_SIZE.y, CHASSIS_SIZE.z),
  );
  const frame = new THREE.Mesh(frameGeometry, materials.linkage);
  frame.castShadow = true;
  group.add(frame);

  // Instanced guide wheels -- one draw call for all four corners.
  const wheelGeometry = registry.track(new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 14));
  const wheelOffsets: readonly (readonly [number, number])[] = [
    [-1.35, -RAIL_GAUGE_HALF],
    [-1.35, RAIL_GAUGE_HALF],
    [1.35, -RAIL_GAUGE_HALF],
    [1.35, RAIL_GAUGE_HALF],
  ];
  const wheels = new THREE.InstancedMesh(wheelGeometry, materials.blackIron, wheelOffsets.length);
  const wheelMatrix = new THREE.Matrix4();
  const wheelQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  wheelOffsets.forEach(([y, z], i) => {
    wheelMatrix.compose(new THREE.Vector3(0, y, z), wheelQuat, new THREE.Vector3(1, 1, 1));
    wheels.setMatrixAt(i, wheelMatrix);
  });
  wheels.instanceMatrix.needsUpdate = true;
  group.add(wheels);
  return group;
}

function buildCabin(materials: MaterialLibrary, registry: DisposeRegistry): THREE.Group {
  const group = new THREE.Group();
  const hw = CABIN_FLOOR_HALF_EXTENTS.x;
  const hd = CABIN_FLOOR_HALF_EXTENTS.z;
  const h = CABIN_INTERIOR_HEIGHT;

  const shellGeometry = registry.track(new THREE.BoxGeometry(hw * 2 + 0.16, h, hd * 2 + 0.16));
  const shell = new THREE.Mesh(shellGeometry, materials.cabin);
  shell.position.y = h / 2;
  shell.castShadow = true;
  group.add(shell);

  const roofGeometry = registry.track(new THREE.BoxGeometry(hw * 2 + 0.3, 0.14, hd * 2 + 0.3));
  const roof = new THREE.Mesh(roofGeometry, materials.ironLit);
  roof.position.y = h + 0.07;
  group.add(roof);

  // Big friendly windows -- the cabin's share of the ONE glass family besides the sight-glass.
  const frontWindowGeometry = registry.track(new THREE.PlaneGeometry(hd * 1.5, h * 0.55));
  const frontWindow = new THREE.Mesh(frontWindowGeometry, materials.glass);
  frontWindow.rotation.y = Math.PI / 2;
  frontWindow.position.set(hw + 0.001, h * 0.56, 0);
  group.add(frontWindow);

  const sideWindowGeometry = registry.track(new THREE.PlaneGeometry(hw * 1.3, h * 0.5));
  for (const side of [-1, 1] as const) {
    const sideWindow = new THREE.Mesh(sideWindowGeometry, materials.glass);
    sideWindow.position.set(0, h * 0.55, side * (hd + 0.001));
    if (side < 0) sideWindow.rotation.y = Math.PI;
    group.add(sideWindow);
  }

  return group;
}

export function buildCarrierCabin(materials: MaterialLibrary, registry: DisposeRegistry): CarrierCabinResult {
  const carrierGroup = new THREE.Group();
  carrierGroup.name = 'carrier';
  carrierGroup.add(buildChassis(materials, registry));

  const cabinGroup = new THREE.Group();
  cabinGroup.name = 'cabin';
  cabinGroup.position.copy(CABIN_OFFSET);
  cabinGroup.add(buildCabin(materials, registry));
  carrierGroup.add(cabinGroup);

  const linkageGeometry = registry.track(new THREE.BoxGeometry(1, 1, 1));
  const linkageBars = LINKAGE_CARRIER_ANCHORS.map(() => {
    const bar = new THREE.Mesh(linkageGeometry, materials.linkage);
    carrierGroup.add(bar);
    return bar;
  });

  function update(snapshot: GameSnapshot): void {
    const [x, y] = trackPoint(snapshot.arcLength);
    carrierGroup.position.set(x, y, 0);
    const carrierAngleRad = snapshot.carrierAngleDeg * DEG2RAD;
    const errorRad = snapshot.cabinTiltErrorDeg * DEG2RAD;
    carrierGroup.quaternion.copy(carrierQuaternion(carrierAngleRad));
    cabinGroup.quaternion.copy(cabinLocalQuaternion(carrierAngleRad, errorRad));
    const cabinLocalAngleRad = -carrierAngleRad + errorRad;

    for (let i = 0; i < linkageBars.length; i += 1) {
      const carrierAnchor = LINKAGE_CARRIER_ANCHORS[i]!;
      const cabinAnchorLocal = LINKAGE_CABIN_ANCHORS[i]!;
      const [rx, ry] = rotate2D(cabinAnchorLocal.x, cabinAnchorLocal.y, cabinLocalAngleRad);
      const cabinAnchorInCarrierSpace = new THREE.Vector3(
        CABIN_OFFSET.x + rx,
        CABIN_OFFSET.y + ry,
        cabinAnchorLocal.z,
      );
      orientSegmentObject(linkageBars[i]!, carrierAnchor, cabinAnchorInCarrierSpace, 0.11);
    }
  }

  return { carrierGroup, cabinGroup, update };
}

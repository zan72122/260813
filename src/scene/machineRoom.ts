/**
 * The underground machine room: two horizontal hydraulic pistons, the
 * sheave carriage they push, a big water accumulator tank with a teal
 * sight-glass, the master-lever pedestal, and the BIG hero pulley. All
 * dynamic parts are driven purely from `GameSnapshot` fields per
 * MATH_CONTRACT §2 — this module only turns numbers into transforms.
 */

import * as THREE from 'three';

import { PISTON_STROKE, PULLEY_RADIUS } from '../contracts/constants.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import { MACHINE_ROOM_BOUNDS } from './cutawayEarth.ts';

/** Visual (not physical) rod travel each piston shows at p === PISTON_STROKE, meters. */
const PISTON_VISUAL_STROKE = 5.2;
const PISTON_BODY_LENGTH = 3.6;
const PISTON_Z_OFFSETS = [-2.4, 2.4] as const;
const PISTON_Y = MACHINE_ROOM_BOUNDS.yBottom + 1.35;
const PISTON_BASE_X = MACHINE_ROOM_BOUNDS.xMin + 1.4;

/** Big hero pulley: visually scaled up from PULLEY_RADIUS for drama, rotation stays physical. */
const PULLEY_VISUAL_SCALE = 2.1;
const PULLEY_CENTER = new THREE.Vector3(
  MACHINE_ROOM_BOUNDS.xMax - 3.4,
  MACHINE_ROOM_BOUNDS.yBottom + 4.6,
  0,
);

// Z < 0 is the earth cutaway's OPEN face (see cutawayEarth.ts); Z > 0 is the solid back
// wall. The lever sits close to the open side so it reads "foreground-adjacent" per
// CAMERA_CONTRACT's `underground` cue, without blocking the pistons behind it.
const ACCUMULATOR_CENTER = new THREE.Vector3(MACHINE_ROOM_BOUNDS.xMin + 2.4, MACHINE_ROOM_BOUNDS.yBottom + 3.2, 4.4);
const LEVER_BASE = new THREE.Vector3(1.6, MACHINE_ROOM_BOUNDS.yBottom, -4.6);

export interface MachineRoomResult {
  readonly group: THREE.Group;
  readonly pulleyCenter: THREE.Vector3;
  readonly leverBase: THREE.Vector3;
  readonly exitPoint: THREE.Vector3;
  readonly carriage: THREE.Group;
  readonly pulleyRadiusVisual: number;
  update(snapshot: GameSnapshot): void;
}

function buildPiston(
  zOffset: number,
  materials: MaterialLibrary,
  registry: DisposeRegistry,
): { group: THREE.Group; rod: THREE.Mesh } {
  const group = new THREE.Group();

  const bodyGeometry = registry.track(new THREE.CylinderGeometry(0.62, 0.62, PISTON_BODY_LENGTH, 16));
  const body = new THREE.Mesh(bodyGeometry, materials.blackIron);
  body.rotation.z = Math.PI / 2;
  body.position.set(PISTON_BASE_X + PISTON_BODY_LENGTH / 2, PISTON_Y, zOffset);
  group.add(body);

  const collarGeometry = registry.track(new THREE.TorusGeometry(0.66, 0.09, 10, 20));
  const collar = new THREE.Mesh(collarGeometry, materials.brass);
  collar.rotation.y = Math.PI / 2;
  collar.position.set(PISTON_BASE_X + PISTON_BODY_LENGTH, PISTON_Y, zOffset);
  group.add(collar);

  const rodGeometry = registry.track(new THREE.CylinderGeometry(0.22, 0.22, 1, 12));
  const rod = new THREE.Mesh(rodGeometry, materials.brass);
  rod.rotation.z = Math.PI / 2;
  rod.position.set(PISTON_BASE_X + PISTON_BODY_LENGTH, PISTON_Y, zOffset);
  group.add(rod);

  return { group, rod };
}

function buildAccumulator(materials: MaterialLibrary, registry: DisposeRegistry): THREE.Group {
  const group = new THREE.Group();
  const tankGeometry = registry.track(new THREE.CylinderGeometry(1.3, 1.3, 4.6, 20));
  const tank = new THREE.Mesh(tankGeometry, materials.blackIron);
  tank.position.copy(ACCUMULATOR_CENTER);
  group.add(tank);

  const capTopGeometry = registry.track(new THREE.SphereGeometry(1.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  const capTop = new THREE.Mesh(capTopGeometry, materials.blackIron);
  capTop.position.set(ACCUMULATOR_CENTER.x, ACCUMULATOR_CENTER.y + 2.3, ACCUMULATOR_CENTER.z);
  group.add(capTop);

  // Instanced bands -- one draw call for all three brass rings.
  const bandGeometry = registry.track(new THREE.TorusGeometry(1.32, 0.08, 8, 24));
  const bandOffsets = [-1.6, 0, 1.6];
  const bands = new THREE.InstancedMesh(bandGeometry, materials.brass, bandOffsets.length);
  const bandMatrix = new THREE.Matrix4();
  const bandQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  bandOffsets.forEach((dy, i) => {
    bandMatrix.compose(
      new THREE.Vector3(ACCUMULATOR_CENTER.x, ACCUMULATOR_CENTER.y + dy, ACCUMULATOR_CENTER.z),
      bandQuat,
      new THREE.Vector3(1, 1, 1),
    );
    bands.setMatrixAt(i, bandMatrix);
  });
  bands.instanceMatrix.needsUpdate = true;
  group.add(bands);

  // Sight-glass: the ONE additional small glass surface (VISUAL_ACCEPTANCE hero material 5).
  const glassGeometry = registry.track(new THREE.CylinderGeometry(0.16, 0.16, 3.6, 12, 1, true));
  const glass = new THREE.Mesh(glassGeometry, materials.glass);
  glass.position.set(ACCUMULATOR_CENTER.x + 1.55, ACCUMULATOR_CENTER.y, ACCUMULATOR_CENTER.z);
  group.add(glass);

  const waterGeometry = registry.track(new THREE.CylinderGeometry(0.12, 0.12, 1, 10));
  const water = new THREE.Mesh(waterGeometry, materials.water);
  water.position.set(ACCUMULATOR_CENTER.x + 1.55, ACCUMULATOR_CENTER.y - 1.3, ACCUMULATOR_CENTER.z);
  group.add(water);

  return group;
}

function buildLeverPedestal(materials: MaterialLibrary, registry: DisposeRegistry): { group: THREE.Group; handle: THREE.Mesh } {
  const group = new THREE.Group();
  const baseGeometry = registry.track(new THREE.BoxGeometry(1.1, 0.5, 1.1));
  const base = new THREE.Mesh(baseGeometry, materials.blackIron);
  base.position.set(LEVER_BASE.x, LEVER_BASE.y + 0.25, LEVER_BASE.z);
  group.add(base);

  const slotGeometry = registry.track(new THREE.BoxGeometry(0.14, 1.5, 0.3));
  const slot = new THREE.Mesh(slotGeometry, materials.ironLit);
  slot.position.set(LEVER_BASE.x, LEVER_BASE.y + 1.3, LEVER_BASE.z);
  group.add(slot);

  const handleGeometry = registry.track(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12));
  const handle = new THREE.Mesh(handleGeometry, materials.brass);
  handle.rotation.z = Math.PI / 2;
  handle.position.set(LEVER_BASE.x, LEVER_BASE.y + 0.7, LEVER_BASE.z);
  group.add(handle);

  return { group, handle };
}

function buildPulley(materials: MaterialLibrary, registry: DisposeRegistry): { group: THREE.Group; wheel: THREE.Group } {
  const group = new THREE.Group();
  // Instanced support posts -- one draw call for both sides of the frame.
  const frameGeometry = registry.track(new THREE.BoxGeometry(0.3, 5.1, 0.3));
  const postOffsets = [-0.9, 0.9];
  const posts = new THREE.InstancedMesh(frameGeometry, materials.iron, postOffsets.length);
  const postMatrix = new THREE.Matrix4();
  postOffsets.forEach((dz, i) => {
    postMatrix.makeTranslation(PULLEY_CENTER.x, PULLEY_CENTER.y, dz);
    posts.setMatrixAt(i, postMatrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  const wheel = new THREE.Group();
  const rimGeometry = registry.track(
    new THREE.TorusGeometry(PULLEY_RADIUS * PULLEY_VISUAL_SCALE, 0.22, 12, 32),
  );
  const rim = new THREE.Mesh(rimGeometry, materials.blackIron);
  wheel.add(rim);
  const hubGeometry = registry.track(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 16));
  const hub = new THREE.Mesh(hubGeometry, materials.brass);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  // Instanced spokes -- one draw call for all three.
  const spokeGeometry = registry.track(new THREE.BoxGeometry(PULLEY_RADIUS * PULLEY_VISUAL_SCALE * 2 - 0.3, 0.12, 0.12));
  const spokeAngles = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const spokes = new THREE.InstancedMesh(spokeGeometry, materials.brass, spokeAngles.length);
  const spokeMatrix = new THREE.Matrix4();
  const spokeQuat = new THREE.Quaternion();
  spokeAngles.forEach((angle, i) => {
    spokeQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    spokeMatrix.compose(new THREE.Vector3(0, 0, 0), spokeQuat, new THREE.Vector3(1, 1, 1));
    spokes.setMatrixAt(i, spokeMatrix);
  });
  spokes.instanceMatrix.needsUpdate = true;
  wheel.add(spokes);
  wheel.position.copy(PULLEY_CENTER);
  group.add(wheel);

  return { group, wheel };
}

function buildSheaveCarriage(materials: MaterialLibrary, registry: DisposeRegistry): THREE.Group {
  const group = new THREE.Group();
  const frameGeometry = registry.track(new THREE.BoxGeometry(0.9, 1.5, 3.4));
  const frame = new THREE.Mesh(frameGeometry, materials.ironLit);
  group.add(frame);
  const sheaveGeometry = registry.track(new THREE.TorusGeometry(0.5, 0.12, 8, 20));
  for (const z of [-1.2, 1.2]) {
    const sheave = new THREE.Mesh(sheaveGeometry, materials.brass);
    sheave.position.set(0, 0, z);
    group.add(sheave);
  }
  return group;
}

export function buildMachineRoom(materials: MaterialLibrary, registry: DisposeRegistry): MachineRoomResult {
  const group = new THREE.Group();
  group.name = 'machineRoom';

  const pistons = PISTON_Z_OFFSETS.map((z) => buildPiston(z, materials, registry));
  for (const p of pistons) group.add(p.group);

  const carriage = buildSheaveCarriage(materials, registry);
  group.add(carriage);

  group.add(buildAccumulator(materials, registry));

  const lever = buildLeverPedestal(materials, registry);
  group.add(lever.group);

  const pulley = buildPulley(materials, registry);
  group.add(pulley.group);

  const exitPoint = new THREE.Vector3(0, 0.4, 0);

  function update(snapshot: GameSnapshot): void {
    const fraction = Math.min(1, Math.max(0, snapshot.pistonDisplacement / PISTON_STROKE));
    const rodLength = 0.3 + fraction * PISTON_VISUAL_STROKE;
    for (const piston of pistons) {
      piston.rod.scale.y = rodLength;
      piston.rod.position.x = PISTON_BASE_X + PISTON_BODY_LENGTH + rodLength / 2;
    }
    const carriageX = PISTON_BASE_X + PISTON_BODY_LENGTH + 0.3 + fraction * PISTON_VISUAL_STROKE;
    carriage.position.set(carriageX, PISTON_Y, 0);

    const angle = -(snapshot.cableTravel / PULLEY_RADIUS);
    pulley.wheel.rotation.z = angle;

    // Lever handle rides the slot, tracking valve openness.
    lever.handle.position.y = LEVER_BASE.y + 0.55 + snapshot.valveOpen * 1.05;
  }

  return {
    group,
    pulleyCenter: PULLEY_CENTER.clone(),
    leverBase: LEVER_BASE.clone(),
    exitPoint,
    carriage,
    pulleyRadiusVisual: PULLEY_RADIUS * PULLEY_VISUAL_SCALE,
    update,
  };
}

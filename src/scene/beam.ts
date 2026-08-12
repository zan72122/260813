// src/scene/beam.ts
// The single iron beam under construction: real beam (carried by the crane
// hook, following hoist/align state), its translucent ghost silhouette (the
// "place it here" target), two exaggerated temporary bolts + holes, driven
// entirely by GameState (no local simulation beyond a bolt seat-progress
// lerp and a gentle ghost pulse, since booleans in state don't carry a
// continuous animation value of their own).

import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  RingGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEAM_LENGTH, BEAM_WIDTH, beamProfileFor, type BeamProfile } from './beamShapes';
import type { MaterialSet } from '../visual/materials';
import type { BeamShape } from '../contracts/types';

function buildBeamGeometry(profile: BeamProfile) {
  const memberGeoms = profile.members.map((m) => {
    const dx = m.bx - m.ax;
    const dy = m.by - m.ay;
    const len = Math.hypot(dx, dy) || 0.001;
    const geo = new BoxGeometry(len, m.thickness, m.thickness);
    geo.translate(len / 2, 0, 0);
    const angle = Math.atan2(dy, dx);
    geo.rotateZ(angle);
    geo.translate(m.ax, m.ay, 0);
    return geo;
  });
  const merged = mergeGeometries(memberGeoms, false);
  memberGeoms.forEach((g) => g.dispose());
  return merged;
}

const dummy = new Object3D();

function buildRivetInstances(profile: BeamProfile, material: MeshStandardMaterial): InstancedMesh {
  const geo = new CylinderGeometry(0.045, 0.045, 0.05, 6);
  geo.rotateX(Math.PI / 2);
  const mesh = new InstancedMesh(geo, material, Math.max(1, profile.rivets.length));
  profile.rivets.forEach((r, i) => {
    dummy.position.set(r.x, r.y, 0.045);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = profile.rivets.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export interface BeamRig {
  /** Real beam (carried/placed) group, positioned by update(). */
  group: Group;
  /** Ghost silhouette group, positioned once per level/shape at the receiving slot. */
  ghostGroup: Group;
  boltGroup: Group;
  setShape(shape: BeamShape): void;
  /** Position the ghost + bolt holes at the tower's receiving slot for this level. */
  placeSlot(slotPos: Vector3, slotNormalAngle: number): void;
  /** Beam pose: world position + a yaw so its long axis reads toward the slot. */
  setBeamPose(pos: Vector3, yaw: number, pitch: number): void;
  setGhostPulse(scale: number, opacity: number): void;
  setBoltSeat(index: 0 | 1, seatT: number): void;
  holePositions: Vector3[];
  boltRestPositions: Vector3[];
  boltCurrentPosition(index: 0 | 1): Vector3;
  rivetHolePosition: Vector3;
  slotAttachPosition: Vector3;
  dispose(): void;
}

export function createBeamRig(materials: MaterialSet): BeamRig {
  const group = new Group();
  group.name = 'beam';
  const ghostGroup = new Group();
  ghostGroup.name = 'beamGhost';
  const boltGroup = new Group();
  boltGroup.name = 'bolts';

  let beamMesh: Mesh | null = null;
  let rivetMesh: InstancedMesh | null = null;
  let ghostMesh: Mesh | null = null;
  let currentShape: BeamShape | null = null;

  function buildForShape(shape: BeamShape): void {
    if (currentShape === shape) return;
    currentShape = shape;
    const profile = beamProfileFor(shape);

    if (beamMesh) {
      group.remove(beamMesh);
      beamMesh.geometry.dispose();
    }
    if (rivetMesh) {
      group.remove(rivetMesh);
      rivetMesh.geometry.dispose();
    }
    if (ghostMesh) {
      ghostGroup.remove(ghostMesh);
      ghostMesh.geometry.dispose();
    }

    const geo = buildBeamGeometry(profile);
    geo.translate(-BEAM_LENGTH / 2, 0, 0); // center the beam on its own origin
    beamMesh = new Mesh(geo, materials.iron);
    group.add(beamMesh);

    rivetMesh = buildRivetInstances(profile, materials.brass);
    rivetMesh.geometry.translate(-BEAM_LENGTH / 2, 0, 0);
    group.add(rivetMesh);

    const ghostGeo = geo.clone();
    ghostMesh = new Mesh(ghostGeo, materials.ghost);
    ghostGroup.add(ghostMesh);
  }

  // ---- bolts + holes -------------------------------------------------------
  const boltGeo = new CylinderGeometry(0.16, 0.16, 0.22, 8);
  const boltHeadGeo = new CylinderGeometry(0.24, 0.24, 0.08, 6);
  const boltMesh = new InstancedMesh(boltGeo, materials.brass, 2);
  const boltHeadMesh = new InstancedMesh(boltHeadGeo, materials.brass, 2);
  boltMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  boltHeadMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  boltMesh.count = 2;
  boltHeadMesh.count = 2;
  boltGroup.add(boltMesh, boltHeadMesh);

  const holeGeo = new RingGeometry(0.14, 0.2, 12);
  const holeMaterial = new MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9, side: DoubleSide });
  const holeMesh = new InstancedMesh(holeGeo, holeMaterial, 2);
  holeMesh.count = 2;
  boltGroup.add(holeMesh);

  const holeLocalOffsets: [Vector3, Vector3] = [
    new Vector3(-BEAM_LENGTH * 0.28, BEAM_WIDTH * 0.32, 0.05),
    new Vector3(BEAM_LENGTH * 0.28, BEAM_WIDTH * 0.32, 0.05),
  ];
  const boltRestLocalOffsets: [Vector3, Vector3] = [
    new Vector3(-1.4, -0.4, 0.6),
    new Vector3(-1.1, -0.4, 0.6),
  ];

  let slotWorld = new Vector3();
  let slotAngle = 0;
  const holeWorld: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  const boltRestWorld: [Vector3, Vector3] = [new Vector3(), new Vector3()];
  const boltSeat: [number, number] = [0, 0];
  const rivetHoleWorld = new Vector3();
  const slotAttachWorld = new Vector3();
  const rivetHoleLocal = new Vector3(0, -BEAM_WIDTH * 0.1, 0.05);
  const slotAttachLocal = new Vector3(0, BEAM_WIDTH * 0.9, 0);

  function refreshBoltsAndHoles(): void {
    const cosA = Math.cos(slotAngle);
    const sinA = Math.sin(slotAngle);
    for (let i = 0; i < 2; i += 1) {
      const local = holeLocalOffsets[i]!;
      const wx = slotWorld.x + local.x * cosA - local.z * sinA;
      const wz = slotWorld.z + local.x * sinA + local.z * cosA;
      holeWorld[i]!.set(wx, slotWorld.y + local.y, wz);

      const restLocal = boltRestLocalOffsets[i]!;
      const rwx = slotWorld.x + restLocal.x * cosA - restLocal.z * sinA;
      const rwz = slotWorld.z + restLocal.x * sinA + restLocal.z * cosA;
      boltRestWorld[i]!.set(rwx, slotWorld.y + restLocal.y, rwz);
    }

    {
      const wx = slotWorld.x + rivetHoleLocal.x * cosA - rivetHoleLocal.z * sinA;
      const wz = slotWorld.z + rivetHoleLocal.x * sinA + rivetHoleLocal.z * cosA;
      rivetHoleWorld.set(wx, slotWorld.y + rivetHoleLocal.y, wz);
      const sax = slotWorld.x + slotAttachLocal.x * cosA - slotAttachLocal.z * sinA;
      const saz = slotWorld.z + slotAttachLocal.x * sinA + slotAttachLocal.z * cosA;
      slotAttachWorld.set(sax, slotWorld.y + slotAttachLocal.y, saz);
    }

    for (let i = 0; i < 2; i += 1) {
      const t = boltSeat[i]!;
      const pos = boltRestWorld[i]!.clone().lerp(holeWorld[i]!, t);
      dummy.position.copy(pos);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      boltMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 0.15;
      dummy.updateMatrix();
      boltHeadMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.copy(holeWorld[i]!);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      holeMesh.setMatrixAt(i, dummy.matrix);
    }
    boltMesh.instanceMatrix.needsUpdate = true;
    boltHeadMesh.instanceMatrix.needsUpdate = true;
    holeMesh.instanceMatrix.needsUpdate = true;
  }

  function placeSlot(slotPos: Vector3, normalAngle: number): void {
    slotWorld = slotPos.clone();
    slotAngle = normalAngle;
    ghostGroup.position.copy(slotPos);
    ghostGroup.rotation.y = normalAngle;
    refreshBoltsAndHoles();
  }

  function setShape(shape: BeamShape): void {
    buildForShape(shape);
  }

  function setBeamPose(pos: Vector3, yaw: number, pitch: number): void {
    group.position.copy(pos);
    group.rotation.set(pitch, yaw, 0);
  }

  function setGhostPulse(scale: number, opacity: number): void {
    ghostGroup.scale.setScalar(scale);
    if (ghostMesh) {
      (ghostMesh.material as MeshStandardMaterial).opacity = opacity;
    }
  }

  function setBoltSeat(index: 0 | 1, seatT: number): void {
    boltSeat[index] = Math.min(Math.max(seatT, 0), 1);
    refreshBoltsAndHoles();
  }

  function dispose(): void {
    beamMesh?.geometry.dispose();
    rivetMesh?.geometry.dispose();
    ghostMesh?.geometry.dispose();
    boltGeo.dispose();
    boltHeadGeo.dispose();
    holeGeo.dispose();
    holeMaterial.dispose();
  }

  return {
    group,
    ghostGroup,
    boltGroup,
    setShape,
    placeSlot,
    setBeamPose,
    setGhostPulse,
    setBoltSeat,
    get holePositions() {
      return holeWorld;
    },
    get boltRestPositions() {
      return boltRestWorld;
    },
    boltCurrentPosition(index: 0 | 1): Vector3 {
      return boltRestWorld[index]!.clone().lerp(holeWorld[index]!, boltSeat[index]!);
    },
    get rivetHolePosition() {
      return rivetHoleWorld;
    },
    get slotAttachPosition() {
      return slotAttachWorld;
    },
    dispose,
  };
}

// src/scene/crane.ts
// The steam crane: a hierarchical rig (carriage/runner -> boiler+chimney ->
// cable drum -> lattice boom -> sheave -> hook block). Rides twin rails on
// one tower leg (carriageT, 0..1 along the built structure) and translates
// further during the climb sequence. Idle motion: faint chimney wisp handled
// by the caller (visual/steam.ts), tiny mechanical idle sway here.

import {
  BoxGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { legOffsetAt, legTangentAt } from './curve';
import type { MaterialSet } from '../visual/materials';

export interface CraneAnchors {
  drumWorld: Vector3;
  sheaveWorld: Vector3;
  climbLeverWorld: Vector3;
  driverWorld: Vector3;
  wheelWorld: Vector3;
}

export interface CraneRig {
  group: Group;
  boom: Group;
  wheels: Mesh;
  /** Local group on the carriage deck the crane-driver worker rig parents into. */
  driverSlot: Group;
  /** Local group at the hook attach point (child of the crane rig) hoisted content parents into. */
  hookBlock: Group;
  /** Place the crane's carriage at height fraction t (0..1) along `legAngle`. */
  setCarriage(legAngle: number, t: number, extraLift: number): void;
  setBoomTilt(tilt: number): void;
  setWheelSpin(spinDelta: number): void;
  setIdlePhase(phase: number): void;
  anchors: CraneAnchors;
  dispose(): void;
}

const up = new Vector3(0, 1, 0);
const scratchQuat = new Quaternion();

function box(w: number, h: number, d: number): BoxGeometry {
  return new BoxGeometry(w, h, d);
}

export function createCraneRig(materials: MaterialSet): CraneRig {
  const group = new Group();
  group.name = 'crane';

  // ---- carriage / runner (rides the rails) --------------------------------
  const carriageGeoms = [
    box(1.1, 0.22, 1.4).translate(0, 0, 0),
    box(0.9, 0.5, 1.1).translate(0, 0.36, 0),
  ];
  const carriageGeo = mergeGeometries(carriageGeoms, false);
  carriageGeoms.forEach((g) => g.dispose());
  const carriageMesh = new Mesh(carriageGeo, materials.ironDark);
  group.add(carriageMesh);

  // wheels (instanced, small, read as "climbs rails")
  const wheelGeo = new CylinderGeometry(0.18, 0.18, 0.1, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = new InstancedMesh(wheelGeo, materials.ironDark, 4);
  wheels.instanceMatrix.setUsage(DynamicDrawUsage);
  const wheelLocal: [number, number][] = [
    [-0.55, -0.55],
    [-0.55, 0.55],
    [0.55, -0.55],
    [0.55, 0.55],
  ];
  const wdummy = new Object3D();
  wheelLocal.forEach(([x, z], i) => {
    wdummy.position.set(x, 0.02, z ?? 0);
    wdummy.updateMatrix();
    wheels.setMatrixAt(i, wdummy.matrix);
  });
  wheels.count = 4;
  group.add(wheels);

  // superstructure pivots on the carriage
  const superstructure = new Group();
  superstructure.position.y = 0.6;
  group.add(superstructure);

  // ---- boiler + chimney -----------------------------------------------------
  const boiler = new Mesh(new CylinderGeometry(0.34, 0.4, 1.1, 10), materials.ironDark);
  boiler.position.set(-0.15, 0.75, 0.1);
  superstructure.add(boiler);
  const chimney = new Mesh(new CylinderGeometry(0.1, 0.13, 0.9, 8), materials.ironDark);
  chimney.position.set(-0.15, 1.6, 0.1);
  superstructure.add(chimney);
  const chimneyCap = new Mesh(new CylinderGeometry(0.14, 0.1, 0.1, 8), materials.brass);
  chimneyCap.position.set(-0.15, 2.08, 0.1);
  superstructure.add(chimneyCap);
  const brassBand = new Mesh(new CylinderGeometry(0.42, 0.42, 0.08, 10), materials.brass);
  brassBand.position.set(-0.15, 1.05, 0.1);
  superstructure.add(brassBand);

  // ---- cable drum ------------------------------------------------------------
  const drum = new Mesh(new CylinderGeometry(0.28, 0.28, 0.42, 12), materials.ironDark);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0.35, 1.0, 0.1);
  superstructure.add(drum);
  // wound-cable stripes (thin torus rings)
  const cableWindGeo = new CylinderGeometry(0.31, 0.31, 0.03, 10, 1, true);
  cableWindGeo.rotateZ(Math.PI / 2);
  for (let i = -2; i <= 2; i += 1) {
    const ring = new Mesh(cableWindGeo, materials.ironDark);
    ring.position.set(0.35 + i * 0.06, 1.0, 0.1);
    superstructure.add(ring);
  }

  // ---- boom (lattice arm, clearly longer than the body) ---------------------
  const boom = new Group();
  boom.position.set(0.1, 1.35, 0.1);
  superstructure.add(boom);

  const boomLength = 3.6;
  const boomChordGeoms = [
    box(boomLength, 0.06, 0.06).translate(boomLength / 2, 0.18, 0),
    box(boomLength, 0.06, 0.06).translate(boomLength / 2, -0.02, 0),
  ];
  const boomBraceGeoms: BoxGeometry[] = [];
  const boomBays = 8;
  for (let i = 0; i < boomBays; i += 1) {
    const x0 = (i / boomBays) * boomLength;
    const x1 = ((i + 1) / boomBays) * boomLength;
    const dx = x1 - x0;
    const dy = i % 2 === 0 ? -0.2 : 0.2;
    const len = Math.hypot(dx, dy);
    const diag = box(len, 0.045, 0.045);
    diag.rotateZ(Math.atan2(dy, dx));
    diag.translate(x0 + dx / 2, 0.08 + (i % 2 === 0 ? 0.1 : -0.1), 0);
    boomBraceGeoms.push(diag);
  }
  const boomGeo = mergeGeometries([...boomChordGeoms, ...boomBraceGeoms], false);
  [...boomChordGeoms, ...boomBraceGeoms].forEach((g) => g.dispose());
  const boomMesh = new Mesh(boomGeo, materials.iron);
  boom.add(boomMesh);

  const sheave = new Mesh(new CylinderGeometry(0.14, 0.14, 0.08, 10), materials.brass);
  sheave.rotation.x = Math.PI / 2;
  sheave.position.set(boomLength, 0.08, 0);
  boom.add(sheave);

  // ---- hook block (position driven externally via anchors.hookAttachWorld
  // through the parent scene builder — the hook mesh itself lives here so
  // it inherits the crane's world transform baseline, but its local offset
  // is re-set every frame by scene/index.ts from hook/hoist/align state). --
  const hookBlock = new Group();
  hookBlock.name = 'hookBlock';
  const hookBody = new Mesh(new BoxGeometry(0.22, 0.16, 0.16), materials.ironDark);
  hookBlock.add(hookBody);
  const hookCurveGeo = new CylinderGeometry(0.06, 0.06, 0.3, 8, 1, true, 0, Math.PI * 1.4);
  const hookCurve = new Mesh(hookCurveGeo, materials.brass);
  hookCurve.rotation.z = Math.PI / 2;
  hookCurve.position.y = -0.22;
  hookBlock.add(hookCurve);
  // two sling hooks (share one geometry)
  const slingGeo = new CylinderGeometry(0.03, 0.03, 0.18, 6);
  for (const side of [-1, 1]) {
    const sling = new Mesh(slingGeo, materials.ironDark);
    sling.position.set(side * 0.08, -0.32, 0);
    hookBlock.add(sling);
  }
  // hookBlock is intentionally NOT parented under `group`: its world pose is
  // fully driven by scene/index.ts (hook.depth / hoist / align / sway math),
  // independent of the crane rig's own rail-following orientation. The
  // caller adds it to the scene root directly.

  // ---- climb lever (world-space object the child drags) --------------------
  const climbLever = new Group();
  const leverBase = new Mesh(new CylinderGeometry(0.05, 0.06, 0.5, 8), materials.ironDark);
  leverBase.position.y = 0.25;
  climbLever.add(leverBase);
  const leverKnob = new Mesh(new CylinderGeometry(0.09, 0.09, 0.14, 8), materials.brass);
  leverKnob.position.y = 0.55;
  climbLever.add(leverKnob);
  climbLever.position.set(0.5, 0.35, 0.5);
  group.add(climbLever);

  // ---- crane driver stands on the carriage deck ------------------------------
  const driverSlot = new Group();
  driverSlot.position.set(0.35, 0.36, -0.5);
  group.add(driverSlot);

  const anchors: CraneAnchors = {
    drumWorld: new Vector3(),
    sheaveWorld: new Vector3(),
    climbLeverWorld: new Vector3(),
    driverWorld: new Vector3(),
    wheelWorld: new Vector3(),
  };

  let idlePhase = 0;

  function setCarriage(legAngle: number, t: number, extraLift: number): void {
    const off = legOffsetAt(legAngle, t);
    const tangent = legTangentAt(legAngle, t);
    const inward = new Vector3(-Math.cos(legAngle), 0, -Math.sin(legAngle));
    // Height comes from the caller (already resolved to world units via
    // scene/index.ts); here we offset inward so the carriage hugs the
    // curving leg surface at that height, yaw so the boom always points
    // straight outward (away from the tower axis, toward the yard/beam),
    // and add a small, capped inward "lean" for the leg's curve reading
    // without letting the boom swing off in an unpredictable direction (a
    // full tangent-aligned quaternion would also spin the boom's outward
    // reach, which reads as broken rather than "climbing a curved rail").
    const pos = new Vector3(off.x, extraLift, off.z);
    pos.addScaledVector(inward, 0.35);
    group.position.copy(pos);
    const horizTangentMag = Math.hypot(tangent.x, tangent.z);
    const lean = Math.min(Math.atan2(horizTangentMag, Math.max(tangent.y, 0.001)), 0.35);
    scratchQuat.setFromAxisAngle(up, -legAngle);
    const leanQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), lean);
    group.quaternion.copy(scratchQuat).multiply(leanQuat);

    drum.getWorldPosition(anchors.drumWorld);
    sheave.getWorldPosition(anchors.sheaveWorld);
    climbLever.getWorldPosition(anchors.climbLeverWorld);
    driverSlot.getWorldPosition(anchors.driverWorld);
    wheels.getWorldPosition(anchors.wheelWorld);
  }

  function setBoomTilt(tilt: number): void {
    boom.rotation.z = tilt;
    sheave.getWorldPosition(anchors.sheaveWorld);
  }

  let wheelSpin = 0;
  function setWheelSpin(spinDelta: number): void {
    wheelSpin += spinDelta;
    wdummy.rotation.x = wheelSpin;
    wheelLocal.forEach(([x, z], i) => {
      wdummy.position.set(x, 0.02, z ?? 0);
      wdummy.updateMatrix();
      wheels.setMatrixAt(i, wdummy.matrix);
    });
    wheels.instanceMatrix.needsUpdate = true;
  }

  function setIdlePhase(phase: number): void {
    idlePhase = phase;
    superstructure.rotation.z = Math.sin(idlePhase) * 0.004;
  }

  function dispose(): void {
    carriageGeo.dispose();
    wheelGeo.dispose();
    boiler.geometry.dispose();
    chimney.geometry.dispose();
    chimneyCap.geometry.dispose();
    brassBand.geometry.dispose();
    drum.geometry.dispose();
    cableWindGeo.dispose();
    boomGeo.dispose();
    sheave.geometry.dispose();
    hookBody.geometry.dispose();
    hookCurveGeo.dispose();
    slingGeo.dispose();
    leverBase.geometry.dispose();
    leverKnob.geometry.dispose();
  }

  return {
    group,
    boom,
    wheels,
    driverSlot,
    hookBlock,
    setCarriage,
    setBoomTilt,
    setWheelSpin,
    setIdlePhase,
    anchors,
    dispose,
  };
}

export type { Group as CraneGroup };

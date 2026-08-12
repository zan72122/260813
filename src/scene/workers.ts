// src/scene/workers.ts
// 4-person rivet team (heater / catcher / holder-up / striker) + 1 crane
// driver: stylized low-poly adults with distinct silhouettes and simple
// procedural pose animation. Each worker is 2 draw calls: a static merged
// "body" (torso+legs+head) and one animated "tool arm" pivoting at the
// shoulder, so 5 workers cost 10 draw calls total.

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialSet } from '../visual/materials';

export type WorkerRole = 'heater' | 'catcher' | 'holder' | 'striker' | 'driver';

export interface WorkerRig {
  group: Group;
  /** Shoulder-pivoted tool-arm group; rotate .rotation.x/z to pose. */
  arm: Group;
  role: WorkerRole;
  /** World-space point at the tool tip (tongs/hammer head/hands), refreshed by setPose. */
  toolTip: Vector3;
  setPose(swing: number, reach: number): void;
  dispose(): void;
}

function buildBody(materials: MaterialSet, clothMat: MeshStandardMaterial): { mesh: Mesh; headTop: number } {
  const parts: BoxGeometry[] = [];
  // legs
  const legL = new BoxGeometry(0.14, 0.62, 0.16);
  legL.translate(-0.1, 0.31, 0);
  const legR = new BoxGeometry(0.14, 0.62, 0.16);
  legR.translate(0.1, 0.31, 0);
  parts.push(legL, legR);
  // torso (clothed)
  const torso = new BoxGeometry(0.42, 0.5, 0.26);
  torso.translate(0, 0.87, 0);
  parts.push(torso);
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  const mesh = new Mesh(merged, clothMat);

  const head = new SphereGeometry(0.14, 8, 6);
  head.translate(0, 1.28, 0);
  const headMesh = new Mesh(head, materials.skin);
  mesh.add(headMesh);

  return { mesh, headTop: 1.42 };
}

const ROLE_TOOL_LENGTH: Record<WorkerRole, number> = {
  heater: 0.5,
  catcher: 0.55,
  holder: 0.42,
  striker: 0.62,
  driver: 0.3,
};

export function createWorkerRig(
  materials: MaterialSet,
  role: WorkerRole,
  clothIndex: number,
): WorkerRig {
  const clothMat = materials.cloth[clothIndex % materials.cloth.length]!;
  const group = new Group();
  group.name = `worker-${role}`;

  const { mesh: bodyMesh } = buildBody(materials, clothMat);
  group.add(bodyMesh);

  // shoulder-pivoted arm + tool, geometry varies subtly by role for silhouette read.
  const arm = new Group();
  arm.position.set(0.19, 1.08, 0.05);
  group.add(arm);

  const upperArm = new Mesh(new BoxGeometry(0.09, 0.32, 0.1), materials.skin);
  upperArm.position.set(0, -0.16, 0);
  arm.add(upperArm);

  const toolLen = ROLE_TOOL_LENGTH[role];
  let tool: Mesh;
  switch (role) {
    case 'striker': {
      // sledgehammer: long handle + heavy head
      const handle = new CylinderGeometry(0.025, 0.025, toolLen, 6);
      handle.translate(0, -toolLen / 2, 0);
      const head = new BoxGeometry(0.16, 0.09, 0.09);
      head.translate(0, -toolLen, 0);
      const merged = mergeGeometries([handle, head], false);
      handle.dispose();
      head.dispose();
      tool = new Mesh(merged, materials.ironDark);
      break;
    }
    case 'catcher': {
      // long tongs
      const geo = new CylinderGeometry(0.02, 0.02, toolLen, 6);
      geo.translate(0, -toolLen / 2, 0.05);
      tool = new Mesh(geo, materials.ironDark);
      break;
    }
    case 'holder': {
      // dolly bar (short thick rod held behind the plate)
      const geo = new CylinderGeometry(0.035, 0.035, toolLen, 6);
      geo.translate(0, -toolLen / 2, 0.1);
      tool = new Mesh(geo, materials.ironDark);
      break;
    }
    case 'heater': {
      // long-handled forge tongs
      const geo = new CylinderGeometry(0.022, 0.022, toolLen, 6);
      geo.translate(0, -toolLen / 2, -0.05);
      tool = new Mesh(geo, materials.ironDark);
      break;
    }
    default: {
      const geo = new CylinderGeometry(0.03, 0.03, toolLen, 6);
      geo.translate(0, -toolLen / 2, 0);
      tool = new Mesh(geo, materials.brass);
    }
  }
  tool.position.set(0, -0.32, 0);
  arm.add(tool);

  const toolTip = new Vector3();

  function setPose(swing: number, reach: number): void {
    arm.rotation.x = swing;
    arm.rotation.z = reach * 0.3;
    tool.getWorldPosition(toolTip);
    toolTip.y -= toolLen * 0.4;
  }
  setPose(0, 0);

  function dispose(): void {
    bodyMesh.geometry.dispose();
    (bodyMesh.children[0] as Mesh | undefined)?.geometry.dispose();
    upperArm.geometry.dispose();
    tool.geometry.dispose();
  }

  return { group, arm, role, toolTip, setPose, dispose };
}

export interface WorkerTeam {
  heater: WorkerRig;
  catcher: WorkerRig;
  holder: WorkerRig;
  striker: WorkerRig;
  driver: WorkerRig;
  all: WorkerRig[];
  dispose(): void;
}

export function createWorkerTeam(materials: MaterialSet, seedOffset: number): WorkerTeam {
  const heater = createWorkerRig(materials, 'heater', seedOffset);
  const catcher = createWorkerRig(materials, 'catcher', seedOffset + 1);
  const holder = createWorkerRig(materials, 'holder', seedOffset + 2);
  const striker = createWorkerRig(materials, 'striker', seedOffset + 3);
  const driver = createWorkerRig(materials, 'driver', seedOffset + 4);
  const all = [heater, catcher, holder, striker, driver];

  function dispose(): void {
    all.forEach((w) => w.dispose());
  }

  return { heater, catcher, holder, striker, driver, all, dispose };
}

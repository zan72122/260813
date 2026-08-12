// src/scene/tower.ts
// Procedural Eiffel-tower structure: 4 curved legs (merged into one draw
// call), X-lattice bracing via InstancedMesh, riveted gusset-plate dots via
// InstancedMesh. Height grows with state.towerLevel; the section currently
// under construction is left visually "open" (no bracing yet) so the ghost
// slot (owned by beam.ts) reads clearly against it.

import {
  BoxGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEG_ANGLES, LEVEL_HEIGHT, legOffsetAt, legRadiusAt, legTangentAt } from './curve';
import { MAX_TOWER_LEVEL } from '../contracts/machine';
import type { MaterialSet } from '../visual/materials';

const MAX_HEIGHT = LEVEL_HEIGHT * MAX_TOWER_LEVEL;
const LEG_TUBE_SEGMENTS = 22;
const LEG_RADIAL_SEGMENTS = 6;
const MAX_BRACE_INSTANCES = 320;
const MAX_GUSSET_INSTANCES = 260;
/** Legs poke up past the last completed bracing row — reads as "unfinished top, protruding members". */
const LEG_PROTRUSION = 1.6;

export interface TowerRig {
  group: Group;
  /** World height (units) of the currently built structure, for camera/crane placement. */
  builtHeight: number;
  /** World position at the top of the currently built structure, on a given leg angle. */
  topOfLeg(angleIndex: number): Vector3;
  setLevel(level: number): void;
  dispose(): void;
}

const scratchMatrix = new Matrix4();
const scratchQuat = new Quaternion();
const scratchPos = new Vector3();
const scratchScale = new Vector3();
const up = new Vector3(0, 1, 0);
const dummy = new Object3D();

function heightForLevel(level: number): number {
  return Math.min(Math.max(level, 0), MAX_TOWER_LEVEL) * LEVEL_HEIGHT + 2.4;
}

const legThicknessBase = 0.55;
const legThicknessTop = 0.16;

/** Build the merged 4-leg tapered-tube geometry, only up to height fraction `tMax` (0..1 of MAX_HEIGHT). */
function buildLegGeometry(tMax: number) {
  const legGeoms = [];
  for (const angle of LEG_ANGLES) {
    const geo = new CylinderGeometry(1, 1, 1, LEG_RADIAL_SEGMENTS, LEG_TUBE_SEGMENTS, true);
    const pos = geo.attributes.position;
    if (!pos) throw new Error('leg geometry missing position attribute');
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i); // -0.5..0.5 local cylinder height
      const pz = pos.getZ(i);
      const t = (py + 0.5) * tMax; // 0..tMax
      const off = legOffsetAt(angle, t);
      const r = legThicknessBase + (legThicknessTop - legThicknessBase) * t;
      pos.setXYZ(i, off.x + px * r, t * MAX_HEIGHT, off.z + pz * r);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    legGeoms.push(geo);
  }
  const merged = mergeGeometries(legGeoms, false);
  legGeoms.forEach((g) => g.dispose());
  return merged;
}

export function createTowerRig(materials: MaterialSet): TowerRig {
  const group = new Group();
  group.name = 'tower';

  // ---- Legs: one merged tapered-tube geometry per leg, all 4 merged into one
  // draw call. Rebuilt (rarely — only on a towerLevel change) so the legs
  // themselves grow with construction instead of always spanning full height.
  let legGeo = buildLegGeometry(0.001);
  const legMesh = new Mesh(legGeo, materials.iron);
  legMesh.name = 'towerLegs';
  group.add(legMesh);

  // ---- X-lattice bracing: InstancedMesh of thin boxes between adjacent legs.
  const braceGeo = new BoxGeometry(1, 1, 1);
  const braceMesh = new InstancedMesh(braceGeo, materials.ironDark, MAX_BRACE_INSTANCES);
  braceMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  braceMesh.count = 0;
  group.add(braceMesh);

  // ---- Gusset plates: InstancedMesh of small rivet-like cylinders at joints.
  const gussetGeo = new CylinderGeometry(0.09, 0.09, 0.05, 6);
  gussetGeo.rotateX(Math.PI / 2);
  const gussetMesh = new InstancedMesh(gussetGeo, materials.brass, MAX_GUSSET_INSTANCES);
  gussetMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  gussetMesh.count = 0;
  group.add(gussetMesh);

  let builtHeight = heightForLevel(0);

  function placeBrace(index: number, angleA: number, angleB: number, t0: number, t1: number, mirrored: boolean): void {
    if (index >= MAX_BRACE_INSTANCES) return;
    const a = legOffsetAt(angleA, mirrored ? t1 : t0);
    const b = legOffsetAt(angleB, mirrored ? t0 : t1);
    const ay = (mirrored ? t1 : t0) * MAX_HEIGHT;
    const by = (mirrored ? t0 : t1) * MAX_HEIGHT;
    scratchPos.set((a.x + b.x) / 2, (ay + by) / 2, (a.z + b.z) / 2);
    const dir = new Vector3(b.x - a.x, by - ay, b.z - a.z);
    const len = dir.length() || 0.001;
    dir.normalize();
    scratchQuat.setFromUnitVectors(up, dir);
    scratchScale.set(0.08, len, 0.06);
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
    braceMesh.setMatrixAt(index, scratchMatrix);
  }

  function placeGusset(index: number, angle: number, t: number): void {
    if (index >= MAX_GUSSET_INSTANCES) return;
    const off = legOffsetAt(angle, t);
    const r = legThicknessBase + (legThicknessTop - legThicknessBase) * t;
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    dummy.position.set(off.x + nx * r * 0.95, t * MAX_HEIGHT, off.z + nz * r * 0.95);
    dummy.lookAt(dummy.position.x + nx, dummy.position.y, dummy.position.z + nz);
    dummy.updateMatrix();
    gussetMesh.setMatrixAt(index, dummy.matrix);
  }

  function rebuild(level: number): void {
    builtHeight = heightForLevel(level);
    const builtFraction = Math.min(builtHeight / MAX_HEIGHT, 1);

    const legTMax = Math.min((builtHeight + LEG_PROTRUSION) / MAX_HEIGHT, 1);
    const nextLegGeo = buildLegGeometry(legTMax);
    legMesh.geometry = nextLegGeo;
    legGeo.dispose();
    legGeo = nextLegGeo;

    const rows = Math.max(3, Math.round(level * 3 + 3));

    let braceIndex = 0;
    for (let row = 0; row < rows && braceIndex < MAX_BRACE_INSTANCES - 8; row += 1) {
      const t0 = (row / rows) * builtFraction * 0.97;
      const t1 = ((row + 1) / rows) * builtFraction * 0.97;
      for (let i = 0; i < LEG_ANGLES.length; i += 1) {
        const a = LEG_ANGLES[i]!;
        const b = LEG_ANGLES[(i + 1) % LEG_ANGLES.length]!;
        placeBrace(braceIndex, a, b, t0, t1, row % 2 === 0);
        braceIndex += 1;
        placeBrace(braceIndex, a, b, t0, t1, row % 2 !== 0);
        braceIndex += 1;
      }
    }
    braceMesh.count = braceIndex;
    braceMesh.instanceMatrix.needsUpdate = true;

    let gussetIndex = 0;
    const gussetRows = Math.max(4, Math.round(level * 5 + 4));
    for (let row = 0; row <= gussetRows && gussetIndex < MAX_GUSSET_INSTANCES; row += 1) {
      const t = (row / gussetRows) * builtFraction * 0.97;
      for (const angle of LEG_ANGLES) {
        if (gussetIndex >= MAX_GUSSET_INSTANCES) break;
        placeGusset(gussetIndex, angle, t);
        gussetIndex += 1;
      }
    }
    gussetMesh.count = gussetIndex;
    gussetMesh.instanceMatrix.needsUpdate = true;
  }

  rebuild(0);

  function setLevel(level: number): void {
    rebuild(level);
  }

  function topOfLeg(angleIndex: number): Vector3 {
    const angle = LEG_ANGLES[angleIndex % LEG_ANGLES.length]!;
    const t = Math.min(builtHeight / MAX_HEIGHT, 1);
    const off = legOffsetAt(angle, t);
    return new Vector3(off.x, builtHeight, off.z);
  }

  function dispose(): void {
    legGeo.dispose();
    braceGeo.dispose();
    gussetGeo.dispose();
  }

  return {
    group,
    get builtHeight() {
      return builtHeight;
    },
    topOfLeg,
    setLevel,
    dispose,
  };
}

export { MAX_HEIGHT as TOWER_MAX_HEIGHT, legTangentAt, legRadiusAt };

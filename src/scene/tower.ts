// src/scene/tower.ts
// Procedural Eiffel-tower structure: 4 curved LATTICE PYLON legs (square
// cross-section + real tapering corner chords, merged into one draw call
// together with the operating leg's twin climb rails), real short X-panel
// diagonal cross members WITHIN each leg's own faces (InstancedMesh — never
// full-span leg-to-leg diagonals, which used to read as a thin-line tangle),
// horizontal ring-girder bands tying the four legs at each completed
// construction level, and riveted gusset-plate dots at the panel joints
// (InstancedMesh). Height grows with state.towerLevel; the section currently
// under construction is left visually "open" (bare corner chords, no ring
// girder yet) so the ghost slot (owned by beam.ts) reads clearly against it.

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
import { LEG_ANGLES, LEVEL_HEIGHT, legOffsetAt, legOffsetInto, legRadiusAt, legTangentAt } from './curve';
import { MAX_TOWER_LEVEL } from '../contracts/machine';
import type { MaterialSet } from '../visual/materials';

/** World height already built at towerLevel 0 — tall enough the lattice-pylon
 * silhouette reads immediately in a wide shot (D1: ~10-14 world units), not a
 * stub. Each further towerLevel adds one LEVEL_HEIGHT band on top. */
const BASE_HEIGHT = 11.5;
const MAX_HEIGHT = BASE_HEIGHT + LEVEL_HEIGHT * MAX_TOWER_LEVEL;

const LEG_TUBE_SEGMENTS = 26;
/** Square cross-section (4 radial segments): real flat faces + sharp riveted
 * corners, instead of the old rounded/hexagonal post. With THREE's default
 * CylinderGeometry vertex phase, the 4 corners sit at local angles
 * 0/90/180/270 — which puts the 4 FACE NORMALS at the 45°-offset midpoints,
 * exactly each leg's own LEG_ANGLES azimuth. So every leg's outward-facing
 * side already faces straight away from the tower axis with no extra
 * rotation needed. */
const LEG_RADIAL_SEGMENTS = 4;
const CORNER_LOCAL_ANGLES: readonly number[] = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

const MAX_LATTICE_INSTANCES = 2200;
const MAX_GUSSET_INSTANCES = 480;
/** Only every Nth panel row gets a gusset dot (riveted-joint accent) — a
 * maxed-out tower can have ~MAX_PANEL_ROWS rows, and every joint would blow
 * the (deliberately small, cheap) gusset instance budget. */
const GUSSET_ROW_STRIDE = 3;
/** Legs poke up bare past the last completed ring girder — reads as
 * "unfinished top, protruding members mid-construction" (R1: exaggerated
 * from the original 2.0 so it reads clearly even in the pulled-back
 * establish shot, and paired below with a few sparse diagonals + a partial
 * ring fragment so the protrusion isn't just 4 bare rods). */
const LEG_PROTRUSION = 3.4;

const legThicknessBase = 0.62;
const legThicknessTop = 0.2;

/** The operating leg (crane rail leg) is always LEG_ANGLES[0] — kept in sync
 * with src/scene/index.ts's OPERATING_LEG_INDEX by convention (no shared
 * export needed: both simply use index 0, the frozen contract doesn't name a
 * "current operating leg" concept beyond that single-crane assumption). */
const RAIL_LEG_ANGLE = LEG_ANGLES[0]!;
const RAIL_HALF_GAUGE = 0.3;
const RAIL_RADIUS = 0.045;
/** How far inward (toward the tower axis) the rails/carriage sit from the
 * leg's outward centerline — matches crane.ts's setCarriage 0.35 inward
 * offset so the rails read as being directly under the carriage's wheels. */
const RAIL_INSET = 0.35;

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
const scratchDir = new Vector3();
const up = new Vector3(0, 1, 0);
const dummy = new Object3D();

function heightForLevel(level: number): number {
  return BASE_HEIGHT + Math.min(Math.max(level, 0), MAX_TOWER_LEVEL) * LEVEL_HEIGHT;
}

/** The leg's own cross-section half-width (circumradius of the square) at
 * height fraction t — tapers from a substantial riveted-plate base down to a
 * slim apex member, independent of legRadiusAt(t) (which is the leg's
 * *azimuthal* distance from the tower's central axis). */
function thicknessAt(t: number): number {
  return legThicknessBase + (legThicknessTop - legThicknessBase) * t;
}

/** World position of corner `cornerLocalAngle` of the leg at `angle`, height fraction t. */
function cornerWorld(angle: number, cornerLocalAngle: number, t: number, out: Vector3): Vector3 {
  const off = legOffsetAt(angle, t);
  const r = thicknessAt(t);
  out.set(off.x + Math.cos(cornerLocalAngle) * r, t * MAX_HEIGHT, off.z + Math.sin(cornerLocalAngle) * r);
  return out;
}

const cornerA = new Vector3();
const cornerB = new Vector3();

/** Build the merged 4-leg tapered-box geometry (square cross-section) plus
 * each leg's 4 real tapering corner chords, plus the operating leg's twin
 * climb rails — all one geometry, one draw call — up to height fraction
 * `tMax` (0..1 of MAX_HEIGHT). */
function buildLegGeometry(tMax: number) {
  const pieces = [];

  // ---- 4 leg "web" boxes (square tube, tapered) ----
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
      const r = thicknessAt(t);
      pos.setXYZ(i, off.x + px * r, t * MAX_HEIGHT, off.z + pz * r);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    pieces.push(geo);
  }

  // ---- 4 real tapering corner chords per leg (16 total): thin rods
  // tracking each leg's own 4 corners, reading as riveted angle-iron edges. ----
  const chordRadius = 0.055;
  for (const angle of LEG_ANGLES) {
    for (const cornerAngle of CORNER_LOCAL_ANGLES) {
      const geo = new CylinderGeometry(1, 1, 1, 5, LEG_TUBE_SEGMENTS, true);
      const pos = geo.attributes.position;
      if (!pos) throw new Error('chord geometry missing position attribute');
      for (let i = 0; i < pos.count; i += 1) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const t = (py + 0.5) * tMax;
        cornerWorld(angle, cornerAngle, t, cornerA);
        pos.setXYZ(i, cornerA.x + px * chordRadius, t * MAX_HEIGHT, cornerA.z + pz * chordRadius);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      pieces.push(geo);
    }
  }

  // ---- twin climb rails on the operating leg (D3): two thin rods flush
  // against the leg surface, inset toward the axis to sit under the crane
  // carriage's actual path. ----
  const inward = new Vector3(-Math.cos(RAIL_LEG_ANGLE), 0, -Math.sin(RAIL_LEG_ANGLE));
  const perp = new Vector3(-Math.sin(RAIL_LEG_ANGLE), 0, Math.cos(RAIL_LEG_ANGLE));
  for (const side of [-1, 1]) {
    const geo = new CylinderGeometry(1, 1, 1, 6, LEG_TUBE_SEGMENTS, true);
    const pos = geo.attributes.position;
    if (!pos) throw new Error('rail geometry missing position attribute');
    for (let i = 0; i < pos.count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const t = (py + 0.5) * tMax;
      const off = legOffsetAt(RAIL_LEG_ANGLE, t);
      const cx = off.x + inward.x * RAIL_INSET + perp.x * RAIL_HALF_GAUGE * side;
      const cz = off.z + inward.z * RAIL_INSET + perp.z * RAIL_HALF_GAUGE * side;
      pos.setXYZ(i, cx + px * RAIL_RADIUS, t * MAX_HEIGHT, cz + pz * RAIL_RADIUS);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    pieces.push(geo);
  }

  const merged = mergeGeometries(pieces, false);
  pieces.forEach((g) => g.dispose());
  return merged;
}

/** Adaptive panel-row [t0,t1] boundaries so each X-lattice panel stays near a
 * 1:1 aspect ratio: rows are shorter (denser) higher up the leg, where the
 * leg itself is narrower — exactly like the real structure's panelling.
 * Capped so a maxed-out tower can't blow the instance budget. */
const MAX_PANEL_ROWS = 64;
function buildPanelRows(builtFraction: number): Array<[number, number]> {
  const rows: Array<[number, number]> = [];
  let t = 0;
  while (t < builtFraction - 1e-6 && rows.length < MAX_PANEL_ROWS) {
    const panelWidth = thicknessAt(t) * 1.5; // ~face width -> near-square panels
    const dt = Math.max(panelWidth / MAX_HEIGHT, 0.004);
    const t1 = Math.min(t + dt, builtFraction);
    rows.push([t, t1]);
    t = t1;
  }
  if (rows.length === 0 && builtFraction > 0) {
    rows.push([0, builtFraction]);
  }
  return rows;
}

export function createTowerRig(materials: MaterialSet): TowerRig {
  const group = new Group();
  group.name = 'tower';

  // ---- Legs + corner chords + climb rails: one merged geometry, one draw call. ----
  let legGeo = buildLegGeometry(0.001);
  const legMesh = new Mesh(legGeo, materials.legLattice);
  legMesh.name = 'towerLegs';
  group.add(legMesh);

  // ---- X-lattice diagonals (within each leg's own faces) + horizontal ring
  // girders (between legs, at completed level boundaries only): one shared
  // InstancedMesh of thin boxes. ----
  const latticeGeo = new BoxGeometry(1, 1, 1);
  const latticeMesh = new InstancedMesh(latticeGeo, materials.ironDark, MAX_LATTICE_INSTANCES);
  latticeMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  latticeMesh.count = 0;
  group.add(latticeMesh);

  // ---- Gusset plates: InstancedMesh of small rivet-like cylinders at panel joints. ----
  const gussetGeo = new CylinderGeometry(0.09, 0.09, 0.05, 6);
  gussetGeo.rotateX(Math.PI / 2);
  const gussetMesh = new InstancedMesh(gussetGeo, materials.brass, MAX_GUSSET_INSTANCES);
  gussetMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  gussetMesh.count = 0;
  group.add(gussetMesh);

  let builtHeight = heightForLevel(0);

  /** A diagonal member between two adjacent corners of the SAME leg, within
   * one panel row — never a full-span leg-to-leg diagonal. */
  function placeFaceDiagonal(
    index: number,
    legAngle: number,
    faceIndex: number,
    t0: number,
    t1: number,
    mirrored: boolean,
  ): number {
    if (index >= MAX_LATTICE_INSTANCES) return index;
    const angleA = CORNER_LOCAL_ANGLES[faceIndex]!;
    const angleB = CORNER_LOCAL_ANGLES[(faceIndex + 1) % CORNER_LOCAL_ANGLES.length]!;
    cornerWorld(legAngle, angleA, mirrored ? t1 : t0, cornerA);
    cornerWorld(legAngle, angleB, mirrored ? t0 : t1, cornerB);
    scratchPos.set((cornerA.x + cornerB.x) / 2, (cornerA.y + cornerB.y) / 2, (cornerA.z + cornerB.z) / 2);
    scratchDir.set(cornerB.x - cornerA.x, cornerB.y - cornerA.y, cornerB.z - cornerA.z);
    const len = scratchDir.length() || 0.001;
    scratchDir.normalize();
    scratchQuat.setFromUnitVectors(up, scratchDir);
    scratchScale.set(0.045, len, 0.04);
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
    latticeMesh.setMatrixAt(index, scratchMatrix);
    return index + 1;
  }

  /** A horizontal belt-girder segment tying two adjacent legs at the same height. */
  function placeRingGirder(index: number, angleA: number, angleB: number, t: number): number {
    if (index >= MAX_LATTICE_INSTANCES) return index;
    const a = legOffsetAt(angleA, t);
    const b = legOffsetAt(angleB, t);
    const y = t * MAX_HEIGHT;
    scratchPos.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    scratchDir.set(b.x - a.x, 0, b.z - a.z);
    const len = scratchDir.length() || 0.001;
    scratchDir.normalize();
    scratchQuat.setFromUnitVectors(up, scratchDir);
    scratchScale.set(0.16, len, 0.13);
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
    latticeMesh.setMatrixAt(index, scratchMatrix);
    return index + 1;
  }

  const GUSSET_NUDGE = 0.07; // clears the corner chord's own 0.055 radius
  function placeGusset(index: number, angle: number, cornerAngle: number, t: number): number {
    if (index >= MAX_GUSSET_INSTANCES) return index;
    cornerWorld(angle, cornerAngle, t, cornerA);
    const nx = Math.cos(cornerAngle);
    const nz = Math.sin(cornerAngle);
    dummy.position.set(cornerA.x + nx * GUSSET_NUDGE, cornerA.y, cornerA.z + nz * GUSSET_NUDGE);
    dummy.lookAt(dummy.position.x + nx, dummy.position.y, dummy.position.z + nz);
    dummy.updateMatrix();
    gussetMesh.setMatrixAt(index, dummy.matrix);
    return index + 1;
  }

  function rebuild(level: number): void {
    builtHeight = heightForLevel(level);
    const builtFraction = Math.min(builtHeight / MAX_HEIGHT, 1);

    const legTMax = Math.min((builtHeight + LEG_PROTRUSION) / MAX_HEIGHT, 1);
    const nextLegGeo = buildLegGeometry(legTMax);
    legMesh.geometry = nextLegGeo;
    legGeo.dispose();
    legGeo = nextLegGeo;

    // ---- X-lattice diagonals: real short members within each leg's own 4
    // faces, panel rows sized ~1:1, denser near the (narrower) top. ----
    let idx = 0;
    const rows = buildPanelRows(builtFraction);
    for (const angle of LEG_ANGLES) {
      for (let face = 0; face < 4; face += 1) {
        for (const [t0, t1] of rows) {
          idx = placeFaceDiagonal(idx, angle, face, t0, t1, false);
          idx = placeFaceDiagonal(idx, angle, face, t0, t1, true);
        }
      }
    }

    // ---- horizontal ring girders: only at each COMPLETED level boundary
    // (never scattered mid-panel), tying all 4 legs together. ----
    for (let l = 0; l <= level; l += 1) {
      const t = Math.min(heightForLevel(l) / MAX_HEIGHT, 1);
      for (let i = 0; i < LEG_ANGLES.length; i += 1) {
        const a = LEG_ANGLES[i]!;
        const b = LEG_ANGLES[(i + 1) % LEG_ANGLES.length]!;
        idx = placeRingGirder(idx, a, b, t);
      }
    }

    // ---- R1: sparse "next tier being built" members in the bare
    // protrusion above the last completed level — a couple of diagonals per
    // leg (only 2 of its 4 faces, not a full braced panel) plus ONE partial
    // ring fragment between a single pair of adjacent legs (not all 4) at
    // mid-protrusion height, so the top reads as "mid-assembly" rather than
    // either a finished panel or just bare rods. ----
    if (legTMax > builtFraction + 1e-6) {
      const nextRowT1 = Math.min(builtFraction + (legTMax - builtFraction) * 0.7, legTMax);
      for (const angle of LEG_ANGLES) {
        idx = placeFaceDiagonal(idx, angle, 0, builtFraction, nextRowT1, false);
        idx = placeFaceDiagonal(idx, angle, 2, builtFraction, nextRowT1, true);
      }
      const fragT = builtFraction + (legTMax - builtFraction) * 0.55;
      idx = placeRingGirder(idx, LEG_ANGLES[0]!, LEG_ANGLES[1]!, fragT);
    }
    latticeMesh.count = idx;
    latticeMesh.instanceMatrix.needsUpdate = true;

    // ---- gussets at every few panel-row corners (riveted-joint read,
    // strided so a maxed-out tower's ~64 rows can't overrun the instance cap). ----
    let gussetIndex = 0;
    for (const angle of LEG_ANGLES) {
      for (const cornerAngle of CORNER_LOCAL_ANGLES) {
        for (let ri = 0; ri < rows.length; ri += GUSSET_ROW_STRIDE) {
          gussetIndex = placeGusset(gussetIndex, angle, cornerAngle, rows[ri]![0]);
        }
        gussetIndex = placeGusset(gussetIndex, angle, cornerAngle, builtFraction);
      }
    }
    gussetMesh.count = gussetIndex;
    gussetMesh.instanceMatrix.needsUpdate = true;
  }

  rebuild(0);

  function setLevel(level: number): void {
    rebuild(level);
  }

  // R9: topOfLeg is called once per frame from scene/index.ts's hot path
  // (its result is only ever read synchronously within that same frame, so
  // a single reused Vector3 is safe) — avoids a fresh allocation every frame.
  const topOfLegScratch = new Vector3();
  const topOfLegOffsetScratch = { x: 0, z: 0 };
  function topOfLeg(angleIndex: number): Vector3 {
    const angle = LEG_ANGLES[angleIndex % LEG_ANGLES.length]!;
    const t = Math.min(builtHeight / MAX_HEIGHT, 1);
    const off = legOffsetInto(topOfLegOffsetScratch, angle, t);
    return topOfLegScratch.set(off.x, builtHeight, off.z);
  }

  function dispose(): void {
    legGeo.dispose();
    latticeGeo.dispose();
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

/**
 * One scene's (salon/forest/rustic) rig: 3 wing pairs + backdrop + border +
 * foreground props, all "painted flat" per docs/VISUAL_DIRECTION.md. Built
 * once; every frame its transform is re-derived purely from
 * TransformDerivedState (docs/STAGE_MECHANISM_ABSTRACTION.md) -- no local
 * timers/tweens, per CONTRACTS invariant #1 (same p -> same state).
 *
 * A StageWorld plays one of two roles each frame, chosen by the caller
 * (TheaterScene): updateAsOld() while it is the transform's `from` scene,
 * updateAsNew() while it is the `to` scene. Both roles are pure functions of
 * the same TransformDerivedState, so re-labelling a world from "new" to
 * "old" when the active TransformPair advances produces zero visual jump
 * (the "fully in place" pose is identical whichever role reached it).
 */
import {
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  type BufferGeometry,
  type Material
} from 'three';
import type { MaterialLibrary, QualityTier, SceneId, TransformDerivedState } from '../../core';
import {
  BACKDROP_HIDE_Y,
  BACKDROP_HOME_Y,
  BACKDROP_Z,
  BORDER_HIDE_Y,
  BORDER_HOME_Y,
  FOREGROUND_HIDE_DEPTH,
  FOREGROUND_HOME_Y,
  FOREGROUND_Z,
  WING_EXIT_TRAVEL,
  WING_HOME_X,
  WING_Z
} from './layout';

/** Extra constant Z separation between an "old" and "new" flat at the same wing slot, avoiding z-fighting while they cross (docs/STAGE_MECHANISM_ABSTRACTION.md "貫通・ちらつき対策"). */
const WING_ROLE_Z_BIAS = 0.03;
const WING_HOME_Y = 1.55;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Layout arrays are fixed-length-3 tuples indexed by a loop bound to that same length. */
function at3(values: readonly [number, number, number], i: number): number {
  return values[i as 0 | 1 | 2];
}

/** A part of a compound foreground prop: its own geometry, positioned/scaled within the prop's local space. */
interface PropPart {
  readonly geometry: BufferGeometry;
  readonly position?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly rotationZ?: number;
}

/**
 * Readable low-poly silhouettes per docs/MASTER_SPEC.md's per-scene prop list
 * (salon: chair + small table; forest: rock + bush; rustic: table/bench +
 * hearth), each built from 1-3 cheap primitives rather than a single bare
 * cone/box. Index 2 is a smaller matching accent piece in every scene.
 */
function foregroundParts(sceneId: SceneId, index: number): readonly PropPart[] {
  if (sceneId === 'salon') {
    if (index === 0) {
      // chair: seat + backrest
      return [
        { geometry: new BoxGeometry(0.46, 0.09, 0.46), position: [0, 0.26, 0] },
        { geometry: new BoxGeometry(0.42, 0.5, 0.08), position: [0, 0.55, -0.19] }
      ];
    }
    if (index === 1) {
      // small table: top + single turned leg
      return [
        { geometry: new BoxGeometry(0.62, 0.07, 0.42), position: [0, 0.5, 0] },
        { geometry: new CylinderGeometry(0.05, 0.08, 0.46, 8), position: [0, 0.23, 0] }
      ];
    }
    return [{ geometry: new CylinderGeometry(0.16, 0.19, 0.32, 8), position: [0, 0.16, 0] }]; // stool accent
  }
  if (sceneId === 'forest') {
    if (index === 0) {
      // rock: squashed, irregular icosahedron
      return [{ geometry: new IcosahedronGeometry(0.42, 0), position: [0, 0.28, 0], scale: [1, 0.68, 0.88] }];
    }
    if (index === 1) {
      // bush: a small cluster of overlapping foliage blobs
      return [
        { geometry: new IcosahedronGeometry(0.3, 0), position: [-0.12, 0.3, 0], scale: [1, 0.85, 1] },
        { geometry: new IcosahedronGeometry(0.26, 0), position: [0.14, 0.34, 0.06], scale: [1, 0.8, 1] },
        { geometry: new IcosahedronGeometry(0.22, 0), position: [0, 0.5, -0.08], scale: [1, 0.75, 1] }
      ];
    }
    return [{ geometry: new IcosahedronGeometry(0.2, 0), position: [0, 0.14, 0], scale: [1, 0.6, 0.9] }]; // small rock accent
  }
  // rustic
  if (index === 0) {
    // table/bench: top + two legs
    return [
      { geometry: new BoxGeometry(0.92, 0.08, 0.5), position: [0, 0.5, 0] },
      { geometry: new BoxGeometry(0.08, 0.46, 0.44), position: [-0.36, 0.23, 0] },
      { geometry: new BoxGeometry(0.08, 0.46, 0.44), position: [0.36, 0.23, 0] }
    ];
  }
  if (index === 1) {
    // hearth: stone surround + warm fire accent
    return [
      { geometry: new BoxGeometry(0.55, 0.6, 0.4), position: [0, 0.3, 0] },
      { geometry: new IcosahedronGeometry(0.16, 0), position: [0, 0.38, 0.16], scale: [1, 1.3, 0.7] }
    ];
  }
  return [{ geometry: new CylinderGeometry(0.14, 0.16, 0.5, 8), position: [0, 0.14, 0], rotationZ: Math.PI / 2 }]; // log accent
}

function buildForegroundProp(
  sceneId: SceneId,
  index: number,
  materials: MaterialLibrary,
  ownedGeometries: BufferGeometry[],
  ownedMaterials: Material[]
): Group {
  const group = new Group();
  const isFireAccent = sceneId === 'rustic' && index === 1;
  for (const [partIndex, part] of foregroundParts(sceneId, index).entries()) {
    ownedGeometries.push(part.geometry);
    // The hearth's second part (partIndex 1) is the warm fire accent; everything else
    // uses the scene's own foreground-role painted material.
    const material = isFireAccent && partIndex === 1 ? materials.goldTrim() : materials.paintedFlat(sceneId, `foreground${index}`);
    ownedMaterials.push(material);
    const mesh = new Mesh(part.geometry, material);
    if (part.position) mesh.position.set(part.position[0], part.position[1], part.position[2]);
    if (part.scale) mesh.scale.set(part.scale[0], part.scale[1], part.scale[2]);
    if (part.rotationZ) mesh.rotation.z = part.rotationZ;
    group.add(mesh);
  }
  return group;
}

interface WingSlot {
  readonly left: Mesh;
  readonly right: Mesh;
}

export class StageWorld {
  readonly group = new Group();
  private readonly wings: WingSlot[] = [];
  private readonly backdrop: Mesh;
  private readonly border: Mesh;
  private readonly foreground: Group[] = [];
  private readonly ownedMaterials: Material[] = [];
  private readonly ownedGeometries: BufferGeometry[] = [];

  constructor(
    private readonly sceneId: SceneId,
    materials: MaterialLibrary
  ) {
    for (let i = 0; i < 3; i += 1) {
      const geometry = new PlaneGeometry(1.3, 3.1);
      this.ownedGeometries.push(geometry);
      const leftMaterial = materials.paintedFlat(sceneId, `wing${i}`);
      const rightMaterial = materials.paintedFlat(sceneId, `wing${i}`);
      leftMaterial.side = DoubleSide;
      rightMaterial.side = DoubleSide;
      this.ownedMaterials.push(leftMaterial, rightMaterial);
      const left = new Mesh(geometry, leftMaterial);
      const right = new Mesh(geometry, rightMaterial);
      // Slight angle toward the audience so the flats read as staggered wings, not a flat wall.
      left.rotation.y = Math.PI * 0.18;
      right.rotation.y = -Math.PI * 0.18;
      left.position.set(-at3(WING_HOME_X, i), WING_HOME_Y, at3(WING_Z, i));
      right.position.set(at3(WING_HOME_X, i), WING_HOME_Y, at3(WING_Z, i));
      this.group.add(left, right);
      this.wings.push({ left, right });
    }

    const backdropMaterial = materials.paintedFlat(sceneId, 'backdrop');
    backdropMaterial.side = DoubleSide;
    this.ownedMaterials.push(backdropMaterial);
    const backdropGeometry = new PlaneGeometry(7.4, 4.4);
    this.ownedGeometries.push(backdropGeometry);
    this.backdrop = new Mesh(backdropGeometry, backdropMaterial);
    this.backdrop.position.set(0, BACKDROP_HOME_Y, BACKDROP_Z);
    this.group.add(this.backdrop);

    const borderMaterial = materials.paintedFlat(sceneId, 'border');
    borderMaterial.side = DoubleSide;
    this.ownedMaterials.push(borderMaterial);
    const borderGeometry = new PlaneGeometry(7.6, 1.1);
    this.ownedGeometries.push(borderGeometry);
    this.border = new Mesh(borderGeometry, borderMaterial);
    this.border.position.set(0, BORDER_HOME_Y, -0.4);
    this.border.rotation.x = Math.PI * 0.06;
    this.group.add(this.border);

    for (let i = 0; i < 3; i += 1) {
      const prop = buildForegroundProp(sceneId, i, materials, this.ownedGeometries, this.ownedMaterials);
      prop.position.set((i - 1) * 0.9, at3(FOREGROUND_HOME_Y, i), at3(FOREGROUND_Z, i));
      this.group.add(prop);
      this.foreground.push(prop);
    }
  }

  /** Drives this world as the transform's `from` scene (exits as p increases). */
  updateAsOld(derived: TransformDerivedState): void {
    for (let i = 0; i < this.wings.length; i += 1) {
      const wing = this.wings[i];
      const pair = derived.oldWingPairs[i];
      if (!wing || !pair) continue;
      const travel = pair.localProgress * WING_EXIT_TRAVEL;
      const z = at3(WING_Z, i) - pair.zOffset - WING_ROLE_Z_BIAS;
      wing.left.position.x = -(at3(WING_HOME_X, i) + travel);
      wing.right.position.x = at3(WING_HOME_X, i) + travel;
      wing.left.position.z = z;
      wing.right.position.z = z;
      const visible = pair.localProgress < 0.999;
      wing.left.visible = visible;
      wing.right.visible = visible;
    }

    const b = derived.backdropProgress;
    this.backdrop.position.y = lerp(BACKDROP_HOME_Y, BACKDROP_HOME_Y + 2.6, b);
    this.backdrop.scale.y = 1 - b * 0.9;
    this.backdrop.visible = b < 0.999;

    this.border.position.y = lerp(BORDER_HOME_Y, BORDER_HIDE_Y, b);
    this.border.visible = b < 0.999;

    for (let i = 0; i < this.foreground.length; i += 1) {
      const prop = this.foreground[i];
      if (!prop) continue;
      const p = derived.foregroundOldProgress;
      prop.position.y = lerp(at3(FOREGROUND_HOME_Y, i), FOREGROUND_HIDE_DEPTH, p);
      prop.visible = p < 0.999;
    }
  }

  /** Drives this world as the transform's `to` scene (enters as p increases). */
  updateAsNew(derived: TransformDerivedState): void {
    for (let i = 0; i < this.wings.length; i += 1) {
      const wing = this.wings[i];
      const pair = derived.newWingPairs[i];
      if (!wing || !pair) continue;
      const travel = (1 - pair.localProgress) * WING_EXIT_TRAVEL;
      const z = at3(WING_Z, i) - pair.zOffset + WING_ROLE_Z_BIAS;
      wing.left.position.x = -(at3(WING_HOME_X, i) + travel);
      wing.right.position.x = at3(WING_HOME_X, i) + travel;
      wing.left.position.z = z;
      wing.right.position.z = z;
      const visible = pair.localProgress > 0.001;
      wing.left.visible = visible;
      wing.right.visible = visible;
    }

    const b = derived.backdropProgress;
    this.backdrop.position.y = lerp(BACKDROP_HIDE_Y, BACKDROP_HOME_Y, b);
    this.backdrop.scale.y = 0.1 + b * 0.9;
    this.backdrop.visible = b > 0.001;

    this.border.position.y = lerp(BORDER_HIDE_Y, BORDER_HOME_Y, b);
    this.border.visible = b > 0.001;

    for (let i = 0; i < this.foreground.length; i += 1) {
      const prop = this.foreground[i];
      if (!prop) continue;
      const p = derived.foregroundNewProgress;
      prop.position.y = lerp(FOREGROUND_HIDE_DEPTH, at3(FOREGROUND_HOME_Y, i), p);
      prop.visible = p > 0.001;
    }
  }

  /** Neither `from` nor `to` right now (third, dormant scene): hide everything, zero draw cost. */
  setFullyHidden(): void {
    for (const wing of this.wings) {
      wing.left.visible = false;
      wing.right.visible = false;
    }
    this.backdrop.visible = false;
    this.border.visible = false;
    for (const prop of this.foreground) prop.visible = false;
  }

  applyQuality(_tier: QualityTier): void {
    // Geometry is already minimal (planes + single low-poly primitives); nothing to downgrade.
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.group.clear();
  }

  get id(): SceneId {
    return this.sceneId;
  }
}

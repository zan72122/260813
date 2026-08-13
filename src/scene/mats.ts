import * as THREE from 'three';
import { matMarkerPosition } from '../game/fsm.ts';
import type { MatDef, SeedConfig } from '../game/types.ts';
import { vec2ToWorld } from './constants.ts';
import { mergeGeometries, roundedBoxGeometry } from './geometry.ts';
import { createFabricWeaveTexture } from './materials/textures.ts';
import { PALETTE } from './palette.ts';
import { Easing, TweenManager } from './tween.ts';

export const MAT_STACK_POS = new THREE.Vector3(0, 0, -1.0);
const ROLL_RADIUS = 0.045;
const MAT_WIDTH = 0.4;
const MAT_MAX_LEN = 0.62;

// B7 fix (fix-round-1): shared, module-level (fixed params, not seed-dependent).
const MAT_WEAVE_TEX = createFabricWeaveTexture(0xffffff, 256, 88);

// M10 fix (fix-round-1): reused scratch objects for the per-frame matrix
// updates below (updateRollMatrix/updateFlatMatrix/updateBeddingMatrix run
// every frame during a drag/unroll swipe) — mutated in place instead of
// allocating a new Vector3/Quaternion/Vector3 on every call.
const SCRATCH_POS = new THREE.Vector3();
const IDENTITY_QUAT = new THREE.Quaternion();
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const SCRATCH_SCALE = new THREE.Vector3();

export interface MatVisual {
  id: string;
  def: MatDef;
  index: number;
  marker: THREE.Vector3;
  proxy: THREE.Mesh;
  placed: boolean;
  carryPos: THREE.Vector3;
  unroll: number;
  beddingVisible: boolean;
}

export class MatSystem {
  readonly group = new THREE.Group();
  readonly mats = new Map<string, MatVisual>();
  readonly proxyToId = new Map<THREE.Object3D, string>();
  private rollMesh: THREE.InstancedMesh;
  private flatMesh: THREE.InstancedMesh;
  private beddingMesh: THREE.InstancedMesh;
  private tweens: TweenManager;
  private m = new THREE.Matrix4();

  constructor(seedConfig: SeedConfig, tweens: TweenManager) {
    this.tweens = tweens;
    const weaveTex = MAT_WEAVE_TEX;

    const rollGeo = new THREE.CylinderGeometry(ROLL_RADIUS, ROLL_RADIUS, MAT_WIDTH, 14);
    rollGeo.rotateX(Math.PI / 2);
    const rollMat = new THREE.MeshStandardMaterial({ map: weaveTex, roughness: 0.85 });
    this.rollMesh = new THREE.InstancedMesh(rollGeo, rollMat, seedConfig.mats.length);

    const flatGeo = new THREE.PlaneGeometry(1, MAT_WIDTH);
    flatGeo.rotateX(-Math.PI / 2);
    flatGeo.translate(0.5, 0, 0);
    const flatMat = new THREE.MeshStandardMaterial({ map: weaveTex, roughness: 0.85, side: THREE.DoubleSide });
    this.flatMesh = new THREE.InstancedMesh(flatGeo, flatMat, seedConfig.mats.length);

    const beddingParts: THREE.BufferGeometry[] = [];
    const blanket = roundedBoxGeometry({ width: 0.3, height: 0.02, depth: 0.28, cornerRadius: 0.03, bevelSize: 0.008 });
    blanket.translate(0.12, 0.01, 0);
    beddingParts.push(blanket);
    const pillow = roundedBoxGeometry({ width: 0.14, height: 0.035, depth: 0.1, cornerRadius: 0.02, bevelSize: 0.012 });
    pillow.translate(-0.2, 0.025, 0);
    beddingParts.push(pillow);
    const beddingGeo = mergeGeometries(beddingParts);
    const beddingMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    this.beddingMesh = new THREE.InstancedMesh(beddingGeo, beddingMat, seedConfig.mats.length);

    this.group.add(this.rollMesh, this.flatMesh, this.beddingMesh);

    seedConfig.mats.forEach((def, index) => {
      const visual = this.buildMat(def, index, seedConfig.mats.length);
      this.mats.set(def.id, visual);
      this.proxyToId.set(visual.proxy, def.id);
      this.group.add(visual.proxy);
    });

    if (this.rollMesh.instanceColor) this.rollMesh.instanceColor.needsUpdate = true;
    if (this.flatMesh.instanceColor) this.flatMesh.instanceColor.needsUpdate = true;
    if (this.beddingMesh.instanceColor) this.beddingMesh.instanceColor.needsUpdate = true;
  }

  private buildMat(def: MatDef, index: number, total: number): MatVisual {
    const marker = vec2ToWorld(matMarkerPosition(def.markerIndex));
    const stackPos = MAT_STACK_POS.clone();
    stackPos.z += (index - (total - 1) / 2) * 0.34;
    const color = new THREE.Color(PALETTE.matColorways[def.colorway % PALETTE.matColorways.length]!);

    this.rollMesh.setColorAt(index, color);
    this.flatMesh.setColorAt(index, color);
    this.beddingMesh.setColorAt(index, color.clone().lerp(new THREE.Color(0xffffff), 0.35));

    this.updateRollMatrix(index, stackPos, 0.02);
    this.updateFlatMatrix(index, stackPos, 0);
    this.updateBeddingMatrix(index, marker, 0);

    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial());
    proxy.visible = false;
    proxy.position.copy(stackPos);
    proxy.position.y = 0.05;

    return {
      id: def.id,
      def,
      index,
      marker,
      proxy,
      placed: false,
      carryPos: stackPos.clone(),
      unroll: 0,
      beddingVisible: false,
    };
  }

  private updateRollMatrix(index: number, anchor: THREE.Vector3, unroll: number): void {
    SCRATCH_POS.set(anchor.x + unroll * MAT_MAX_LEN, ROLL_RADIUS, anchor.z);
    this.m.compose(SCRATCH_POS, IDENTITY_QUAT, UNIT_SCALE);
    this.rollMesh.setMatrixAt(index, this.m);
    this.rollMesh.instanceMatrix.needsUpdate = true;
  }

  private updateFlatMatrix(index: number, anchor: THREE.Vector3, unroll: number): void {
    SCRATCH_POS.set(anchor.x, 0.003, anchor.z);
    SCRATCH_SCALE.set(Math.max(unroll, 0.0001), 1, 1);
    this.m.compose(SCRATCH_POS, IDENTITY_QUAT, SCRATCH_SCALE);
    this.flatMesh.setMatrixAt(index, this.m);
    this.flatMesh.instanceMatrix.needsUpdate = true;
  }

  private updateBeddingMatrix(index: number, anchor: THREE.Vector3, scale: number): void {
    SCRATCH_POS.set(anchor.x + MAT_MAX_LEN * 0.5, 0.006, anchor.z);
    SCRATCH_SCALE.set(scale, scale, scale);
    this.m.compose(SCRATCH_POS, IDENTITY_QUAT, SCRATCH_SCALE);
    this.beddingMesh.setMatrixAt(index, this.m);
    this.beddingMesh.instanceMatrix.needsUpdate = true;
  }

  worldPositionOf(id: string): THREE.Vector3 {
    return this.mats.get(id)!.proxy.position.clone();
  }

  markerWorldPosition(id: string): THREE.Vector3 {
    return this.mats.get(id)!.marker.clone();
  }

  isPlaced(id: string): boolean {
    return this.mats.get(id)?.placed ?? false;
  }

  /** During drag (before placement): moves the whole rolled mat freely. */
  setCarryPosition(id: string, x: number, z: number): void {
    const v = this.mats.get(id);
    if (!v) return;
    v.carryPos.set(x, 0, z);
    v.proxy.position.set(x, 0.05, z);
    this.updateRollMatrix(v.index, v.carryPos, 0);
  }

  /** Snaps the mat onto its marker (arc + soft bounce), after which it becomes swipeable in place. */
  playPlaceSnap(id: string, onDone?: () => void): void {
    const v = this.mats.get(id);
    if (!v) return;
    const start = v.carryPos.clone();
    this.tweens.add(
      0.3,
      Easing.cubicOut,
      (p) => {
        const pos = start.clone().lerp(v.marker, p);
        this.updateRollMatrix(v.index, pos, 0);
        v.proxy.position.set(pos.x, 0.05, pos.z);
      },
      () => {
        v.placed = true;
        v.carryPos.copy(v.marker);
        onDone?.();
      },
    );
  }

  /** Free-play convenience: instantly places, unrolls, and beds a mat with no animation/interaction required. */
  setStateInstant(id: string, placed: boolean, unroll: number, bedding: boolean): void {
    const v = this.mats.get(id);
    if (!v) return;
    v.placed = placed;
    v.carryPos.copy(placed ? v.marker : v.carryPos);
    v.unroll = unroll;
    this.updateRollMatrix(v.index, v.marker, unroll);
    this.updateFlatMatrix(v.index, v.marker, unroll);
    v.proxy.position.set(v.marker.x + unroll * MAT_MAX_LEN, 0.05, v.marker.z);
    v.beddingVisible = bedding;
    this.updateBeddingMatrix(v.index, v.marker, bedding ? 1 : 0);
  }

  /** Directly sets unroll progress from swipe distance — scrubs live, not fire-and-forget. */
  setUnrollProgress(id: string, progress: number): void {
    const v = this.mats.get(id);
    if (!v) return;
    const clamped = THREE.MathUtils.clamp(progress, 0, 1);
    v.unroll = clamped;
    this.updateRollMatrix(v.index, v.marker, clamped);
    this.updateFlatMatrix(v.index, v.marker, clamped);
    // Keep the invisible pick proxy glued to the roll cylinder's current leading edge
    // so the player can always grab it wherever it visually is (mid-unroll or fully out).
    v.proxy.position.set(v.marker.x + clamped * MAT_MAX_LEN, 0.05, v.marker.z);
  }

  showBedding(id: string): void {
    const v = this.mats.get(id);
    if (!v || v.beddingVisible) return;
    v.beddingVisible = true;
    this.tweens.add(0.35, Easing.backOut, (p) => {
      this.updateBeddingMatrix(v.index, v.marker, p);
    });
  }

  /** Reverse of unroll for WAKE_RESTORE: rolls back up, faster, then hops to the shelf. */
  rollBackUp(id: string, onDone?: () => void): void {
    const v = this.mats.get(id);
    if (!v) return;
    if (v.beddingVisible) {
      v.beddingVisible = false;
      this.tweens.add(0.2, Easing.cubicOut, (p) => this.updateBeddingMatrix(v.index, v.marker, 1 - p));
    }
    this.tweens.add(
      0.4,
      Easing.cubicInOut,
      (p) => {
        const remaining = 1 - p;
        v.unroll = remaining;
        this.updateRollMatrix(v.index, v.marker, remaining);
        this.updateFlatMatrix(v.index, v.marker, remaining);
      },
      () => {
        v.placed = false;
        onDone?.();
      },
    );
  }

  hopToShelf(id: string, shelfIndex: number, onDone?: () => void): void {
    const v = this.mats.get(id);
    if (!v) return;
    const start = v.marker.clone();
    const target = MAT_STACK_POS.clone();
    target.z += (shelfIndex - 1.5) * 0.16;
    this.tweens.add(
      0.45,
      Easing.backOut,
      (p) => {
        SCRATCH_POS.lerpVectors(start, target, p);
        const hop = Math.sin(Math.PI * p) * 0.25;
        SCRATCH_POS.y = ROLL_RADIUS + hop;
        this.m.compose(SCRATCH_POS, IDENTITY_QUAT, UNIT_SCALE);
        this.rollMesh.setMatrixAt(v.index, this.m);
        this.rollMesh.instanceMatrix.needsUpdate = true;
        v.proxy.position.set(SCRATCH_POS.x, 0.05, SCRATCH_POS.z);
      },
      () => {
        v.carryPos.copy(target);
        onDone?.();
      },
    );
  }

  /**
   * B7 fix (fix-round-1): disposes the instanced roll/flat/bedding geometries
   * + materials and every mat's proxy — leaving the shared module-level
   * MAT_WEAVE_TEX texture untouched. Call this on the OLD MatSystem before
   * building a new one for a reshuffled seed.
   */
  dispose(): void {
    this.rollMesh.geometry.dispose();
    (this.rollMesh.material as THREE.Material).dispose();
    this.flatMesh.geometry.dispose();
    (this.flatMesh.material as THREE.Material).dispose();
    this.beddingMesh.geometry.dispose();
    (this.beddingMesh.material as THREE.Material).dispose();
    for (const v of this.mats.values()) {
      v.proxy.geometry.dispose();
      (v.proxy.material as THREE.Material).dispose();
    }
    this.mats.clear();
    this.proxyToId.clear();
  }
}

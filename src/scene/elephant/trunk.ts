// 鼻(trunk): 頭部付け根→鼻先のテーパー付きチューブをSkinnedMesh+9ボーンで駆動する。
// setTarget()で与えた目標へ、根本から目標までのCatmull-Romスプライン(重力たわみ+seedノイズ揺らぎを
// 中間制御点に加えたもの)にボーンを沿わせる(aim-chain FK)。目標追従は1次遅れでなまし、静止時は
// 自然な垂れ下がりカーブへ、移動中は軽くスイングする。curl(0..1)で鼻先の「指」を巻き込む。
import * as THREE from "three";
import type { Rng } from "../../core/types";
import { standardMaterial } from "../environment/proc";
import { paintGradientAlongY } from "./proc";

export const TRUNK_ROOT_RADIUS = 0.34;
export const TRUNK_TIP_RADIUS = 0.13;
export const TRUNK_LENGTH = 1.55;
export const TRUNK_BONE_COUNT = 9; // 8-10本

const RADIAL_SEGMENTS = 8;
const RINGS_PER_BONE = 3;

const SKIN_COLOR = new THREE.Color("#8d8681");
const BLUSH_COLOR = new THREE.Color("#c9a8a0");

export interface TrunkSetTargetOptions {
  /** 0..1。1に近いほど鼻先を強く巻き込む。省略時は変更しない。 */
  curl?: number;
  /** trueなら平滑化をスキップし即座にその姿勢へ(QA/テスト向け)。 */
  instant?: boolean;
}

export interface TrunkOptions {
  rng: Rng;
}

function buildTrunkGeometry(): THREE.BufferGeometry {
  const totalRings = TRUNK_BONE_COUNT * RINGS_PER_BONE;
  const boneLen = TRUNK_LENGTH / TRUNK_BONE_COUNT;
  const positions: number[] = [];
  const uvs: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const ringVerts: number[][] = [];

  for (let r = 0; r <= totalRings; r++) {
    const t = r / totalRings;
    const y = t * TRUNK_LENGTH;
    const ease = 1 - Math.pow(1 - t, 1.4);
    const radius = THREE.MathUtils.lerp(TRUNK_ROOT_RADIUS, TRUNK_TIP_RADIUS, ease);
    const row: number[] = [];
    for (let s = 0; s <= RADIAL_SEGMENTS; s++) {
      const theta = (s / RADIAL_SEGMENTS) * Math.PI * 2;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      row.push(positions.length / 3);
      positions.push(x, y, z);
      uvs.push(s / RADIAL_SEGMENTS, t);

      const boneF = THREE.MathUtils.clamp(y / boneLen, 0, TRUNK_BONE_COUNT - 1e-4);
      const boneA = Math.min(TRUNK_BONE_COUNT - 1, Math.floor(boneF));
      const boneB = Math.min(TRUNK_BONE_COUNT - 1, boneA + 1);
      const w = boneF - boneA;
      skinIndices.push(boneA, boneB, 0, 0);
      skinWeights.push(1 - w, w, 0, 0);
    }
    ringVerts.push(row);
  }

  const indices: number[] = [];
  for (let r = 0; r < totalRings; r++) {
    const rowA = ringVerts[r];
    const rowB = ringVerts[r + 1];
    if (!rowA || !rowB) continue;
    for (let s = 0; s < RADIAL_SEGMENTS; s++) {
      const a = rowA[s];
      const b = rowA[s + 1];
      const c = rowB[s];
      const d = rowB[s + 1];
      if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBones(): THREE.Bone[] {
  const boneLen = TRUNK_LENGTH / TRUNK_BONE_COUNT;
  const bones: THREE.Bone[] = [];
  let parent: THREE.Bone | null = null;
  for (let i = 0; i < TRUNK_BONE_COUNT; i++) {
    const bone = new THREE.Bone();
    bone.name = `trunk-bone-${i}`;
    bone.position.set(0, i === 0 ? 0 : boneLen, 0);
    if (parent) parent.add(bone);
    bones.push(bone);
    parent = bone;
  }
  return bones;
}

export class Trunk {
  /** 頭部のtrunkSocketへaddするグループ。 */
  readonly root: THREE.Group;
  private readonly bones: THREE.Bone[];
  private readonly mesh: THREE.SkinnedMesh;
  private readonly finger: THREE.Mesh;
  private readonly rng: Rng;
  private readonly noiseSeed: number;

  private targetLocal: THREE.Vector3;
  private currentTip: THREE.Vector3;
  private hasTarget = false;
  private curl = 0;
  private targetCurl = 0;
  private elapsed = 0;
  private swing = 0;
  private reducedMotion = false;

  constructor(opts: TrunkOptions) {
    this.rng = opts.rng;
    this.noiseSeed = this.rng.range(0, 1000);

    const restPose = this.computeRestPose();
    this.targetLocal = restPose.clone();
    this.currentTip = restPose.clone();

    const geometry = buildTrunkGeometry();
    paintGradientAlongY(geometry, SKIN_COLOR, BLUSH_COLOR, 0.72, () => this.rng.next());
    const material = standardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.mesh = new THREE.SkinnedMesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = "trunk-mesh";

    this.bones = buildBones();
    const skeleton = new THREE.Skeleton(this.bones);
    const rootBone = this.bones[0];
    if (!rootBone) throw new Error("[trunk] bone chain build failed");
    this.mesh.add(rootBone);
    this.mesh.bind(skeleton);

    const fingerGeo = new THREE.SphereGeometry(TRUNK_TIP_RADIUS * 1.05, 10, 8);
    fingerGeo.scale(0.85, 0.6, 1.3);
    fingerGeo.translate(0, 0, TRUNK_TIP_RADIUS * 0.55);
    const fingerColors = new Float32Array(fingerGeo.getAttribute("position").count * 3);
    for (let i = 0; i < fingerColors.length; i += 3) {
      fingerColors[i] = BLUSH_COLOR.r;
      fingerColors[i + 1] = BLUSH_COLOR.g;
      fingerColors[i + 2] = BLUSH_COLOR.b;
    }
    fingerGeo.setAttribute("color", new THREE.BufferAttribute(fingerColors, 3));
    this.finger = new THREE.Mesh(fingerGeo, standardMaterial({ color: 0xffffff, roughness: 0.75 }));
    this.finger.name = "trunk-finger";
    this.finger.rotation.x = Math.PI / 2;
    const lastBone = this.bones[this.bones.length - 1];
    if (!lastBone) throw new Error("[trunk] bone chain missing tip bone");
    lastBone.add(this.finger);

    this.root = new THREE.Group();
    this.root.name = "trunk-root";
    this.root.add(this.mesh);
  }

  private computeRestPose(): THREE.Vector3 {
    return new THREE.Vector3(0, -TRUNK_LENGTH * 0.9, TRUNK_LENGTH * 0.24);
  }

  /** 鼻先の目標をワールド座標で指定。毎フレームこの位置へ滑らかに追従する。 */
  setTarget(worldPos: THREE.Vector3, opts?: TrunkSetTargetOptions): void {
    this.root.updateWorldMatrix(true, false);
    const local = this.root.worldToLocal(worldPos.clone());
    this.targetLocal.copy(local);
    this.hasTarget = true;
    if (opts?.curl !== undefined) this.targetCurl = THREE.MathUtils.clamp(opts.curl, 0, 1);
    if (opts?.instant) {
      this.currentTip.copy(local);
      this.curl = this.targetCurl;
    }
  }

  /** 鼻先の巻き込み量を単独で設定(0..1)。 */
  setCurl(v: number): void {
    this.targetCurl = THREE.MathUtils.clamp(v, 0, 1);
  }

  /** 歩行中のスイング強さ(0..1)。elephant.ts/gait.tsが移動中に大きくする。 */
  setSwing(amount: number): void {
    this.swing = THREE.MathUtils.clamp(amount, 0, 1);
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** 明示的な目標を解除し、自然な垂れ下がりへ戻す。 */
  relax(): void {
    this.hasTarget = false;
    this.targetCurl = 0;
  }

  update(dt: number): void {
    this.elapsed += dt;
    const desired = this.hasTarget ? this.targetLocal : this.computeRestPose();
    const lagK = this.reducedMotion ? 5.5 : 3.0; // 1次遅れ(重さの表現)
    const alpha = THREE.MathUtils.clamp(1 - Math.exp(-lagK * dt), 0, 1);
    this.currentTip.lerp(desired, alpha);
    this.curl += (this.targetCurl - this.curl) * Math.min(1, dt * 5);

    const points = this.buildControlPoints();
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);
    const samples = curve.getPoints(this.bones.length);

    let qCum = new THREE.Quaternion();
    const restDir = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.bones.length; i++) {
      const from = samples[i];
      const to = samples[i + 1];
      const bone = this.bones[i];
      if (!from || !to || !bone) continue;
      const d = to.clone().sub(from);
      if (d.lengthSq() < 1e-10) d.set(0, 1, 0);
      d.normalize();
      const qAbs = new THREE.Quaternion().setFromUnitVectors(restDir, d);
      const qLocal = qCum.clone().invert().multiply(qAbs);
      bone.quaternion.copy(qLocal);
      qCum = qAbs;
    }

    if (this.curl > 0.001) {
      const curlAngle = (this.curl * Math.PI * 0.55) / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), curlAngle);
      for (const bone of this.bones.slice(-2)) bone.quaternion.multiply(q);
    }
  }

  // 中間制御点に重力たわみ(下方向オフセット)+seedノイズ揺らぎ(左右)+移動中のスイングを加える。
  // ボーンは長さ固定のaim-chainで駆動する見た目用の近似(先端が目標を多少行き過ぎる/届かないことが
  // ある)なので、ゲームロジック向けの権威ある鼻先座標はgetTipPosition()側でcurrentTip(1次遅れ後の
  // 目標そのもの)をワールド変換して返す。
  private buildControlPoints(): THREE.Vector3[] {
    const root = new THREE.Vector3(0, 0, 0);
    const tip = this.currentTip.clone();
    const droopBase = this.reducedMotion ? 0.1 : this.hasTarget ? 0.14 : 0.26;
    const wobble = this.reducedMotion ? 0 : 0.035 + this.swing * 0.05;
    const n1 = Math.sin(this.elapsed * 1.7 + this.noiseSeed) * wobble;
    const n2 = Math.cos(this.elapsed * 2.1 + this.noiseSeed * 1.6) * wobble;
    const swingSway = this.reducedMotion ? 0 : Math.sin(this.elapsed * 3.4 + this.noiseSeed) * this.swing * 0.08;
    const mid1 = root
      .clone()
      .lerp(tip, 0.32)
      .add(new THREE.Vector3(n1 + swingSway, -droopBase * 0.55, n2));
    const mid2 = root
      .clone()
      .lerp(tip, 0.68)
      .add(new THREE.Vector3(-n2 * 0.8 + swingSway * 0.6, -droopBase * 0.9, n1 * 0.7));
    return [root, mid1, mid2, tip];
  }

  /** 現在の鼻先ワールド座標。ボーンFKは見た目用の近似(重み付けの都合上わずかに目標を過不足する
   * ことがある)なので、ゲームロジックが参照する権威ある座標は1次遅れ後の目標(currentTip)を
   * そのままワールド変換して返す。 */
  getTipPosition(): THREE.Vector3 {
    return this.root.localToWorld(this.currentTip.clone());
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.finger.geometry.dispose();
    (this.finger.material as THREE.Material).dispose();
  }
}

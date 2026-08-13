// アジアゾウのプロシージャルモデル。LatheGeometry/SphereGeometryを変形+mergeしてなめらかな輪郭を作る
// (角張ったprimitiveの寄せ集めに見せない。スムーズシェーディング必須、ART_DIRECTION.md準拠)。
// 外部モデル/画像テクスチャは一切使わず、頂点色でムラ・桃色の差し色を表現する。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Rng } from "../../core/types";
import { paintVertexAO, roughenGeometry, standardMaterial } from "../environment/proc";
import { addBackArch, addTwinDomeBumps, flattenBelly, paintTwoToneByLocalZ, paintUniform } from "./proc";

export const SKIN_COLOR = new THREE.Color("#8d8681");
export const BLUSH_COLOR = new THREE.Color("#c9a8a0");
const EYE_COLOR = new THREE.Color("#241d18");
const NAIL_COLOR = new THREE.Color("#d9cdbd");

/** 目標の肩高(ワールド単位)。実測bboxから逆算した係数で全体をスケールし、これに正確に合わせる。 */
export const SHOULDER_HEIGHT = 2.6;

const RAW_LEG_LENGTH = 1.3;

export interface LegRig {
  readonly hip: THREE.Group; // 股関節ピボット(前後スイング= rotation.x)
  readonly knee: THREE.Group; // 膝寄りの副ピボット(僅かな持ち上げ)
  readonly front: boolean;
  readonly side: -1 | 1;
  readonly phaseOffset: number; // 対角gaitの位相(rad)
}

export interface ElephantModel {
  readonly group: THREE.Group; // シーンに追加するルート。原点=足裏が接地する高さの基準点
  readonly bodyPivot: THREE.Group; // 呼吸/歩行ボブ・ロールがかかる、全パーツの親
  readonly headGroup: THREE.Group;
  readonly trunkSocket: THREE.Object3D; // Trunk.rootをここへaddする
  readonly legs: readonly LegRig[];
  readonly groundOffset: number; // group原点から足裏までの距離(=脚長×スケール)
  update(dt: number): void;
  setReducedMotion(on: boolean): void;
  setWalking(on: boolean): void;
  dispose(): void;
}

function rngFn(rng: Rng): () => number {
  return () => rng.next();
}

function buildTorsoGeometry(rng: () => number): THREE.BufferGeometry {
  const backR = 0.74;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.03, -1.32),
    new THREE.Vector2(0.32, -1.16),
    new THREE.Vector2(backR * 0.66, -0.86),
    new THREE.Vector2(backR * 0.9, -0.46),
    new THREE.Vector2(backR, 0.0),
    new THREE.Vector2(backR * 0.88, 0.46),
    new THREE.Vector2(backR * 0.62, 0.86),
    new THREE.Vector2(0.34, 1.12),
    new THREE.Vector2(0.15, 1.3)
  ];
  const geo = new THREE.LatheGeometry(profile, 28);
  geo.rotateX(Math.PI / 2);
  addBackArch(geo, { center: 0, halfWidth: 1.35, height: 0.3 });
  flattenBelly(geo, 0.8);
  roughenGeometry(geo, 0.01, rng);
  geo.computeBoundingBox();
  const bb = geo.boundingBox as THREE.Box3;
  geo.translate(0, -bb.min.y, 0);
  geo.computeBoundingBox();
  paintVertexAO(geo, SKIN_COLOR, rng, { aoStrength: 0.16, hueJitter: 0.08 });
  return geo;
}

function buildHeadGeometry(rng: () => number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.72, 26, 18);
  geo.scale(0.94, 1.0, 1.06);
  addTwinDomeBumps(geo, [new THREE.Vector2(-0.27, 0.16), new THREE.Vector2(0.27, 0.16)], {
    yMin: 0.12,
    radius: 0.36,
    strength: 0.2
  });
  roughenGeometry(geo, 0.008, rng);
  paintVertexAO(geo, SKIN_COLOR, rng, { aoStrength: 0.14, hueJitter: 0.07 });
  return geo;
}

function buildEarGeometry(rng: () => number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.44, 3);
  geo.scale(1.0, 1.12, 0.14);
  roughenGeometry(geo, 0.008, rng);
  paintTwoToneByLocalZ(geo, BLUSH_COLOR, SKIN_COLOR, rng, 0.06);
  return geo;
}

function buildLegGeometry(rng: () => number): THREE.BufferGeometry {
  const h = RAW_LEG_LENGTH;
  const topR = 0.3;
  const ankleR = 0.235;
  const footR = 0.31;

  const shin = new THREE.CylinderGeometry(topR, ankleR, h * 0.8, 14, 4);
  shin.translate(0, -h * 0.4, 0);
  roughenGeometry(shin, 0.012, rng);
  paintVertexAO(shin, SKIN_COLOR, rng, { aoStrength: 0.24, hueJitter: 0.06 });

  const footH = h * 0.22;
  const foot = new THREE.CylinderGeometry(footR, footR * 0.9, footH, 16, 2);
  foot.translate(0, -h * 0.8 - footH / 2, 0);
  roughenGeometry(foot, 0.012, rng);
  const footColor = SKIN_COLOR.clone().multiplyScalar(0.93);
  paintVertexAO(foot, footColor, rng, { aoStrength: 0.3, hueJitter: 0.05 });

  const parts: THREE.BufferGeometry[] = [shin, foot];
  for (let i = 0; i < 3; i++) {
    const nail = new THREE.SphereGeometry(0.05, 7, 5);
    nail.scale(1, 0.55, 1.2);
    const ang = (i - 1) * 0.5;
    nail.translate(Math.sin(ang) * footR * 0.68, -h * 0.8 - footH * 0.78, footR * 0.72);
    paintUniform(nail, NAIL_COLOR);
    parts.push(nail);
  }

  const merged = mergeGeometries(parts, false) as THREE.BufferGeometry;
  parts.forEach((g) => g.dispose());
  return merged;
}

function buildTailGeometry(rng: () => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.03, -0.34, -0.05),
    new THREE.Vector3(-0.02, -0.68, -0.02),
    new THREE.Vector3(0.01, -0.95, 0.01)
  ]);
  const tubeIndexed = new THREE.TubeGeometry(curve, 20, 0.045, 7, false);
  roughenGeometry(tubeIndexed, 0.004, rng);
  paintVertexAO(tubeIndexed, SKIN_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.05 });
  // TubeGeometryはindexed、IcosahedronGeometryはnon-indexedなのでmergeGeometriesが失敗する
  // (属性集合が一致しないとnullを返す)。tube側をnon-indexedへ揃える。
  const tube = tubeIndexed.toNonIndexed();
  tubeIndexed.dispose();

  const tuft = new THREE.IcosahedronGeometry(0.075, 1);
  tuft.scale(0.8, 1.3, 0.8);
  tuft.translate(0.01, -1.0, 0.01);
  const tuftColor = SKIN_COLOR.clone().multiplyScalar(0.55);
  paintUniform(tuft, tuftColor);

  const merged = mergeGeometries([tube, tuft], false) as THREE.BufferGeometry;
  tube.dispose();
  tuft.dispose();
  return merged;
}

function buildEyeAssembly(rng: Rng): { pivot: THREE.Group; lid: THREE.Mesh } {
  const pivot = new THREE.Group();
  pivot.name = "eye-pivot";

  const eyeGeo = new THREE.SphereGeometry(0.062, 10, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: EYE_COLOR, roughness: 0.4 });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  pivot.add(eye);

  // まぶた: 上半分の薄いキャップ。ヒンジ(上端)から下向きに垂れて瞬きする。
  const lidGeo = new THREE.SphereGeometry(0.074, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  lidGeo.translate(0, 0.02, 0);
  paintUniform(lidGeo, SKIN_COLOR.clone().lerp(new THREE.Color(0xffffff), rng.range(0, 0.04)));
  const lid = new THREE.Mesh(lidGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  lid.position.set(0, 0.05, 0.01);
  // 常時ややお辞儀した「下がり目」の休止角度。
  lid.rotation.x = -0.75;
  pivot.add(lid);

  return { pivot, lid };
}

interface EarState {
  pivot: THREE.Group;
  baseYaw: number;
  flapPhase: number;
}

interface BlinkState {
  lid: THREE.Mesh;
  timer: number;
  nextBlinkAt: number;
  restAngle: number;
}

export function buildElephantModel(rng: Rng): ElephantModel {
  const modelRng = rngFn(rng);

  const group = new THREE.Group();
  group.name = "elephant";

  const bodyPivot = new THREE.Group();
  bodyPivot.name = "elephant-body-pivot";
  group.add(bodyPivot);

  // ---- 胴体 ----
  const torsoGeo = buildTorsoGeometry(modelRng);
  torsoGeo.computeBoundingBox();
  const torsoBB = torsoGeo.boundingBox as THREE.Box3;
  const torsoHeight = torsoBB.max.y - torsoBB.min.y;
  const rawShoulder = RAW_LEG_LENGTH + torsoHeight;
  const modelScale = SHOULDER_HEIGHT / rawShoulder;

  const buildGroup = new THREE.Group();
  buildGroup.name = "elephant-build";
  buildGroup.scale.setScalar(modelScale);
  bodyPivot.add(buildGroup);

  const torsoMesh = new THREE.Mesh(torsoGeo, standardMaterial({ color: 0xffffff, roughness: 0.92 }));
  torsoMesh.name = "elephant-torso";
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  buildGroup.add(torsoMesh);

  const torsoFrontZ = 1.3;
  const torsoTopY = torsoHeight;

  // ---- 頭部 ----
  const headGroup = new THREE.Group();
  headGroup.name = "elephant-head";
  headGroup.position.set(0, torsoTopY * 0.66, torsoFrontZ + 0.42);
  buildGroup.add(headGroup);

  const headMesh = new THREE.Mesh(buildHeadGeometry(modelRng), standardMaterial({ color: 0xffffff, roughness: 0.9 }));
  headMesh.name = "elephant-head-mesh";
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // 耳(小さめ・丸い、内側に桃色)
  const earGeo = buildEarGeometry(modelRng);
  const earMat = standardMaterial({ color: 0xffffff, roughness: 0.88, side: THREE.DoubleSide });
  const ears: EarState[] = [];
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.name = `elephant-ear-pivot-${side}`;
    pivot.position.set(side * 0.6, 0.08, -0.08);
    const baseYaw = side * 0.62;
    pivot.rotation.set(0.05, baseYaw, side * 0.12);
    const mesh = new THREE.Mesh(earGeo, earMat);
    mesh.castShadow = true;
    pivot.add(mesh);
    headGroup.add(pivot);
    ears.push({ pivot, baseYaw, flapPhase: rng.range(0, Math.PI * 2) });
  }

  // 目(下がり目+まぶた)
  const blinkStates: BlinkState[] = [];
  for (const side of [-1, 1] as const) {
    const { pivot, lid } = buildEyeAssembly(rng);
    pivot.position.set(side * 0.52, 0.06, 0.42);
    pivot.rotation.y = side * 0.35;
    headGroup.add(pivot);
    blinkStates.push({ lid, timer: 0, nextBlinkAt: rng.range(2.2, 5.5), restAngle: -0.75 });
  }

  // 鼻の付け根(Trunkの取り付け位置)
  const trunkSocket = new THREE.Object3D();
  trunkSocket.name = "trunk-socket";
  trunkSocket.position.set(0, -0.22, 0.66);
  headGroup.add(trunkSocket);

  // ---- 脚 ----
  const legGeo = buildLegGeometry(modelRng);
  const legMat = standardMaterial({ color: 0xffffff, roughness: 0.94 });
  const legDefs: Array<{ front: boolean; side: -1 | 1 }> = [
    { front: true, side: -1 },
    { front: true, side: 1 },
    { front: false, side: -1 },
    { front: false, side: 1 }
  ];
  const legs: LegRig[] = legDefs.map((def) => {
    const hip = new THREE.Group();
    hip.name = `elephant-leg-hip-${def.front ? "f" : "r"}${def.side}`;
    hip.position.set(def.side * 0.56, 0, def.front ? 0.78 : -0.78);
    const knee = new THREE.Group();
    knee.name = "elephant-leg-knee";
    const mesh = new THREE.Mesh(legGeo, legMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    knee.add(mesh);
    hip.add(knee);
    buildGroup.add(hip);
    return {
      hip,
      knee,
      front: def.front,
      side: def.side,
      phaseOffset: (def.front ? 0 : Math.PI) + (def.side === 1 ? Math.PI : 0)
    };
  });

  // ---- 尻尾 ----
  const tailPivot = new THREE.Group();
  tailPivot.name = "elephant-tail-pivot";
  tailPivot.position.set(0, torsoTopY * 0.34, -1.3);
  tailPivot.rotation.x = 0.12;
  const tailMesh = new THREE.Mesh(buildTailGeometry(modelRng), standardMaterial({ color: 0xffffff, roughness: 0.9 }));
  tailMesh.castShadow = true;
  tailPivot.add(tailMesh);
  buildGroup.add(tailPivot);

  const groundOffset = RAW_LEG_LENGTH * modelScale;

  let reducedMotion = false;
  let walking = false;
  let elapsed = 0;

  function update(dt: number): void {
    elapsed += dt;
    const motionScale = reducedMotion ? 0.12 : 1;

    // 呼吸(常時、微小)
    const breath = Math.sin(elapsed * 1.4) * 0.01 * motionScale;
    torsoMesh.scale.setScalar(1 + breath);

    // 耳: ゆっくり常時扇ぐ
    for (const ear of ears) {
      const flapSpeed = walking ? 2.1 : 1.1;
      const amp = (walking ? 0.16 : 0.1) * motionScale;
      ear.pivot.rotation.y = ear.baseYaw + Math.sin(elapsed * flapSpeed + ear.flapPhase) * amp;
    }

    // まぶた: 数秒毎に瞬き
    for (const b of blinkStates) {
      b.timer += dt;
      if (b.timer >= b.nextBlinkAt) {
        b.timer = 0;
        b.nextBlinkAt = reducedMotion ? rng.range(6, 10) : rng.range(2.5, 5.7);
      }
      const remain = b.nextBlinkAt - b.timer;
      const blinkWindow = 0.16;
      let closeAmount = 0;
      if (remain < blinkWindow) {
        closeAmount = Math.sin((1 - remain / blinkWindow) * Math.PI);
      }
      b.lid.rotation.x = b.restAngle + closeAmount * 0.85;
    }

    // 尻尾: 常時ゆらゆら(reducedMotion時は最小化)
    const tailAmp = (walking ? 0.22 : 0.12) * motionScale;
    tailPivot.rotation.z = Math.sin(elapsed * (walking ? 2.6 : 1.3)) * tailAmp;
  }

  function setReducedMotion(on: boolean): void {
    reducedMotion = on;
  }

  function setWalking(on: boolean): void {
    walking = on;
  }

  function dispose(): void {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = (obj as THREE.Mesh).material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else if (material) material.dispose();
    });
  }

  return {
    group,
    bodyPivot,
    headGroup,
    trunkSocket,
    legs,
    groundOffset,
    update,
    setReducedMotion,
    setWalking,
    dispose
  };
}

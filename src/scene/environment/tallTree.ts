// 高木(high-branch): 幹+instancing葉群+bone1本で曲げられる「折れる用の枝」。ロープ+吊りフィーダー。
import * as THREE from "three";
import { getSpot } from "../../game/spots";
import { makeLeafCluster, paintVertexAO, roughenGeometry, seededRandom, standardMaterial } from "./proc";

const BARK_COLOR = new THREE.Color("#6b5a42");
const LEAF_COLOR_A = new THREE.Color("#5aa860");
const LEAF_COLOR_B = new THREE.Color("#2e6b45");
const ROPE_COLOR = new THREE.Color("#a68a5c");
const BASKET_COLOR = new THREE.Color("#8a6a3c");

const BRANCH_LENGTH = 2.3;
const BRANCH_ATTACH_Y = 2.7;

export interface TallTree {
  readonly group: THREE.Group;
  /** 固定される付け根ボーン。 */
  readonly branchRootBone: THREE.Bone;
  /** 回転させると枝がしなる/折れる先端ボーン(bone1本)。 */
  readonly branchTipBone: THREE.Bone;
  /** 枝先に掛かる吊りフィーダー(籠)。branchTipBoneの子なので枝と一緒に動く。 */
  readonly feeder: THREE.Object3D;
  readonly leafClusters: THREE.Object3D[];
}

function buildTrunk(rng: () => number): THREE.Mesh {
  const height = 5.2;
  const geo = new THREE.CylinderGeometry(0.22, 0.46, height, 10, 6);
  roughenGeometry(geo, 0.035, rng);
  paintVertexAO(geo, BARK_COLOR, rng, { aoStrength: 0.28, hueJitter: 0.1 });
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.95 }));
  mesh.name = "tall-tree-trunk";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 折れる用の枝: rootBone(固定)→tipBone(回転で曲げる)の2ボーンSkinnedMesh。 */
function buildBendableBranch(rng: () => number): {
  mesh: THREE.SkinnedMesh;
  rootBone: THREE.Bone;
  tipBone: THREE.Bone;
} {
  const segments = 10;
  const geo = new THREE.CylinderGeometry(0.045, 0.11, BRANCH_LENGTH, 7, segments);
  geo.rotateZ(-Math.PI / 2); // Y軸長→X軸長へ(枝の長手方向)
  geo.translate(BRANCH_LENGTH / 2, 0, 0); // x:0(付け根)〜BRANCH_LENGTH(先端)
  roughenGeometry(geo, 0.015, rng);
  paintVertexAO(geo, BARK_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.08 });

  const pos = geo.getAttribute("position");
  const skinIndex = new Float32Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getX(i) / BRANCH_LENGTH, 0, 1);
    skinIndex[i * 4] = 0; // rootBone
    skinIndex[i * 4 + 1] = 1; // tipBone
    skinWeight[i * 4] = 1 - t;
    skinWeight[i * 4 + 1] = t;
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));

  const material = standardMaterial({ color: 0xffffff, roughness: 0.95 });
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.castShadow = true;
  mesh.name = "tall-tree-branch";

  const rootBone = new THREE.Bone();
  rootBone.name = "branch-root-bone";
  rootBone.position.set(0, 0, 0);
  const tipBone = new THREE.Bone();
  tipBone.name = "branch-tip-bone";
  tipBone.position.set(BRANCH_LENGTH, 0, 0);
  rootBone.add(tipBone);

  const skeleton = new THREE.Skeleton([rootBone, tipBone]);
  mesh.add(rootBone);
  mesh.bind(skeleton);

  return { mesh, rootBone, tipBone };
}

function buildFeeder(rng: () => number): THREE.Object3D {
  const pivot = new THREE.Object3D();
  pivot.name = "high-branch-feeder";

  const ropeLen = 0.9;
  const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, ropeLen, 6);
  paintVertexAO(ropeGeo, ROPE_COLOR, rng, { aoStrength: 0.15, hueJitter: 0.06 });
  ropeGeo.translate(0, -ropeLen / 2, 0);
  const rope = new THREE.Mesh(ropeGeo, standardMaterial({ color: 0xffffff, roughness: 1 }));

  const basketGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.26, 10, 2, true);
  paintVertexAO(basketGeo, BASKET_COLOR, rng, { aoStrength: 0.3, hueJitter: 0.12 });
  const basket = new THREE.Mesh(basketGeo, standardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide }));
  basket.position.y = -ropeLen - 0.1;
  basket.castShadow = true;

  const bottomGeo = new THREE.CircleGeometry(0.16, 10);
  paintVertexAO(bottomGeo, BASKET_COLOR, rng, { aoStrength: 0.35, hueJitter: 0.1 });
  const bottom = new THREE.Mesh(bottomGeo, standardMaterial({ color: 0xffffff, roughness: 1 }));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -ropeLen - 0.23;

  pivot.add(rope, basket, bottom);
  return pivot;
}

export function createTallTree(): TallTree {
  const spot = getSpot("high-branch");
  const rng = seededRandom(7373);
  const group = new THREE.Group();
  group.name = "tall-tree";

  group.add(buildTrunk(rng));

  const canopy = makeLeafCluster(rng, new THREE.Vector3(0, 4.6, 0), 1.6, 34, LEAF_COLOR_A, LEAF_COLOR_B);
  canopy.name = "tall-tree-canopy";
  group.add(canopy);

  const { mesh: branchMesh, rootBone, tipBone } = buildBendableBranch(rng);
  // 幹から外側(放飼場中心の反対方向、かつやや上向き)へ張り出す。
  // 枝メッシュの長手方向はローカル+X軸なので、+Xを目標方向へ向けるquaternionを直接組み立てる
  // (lookAtは-Zを向ける仕様のため、+X長手のメッシュには使えない)。
  const outward = new THREE.Vector3(spot.position.x, 0, spot.position.z).normalize();
  const branchDir = new THREE.Vector3(outward.x, 0.42, outward.z).normalize();
  const branchPivot = new THREE.Object3D();
  branchPivot.position.set(0, BRANCH_ATTACH_Y, 0);
  branchPivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), branchDir);
  branchPivot.add(branchMesh);
  group.add(branchPivot);

  // tipBoneはbranchMeshの先端そのものが原点(親rootBoneからBRANCH_LENGTH離れた位置)なので、
  // 子要素へのオフセットはtipBone自身からの微小な相対値でよい。
  const branchLeaves = makeLeafCluster(rng, new THREE.Vector3(0.05, 0.05, 0), 0.45, 14, LEAF_COLOR_A, LEAF_COLOR_B);
  branchLeaves.name = "tall-tree-branch-leaves";
  tipBone.add(branchLeaves);

  const feeder = buildFeeder(rng);
  feeder.position.set(0, -0.02, 0);
  tipBone.add(feeder);

  group.position.set(spot.position.x, 0, spot.position.z);

  return { group, branchRootBone: rootBone, branchTipBone: tipBone, feeder, leafClusters: [canopy, branchLeaves] };
}

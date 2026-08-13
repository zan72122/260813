// 5種の餌メッシュ生成。全てコード生成ジオメトリ+頂点色。banana-stemは外層3-4枚を別メッシュにして
// S3bが剥がすアニメを実装できるようにする(userData.layersに保持)。
import * as THREE from "three";
import type { FoodKind } from "../../core/types";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const CARROT_COLOR = new THREE.Color("#e8934a");
const CARROT_TOP_COLOR = new THREE.Color("#5aa860");
const PUMPKIN_COLOR = new THREE.Color("#d97b3a");
const HAY_COLOR = new THREE.Color("#e3c876");
const HAY_BAND_COLOR = new THREE.Color("#a87f3a");
const BANANA_OUTER = new THREE.Color("#b8d48e");
const BANANA_INNER = new THREE.Color("#f2ecd4");
const BRANCH_COLOR = new THREE.Color("#7a9a5a");
const BRANCH_LEAF_COLOR = new THREE.Color("#5aa860");
const GRASS_COLOR = new THREE.Color("#5aa860");
const GRASS_BAND_COLOR = new THREE.Color("#7a5628");

function mesh(geo: THREE.BufferGeometry, color: THREE.Color, rng: () => number, opts?: { ao?: number; hue?: number }): THREE.Mesh {
  paintVertexAO(geo, color, rng, { aoStrength: opts?.ao ?? 0.22, hueJitter: opts?.hue ?? 0.08 });
  const m = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function createVegetable(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = "food-vegetable";

  // にんじん: テーパーする円柱+葉
  const carrotGeo = new THREE.CylinderGeometry(0.02, 0.09, 0.32, 8, 3);
  carrotGeo.rotateZ(Math.PI);
  const carrot = mesh(carrotGeo, CARROT_COLOR, rng, { ao: 0.18, hue: 0.06 });
  carrot.position.set(-0.08, 0.16, 0);
  carrot.rotation.z = 0.25;
  group.add(carrot);

  const leafGeo = new THREE.ConeGeometry(0.05, 0.14, 6);
  const leaf = mesh(leafGeo, CARROT_TOP_COLOR, rng, { ao: 0.15, hue: 0.1 });
  leaf.position.set(-0.14, 0.34, 0);
  leaf.rotation.z = 0.25;
  group.add(leaf);

  // かぼちゃ風の丸い実(横に添える)
  const pumpkinGeo = new THREE.SphereGeometry(0.14, 10, 8);
  pumpkinGeo.scale(1, 0.82, 1);
  const pumpkin = mesh(pumpkinGeo, PUMPKIN_COLOR, rng, { ao: 0.2, hue: 0.08 });
  pumpkin.position.set(0.15, 0.115, 0.02);
  group.add(pumpkin);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.06, 6);
  const stem = mesh(stemGeo, CARROT_TOP_COLOR, rng, { ao: 0.1, hue: 0.05 });
  stem.position.set(0.15, 0.23, 0.02);
  group.add(stem);

  return group;
}

function createHayCube(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = "food-hay-cube";

  const coreGeo = new THREE.BoxGeometry(0.32, 0.24, 0.28, 2, 2, 2);
  const core = mesh(coreGeo, HAY_COLOR, rng, { ao: 0.28, hue: 0.12 });
  group.add(core);

  // 束の質感: 端からはみ出す細い干し草をInstancedMeshで少量。
  const strawGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4);
  const strawMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const count = 22;
  const straws = new THREE.InstancedMesh(strawGeo, strawMat, count);
  straws.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    dummy.position.set((rng() - 0.5) * 0.34, (rng() - 0.5) * 0.22, (rng() - 0.5) * 0.3);
    dummy.rotation.set((rng() - 0.5) * 0.6, rng() * Math.PI, Math.PI / 2 + (rng() - 0.5) * 0.5);
    dummy.updateMatrix();
    straws.setMatrixAt(i, dummy.matrix);
    col.copy(HAY_COLOR).offsetHSL(0, 0, (rng() - 0.5) * 0.1);
    straws.setColorAt(i, col);
  }
  straws.instanceMatrix.needsUpdate = true;
  group.add(straws);

  // 縛り帯2本
  for (const bx of [-0.08, 0.08]) {
    const bandGeo = new THREE.BoxGeometry(0.03, 0.26, 0.3);
    const band = mesh(bandGeo, HAY_BAND_COLOR, rng, { ao: 0.15, hue: 0.04 });
    band.position.x = bx;
    group.add(band);
  }

  return group;
}

export interface BananaStem {
  group: THREE.Group;
  core: THREE.Mesh;
  /** 外層(剥がせる層)。手前=外側から順に並ぶ。S3bのpeel-banana行動が1枚ずつ非表示/分離させる。 */
  layers: THREE.Mesh[];
}

function createBananaStemImpl(rng: () => number): BananaStem {
  const group = new THREE.Group();
  group.name = "food-banana-stem";
  const height = 0.34;

  const coreGeo = new THREE.CylinderGeometry(0.055, 0.065, height, 10, 3);
  const core = mesh(coreGeo, BANANA_INNER, rng, { ao: 0.15, hue: 0.04 });
  core.name = "banana-core";
  group.add(core);

  const layers: THREE.Mesh[] = [];
  const layerCount = 4;
  for (let i = 0; i < layerCount; i++) {
    const t = i / layerCount; // 0=最外層
    const rOuter = 0.07 + (layerCount - i) * 0.018;
    const geo = new THREE.CylinderGeometry(rOuter, rOuter + 0.008, height - t * 0.02, 12, 2, true);
    const color = BANANA_OUTER.clone().lerp(BANANA_INNER, t * 0.35);
    const layer = mesh(geo, color, rng, { ao: 0.18, hue: 0.05 });
    (layer.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    layer.name = `banana-layer-${i}`;
    layer.userData.peeled = false;
    group.add(layer);
    layers.push(layer);
  }

  return { group, core, layers };
}

function createBranch(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = "food-branch";

  const stickGeo = new THREE.CylinderGeometry(0.02, 0.028, 0.42, 7, 3);
  stickGeo.rotateZ(Math.PI / 2.4);
  const stick = mesh(stickGeo, BRANCH_COLOR, rng, { ao: 0.2, hue: 0.08 });
  group.add(stick);

  const leafGeo = new THREE.ConeGeometry(0.045, 0.13, 5);
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const leaf = mesh(leafGeo.clone(), BRANCH_LEAF_COLOR, rng, { ao: 0.15, hue: 0.1 });
    leaf.position.set((t - 0.5) * 0.36, 0.06 + (i % 2) * 0.02, 0);
    leaf.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.9;
    leaf.rotation.x = Math.PI;
    group.add(leaf);
  }
  leafGeo.dispose();

  return group;
}

function createGrass(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = "food-grass";

  const bladeCount = 16;
  for (let i = 0; i < bladeCount; i++) {
    const h = 0.22 + rng() * 0.14;
    const geo = new THREE.ConeGeometry(0.012 + rng() * 0.006, h, 4);
    const blade = mesh(geo, GRASS_COLOR, rng, { ao: 0.12, hue: 0.12 });
    const ang = rng() * Math.PI * 2;
    const r = rng() * 0.06;
    blade.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
    blade.rotation.z = (rng() - 0.5) * 0.5;
    blade.rotation.x = (rng() - 0.5) * 0.5;
    group.add(blade);
  }
  const bandGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10, 1, true);
  const band = mesh(bandGeo, GRASS_BAND_COLOR, rng, { ao: 0.1, hue: 0.04 });
  band.position.y = 0.05;
  group.add(band);

  return group;
}

/** 汎用ファクトリ。banana-stemの層情報が必要な場合はcreateBananaStem()を直接使う。 */
export function createFoodMesh(kind: FoodKind, seed = 0): THREE.Group {
  const rng = seededRandom(1000 + seed * 37);
  switch (kind) {
    case "vegetable":
      return createVegetable(rng);
    case "hay-cube":
      return createHayCube(rng);
    case "banana-stem":
      return createBananaStemImpl(rng).group;
    case "branch":
      return createBranch(rng);
    case "grass":
      return createGrass(rng);
  }
}

export function createBananaStem(seed = 0): BananaStem {
  return createBananaStemImpl(seededRandom(2000 + seed * 37));
}

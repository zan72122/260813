// -Z奥の飼育舎壁+大きな引き戸ゲート。厚みのある壁+柱+寄棟屋根で建物として成立させる。
// gateDoorをexportし、world.tsのopenGate()でスライド開閉する。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const WALL_COLOR = new THREE.Color("#e0d3bd");
const DOOR_COLOR = new THREE.Color("#8a6a44");
const FRAME_COLOR = new THREE.Color("#5c4a34");
const ROOF_COLOR = new THREE.Color("#a8503a"); // 赤瓦風

const GATE_Z = -12.6;
const WALL_WIDTH = 8;
const WALL_HEIGHT = 3.2;
const WALL_DEPTH = 0.7; // 厚み(旧0.5から増やし奥行を出す)
const DOOR_WIDTH = 3.2;
const EAVE_OVERHANG = 0.6;
const ROOF_HEIGHT = 1.4;

export interface Gate {
  readonly group: THREE.Group;
  /** 引き戸本体。openGate()アニメで+X方向へスライドさせる。 */
  readonly gateDoor: THREE.Object3D;
  readonly doorOpenX: number;
}

// 寄棟屋根: CylinderGeometry(radialSegments=4)は正方形断面のピラミッド/frustumになる。
// 45度回転して面をX/Z軸に揃え、XZを非一様スケールして矩形棟に仕上げる(1メッシュ・依存追加なし)。
function buildHipRoof(rng: () => number): THREE.Mesh {
  const baseHalfW = WALL_WIDTH / 2 + EAVE_OVERHANG;
  const baseHalfD = WALL_DEPTH / 2 + EAVE_OVERHANG;
  // 正方形断面の四角錐台(topRadiusを小さく残して完全な尖りを避け、棟のボリューム感を出す)。
  const geo = new THREE.CylinderGeometry(0.35, Math.SQRT2, ROOF_HEIGHT, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale(baseHalfW, 1, baseHalfD);
  paintVertexAO(geo, ROOF_COLOR, rng, { aoStrength: 0.22, hueJitter: 0.08 });
  const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.8 }));
  mesh.name = "gate-roof";
  mesh.position.set(0, WALL_HEIGHT + ROOF_HEIGHT / 2, GATE_Z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// 四隅+中間の柱(壁面よりわずかに+Z側へ張り出させて陰影で奥行を出す)。
function buildPillars(rng: () => number): THREE.Mesh {
  const xs = [-WALL_WIDTH / 2, -DOOR_WIDTH / 2, DOOR_WIDTH / 2, WALL_WIDTH / 2];
  const geoms: THREE.BufferGeometry[] = [];
  for (const x of xs) {
    const geo = new THREE.BoxGeometry(0.26, WALL_HEIGHT + 0.1, 0.32);
    paintVertexAO(geo, FRAME_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.05 });
    geo.translate(x, (WALL_HEIGHT + 0.1) / 2, GATE_Z + WALL_DEPTH / 2 + 0.05);
    geoms.push(geo);
  }
  const merged = mergeGeometries(geoms, false) as THREE.BufferGeometry;
  geoms.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  mesh.name = "gate-pillars";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createGate(): Gate {
  const rng = seededRandom(2020);
  const group = new THREE.Group();
  group.name = "gate";

  // 飼育舎の壁(左右2枚、中央は戸口として開けておく)。厚みWALL_DEPTHで箱として成立させる。
  const sideWidth = (WALL_WIDTH - DOOR_WIDTH) / 2;
  for (const side of [-1, 1] as const) {
    const geo = new THREE.BoxGeometry(sideWidth, WALL_HEIGHT, WALL_DEPTH, 2, 2, 2);
    paintVertexAO(geo, WALL_COLOR, rng, { aoStrength: 0.18, hueJitter: 0.06 });
    const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.9 }));
    mesh.position.set(side * (DOOR_WIDTH / 2 + sideWidth / 2), WALL_HEIGHT / 2, GATE_Z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // 屋根まぐさ(戸口の上、壁と一体で高さを揃える)。
  const lintelGeo = new THREE.BoxGeometry(WALL_WIDTH, 0.45, WALL_DEPTH);
  paintVertexAO(lintelGeo, FRAME_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.05 });
  const lintel = new THREE.Mesh(lintelGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  lintel.position.set(0, WALL_HEIGHT - 0.225, GATE_Z);
  lintel.castShadow = true;
  group.add(lintel);

  group.add(buildPillars(seededRandom(2021)));
  group.add(buildHipRoof(seededRandom(2022)));

  // 引き戸本体: 木の縦板を並べた大きな戸。
  const doorGroup = new THREE.Group();
  doorGroup.name = "gate-door";
  const slats = 6;
  const slatW = DOOR_WIDTH / slats;
  for (let i = 0; i < slats; i++) {
    const geo = new THREE.BoxGeometry(slatW * 0.94, WALL_HEIGHT - 0.5, 0.16);
    paintVertexAO(geo, DOOR_COLOR, rng, { aoStrength: 0.22, hueJitter: 0.1 });
    const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.8 }));
    mesh.position.set(-DOOR_WIDTH / 2 + slatW * (i + 0.5), (WALL_HEIGHT - 0.5) / 2, 0);
    mesh.castShadow = true;
    doorGroup.add(mesh);
  }
  const handleGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
  paintVertexAO(handleGeo, FRAME_COLOR, rng, { aoStrength: 0.1, hueJitter: 0.05 });
  const handle = new THREE.Mesh(handleGeo, standardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 }));
  handle.position.set(DOOR_WIDTH / 2 - 0.3, 1.3, 0.12);
  doorGroup.add(handle);

  doorGroup.position.set(0, 0, GATE_Z);
  group.add(doorGroup);

  return { group, gateDoor: doorGroup, doorOpenX: DOOR_WIDTH + 0.4 };
}

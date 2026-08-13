// -Z奥の飼育舎壁+大きな引き戸ゲート。gateDoorをexportし、world.tsのopenGate()でスライド開閉する。
import * as THREE from "three";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const WALL_COLOR = new THREE.Color("#e0d3bd");
const DOOR_COLOR = new THREE.Color("#8a6a44");
const FRAME_COLOR = new THREE.Color("#5c4a34");

const GATE_Z = -12.6;
const WALL_WIDTH = 8;
const WALL_HEIGHT = 3.2;
const DOOR_WIDTH = 3.2;

export interface Gate {
  readonly group: THREE.Group;
  /** 引き戸本体。openGate()アニメで+X方向へスライドさせる。 */
  readonly gateDoor: THREE.Object3D;
  readonly doorOpenX: number;
}

export function createGate(): Gate {
  const rng = seededRandom(2020);
  const group = new THREE.Group();
  group.name = "gate";

  // 飼育舎の壁(左右2枚、中央は戸口として開けておく)。
  const sideWidth = (WALL_WIDTH - DOOR_WIDTH) / 2;
  for (const side of [-1, 1] as const) {
    const geo = new THREE.BoxGeometry(sideWidth, WALL_HEIGHT, 0.5, 2, 2, 1);
    paintVertexAO(geo, WALL_COLOR, rng, { aoStrength: 0.18, hueJitter: 0.06 });
    const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.9 }));
    mesh.position.set(side * (DOOR_WIDTH / 2 + sideWidth / 2), WALL_HEIGHT / 2, GATE_Z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // 屋根まぐさ(戸口の上、壁と一体で高さを揃える)。
  const lintelGeo = new THREE.BoxGeometry(WALL_WIDTH, 0.45, 0.5);
  paintVertexAO(lintelGeo, FRAME_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.05 });
  const lintel = new THREE.Mesh(lintelGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  lintel.position.set(0, WALL_HEIGHT - 0.225, GATE_Z);
  lintel.castShadow = true;
  group.add(lintel);

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

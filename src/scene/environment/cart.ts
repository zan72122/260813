// 飼育員の餌カート(木製箱車)。(0,0,8)付近、観察デッキそばに置く。
import * as THREE from "three";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const WOOD_COLOR = new THREE.Color("#a9793f");
const WOOD_DARK = new THREE.Color("#7a5628");
const WHEEL_COLOR = new THREE.Color("#4a3d30");

export function createCart(): THREE.Group {
  const rng = seededRandom(8181);
  const group = new THREE.Group();
  group.name = "food-cart";

  const bedGeo = new THREE.BoxGeometry(1.1, 0.5, 0.7, 2, 2, 2);
  paintVertexAO(bedGeo, WOOD_COLOR, rng, { aoStrength: 0.25, hueJitter: 0.1 });
  const bed = new THREE.Mesh(bedGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  bed.position.y = 0.55;
  bed.castShadow = true;
  bed.receiveShadow = true;
  group.add(bed);

  // 内側(浅い箱に見えるよう、内部をわずかに凹ませた蓋パネルで表現)。
  const innerGeo = new THREE.BoxGeometry(0.95, 0.14, 0.56);
  paintVertexAO(innerGeo, WOOD_DARK, rng, { aoStrength: 0.3, hueJitter: 0.08 });
  const inner = new THREE.Mesh(innerGeo, standardMaterial({ color: 0xffffff, roughness: 0.9 }));
  inner.position.y = 0.72;
  group.add(inner);

  // 脚/枠
  const legPositions: Array<[number, number]> = [
    [0.45, 0.28],
    [0.45, -0.28],
    [-0.45, 0.28],
    [-0.45, -0.28]
  ];
  for (const [lx, lz] of legPositions) {
    const legGeo = new THREE.BoxGeometry(0.07, 0.35, 0.07);
    paintVertexAO(legGeo, WOOD_DARK, rng, { aoStrength: 0.2, hueJitter: 0.06 });
    const leg = new THREE.Mesh(legGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
    leg.position.set(lx, 0.3 - 0.02, lz * 1.0);
    leg.castShadow = true;
    group.add(leg);
  }

  // 車輪2個(横倒しシリンダー)
  for (const wx of [-0.5, 0.5]) {
    const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 14);
    paintVertexAO(wheelGeo, WHEEL_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.05 });
    wheelGeo.rotateX(Math.PI / 2);
    const wheel = new THREE.Mesh(wheelGeo, standardMaterial({ color: 0xffffff, roughness: 0.7 }));
    wheel.position.set(wx, 0.22, 0);
    wheel.castShadow = true;
    group.add(wheel);
  }

  // 取っ手(引くための棒)
  const handleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8);
  paintVertexAO(handleGeo, WOOD_DARK, rng, { aoStrength: 0.15, hueJitter: 0.05 });
  handleGeo.rotateX(Math.PI / 2.4);
  const handle = new THREE.Mesh(handleGeo, standardMaterial({ color: 0xffffff, roughness: 0.7 }));
  handle.position.set(0, 0.55, 0.75);
  group.add(handle);

  group.position.set(0, 0, 8);
  return group;
}

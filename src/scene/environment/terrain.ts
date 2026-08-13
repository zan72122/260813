// 放飼場の地面: 半径~14の楕円、明るい砂地、緩やかな起伏、外周の低い柵/岩、手前(+Z)の観察デッキ縁。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeIrregularBlock, paintVertexAO, seededRandom, standardMaterial } from "./proc";

const RADIUS_X = 14;
const RADIUS_Z = 12;
const SAND_COLOR = new THREE.Color("#e8d5a8");
const ROCK_COLOR = new THREE.Color("#a89a86");
const DECK_COLOR = new THREE.Color("#c9b28f");

// 滑らかな多倍音サイン波の起伏(頂点間で連続、継ぎ目なし)。
function groundHeight(x: number, z: number): number {
  return (
    0.22 * Math.sin(x * 0.32 + 1.1) * Math.cos(z * 0.4) +
    0.12 * Math.sin(x * 0.9 - z * 0.55) +
    0.06 * Math.cos(x * 0.18 + z * 0.22)
  );
}

function buildGroundGeometry(rings: number, segments: number): THREE.BufferGeometry {
  const positions: number[] = [0, groundHeight(0, 0), 0];
  const uvs: number[] = [0.5, 0.5];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = Math.cos(theta) * RADIUS_X * t;
      const z = Math.sin(theta) * RADIUS_Z * t;
      const y = groundHeight(x, z);
      positions.push(x, y, z);
      uvs.push(0.5 + Math.cos(theta) * t * 0.5, 0.5 + Math.sin(theta) * t * 0.5);
    }
  }
  const indices: number[] = [];
  for (let s = 0; s < segments; s++) {
    indices.push(0, 1 + s, 1 + ((s + 1) % segments));
  }
  for (let r = 1; r < rings; r++) {
    const a0 = 1 + (r - 1) * segments;
    const b0 = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const a = a0 + s;
      const b = a0 + ((s + 1) % segments);
      const c = b0 + s;
      const d = b0 + ((s + 1) % segments);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function isGateArc(theta: number): boolean {
  // -Z奥(theta ~ -90deg/270deg)にゲート開口。ラジアン換算で 260°-280°付近を除外。
  const deg = ((THREE.MathUtils.radToDeg(theta) % 360) + 360) % 360;
  return deg > 250 && deg < 290;
}

function isDeckArc(theta: number): boolean {
  // +Z手前(theta ~ 90deg)は観察デッキの縁が担当するので岩は間引く。
  const deg = ((THREE.MathUtils.radToDeg(theta) % 360) + 360) % 360;
  return deg > 65 && deg < 115;
}

function buildPerimeterRocks(rng: () => number): THREE.Mesh {
  const geoms: THREE.BufferGeometry[] = [];
  const segments = 40;
  for (let s = 0; s < segments; s++) {
    const theta = (s / segments) * Math.PI * 2;
    if (isGateArc(theta) || isDeckArc(theta)) continue;
    const t = 1.0 + rng() * 0.03;
    const x = Math.cos(theta) * RADIUS_X * t;
    const z = Math.sin(theta) * RADIUS_Z * t;
    const size = new THREE.Vector3(0.5 + rng() * 0.5, 0.28 + rng() * 0.4, 0.4 + rng() * 0.45);
    const block = makeIrregularBlock(size, ROCK_COLOR, rng, { aoStrength: 0.4, hueJitter: 0.16 });
    block.rotateY(rng() * Math.PI);
    block.translate(x, size.y * 0.5 + groundHeight(x, z), z);
    geoms.push(block);
  }
  const merged = mergeGeometries(geoms, false) as THREE.BufferGeometry;
  geoms.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, standardMaterial({ color: 0xffffff, roughness: 1 }));
  mesh.name = "terrain-rocks";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildDeckEdge(rng: () => number): THREE.Mesh {
  const geoms: THREE.BufferGeometry[] = [];
  const planks = 14;
  for (let i = 0; i < planks; i++) {
    const theta = THREE.MathUtils.degToRad(60 + (i / (planks - 1)) * 60); // 60°〜120° = +Z手前アーク
    const t = 1.0 + rng() * 0.01;
    const x = Math.cos(theta) * RADIUS_X * t;
    const z = Math.sin(theta) * RADIUS_Z * t;
    const size = new THREE.Vector3(1.1, 0.22 + rng() * 0.05, 0.5);
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    paintVertexAO(geo, DECK_COLOR, rng, { aoStrength: 0.2, hueJitter: 0.08 });
    geo.rotateY(-theta + Math.PI / 2);
    geo.translate(x, size.y * 0.5 + groundHeight(x, z), z);
    geoms.push(geo);
  }
  const merged = mergeGeometries(geoms, false) as THREE.BufferGeometry;
  geoms.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  mesh.name = "terrain-deck-edge";
  mesh.receiveShadow = true;
  return mesh;
}

export function createTerrain(): THREE.Group {
  const group = new THREE.Group();
  group.name = "terrain";
  const rng = seededRandom(4242);

  const groundGeo = buildGroundGeometry(9, 56);
  paintVertexAO(groundGeo, SAND_COLOR, rng, { aoStrength: 0.22, hueJitter: 0.1 });
  const ground = new THREE.Mesh(groundGeo, standardMaterial({ color: 0xffffff, roughness: 1 }));
  ground.name = "terrain-ground";
  ground.receiveShadow = true;
  group.add(ground);

  group.add(buildPerimeterRocks(seededRandom(99)));
  group.add(buildDeckEdge(seededRandom(777)));

  return group;
}

export { groundHeight };

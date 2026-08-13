// 砂場: 中央がわずかに盛れる形状。盛り上げ/平らのstate切替APIを用意(morph本体はS3bが仕上げる)。
import * as THREE from "three";
import { getSpot } from "../../game/spots";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const SAND_COLOR = new THREE.Color("#cbb387"); // 湿り砂寄り(掘り返された場所として周囲より濃い)
const RADIUS = 1.7;

export interface SandPit {
  readonly group: THREE.Group;
  setMound(on: boolean): void;
  /** 平ら/盛り上げ両方のgeometryを解放する(現在メッシュにセットされていない方はdisposeObject3Dの走査で拾えないため個別提供)。 */
  disposeGeometries(): void;
}

function buildMoundGeometry(rings: number, segments: number, moundHeight: number): THREE.BufferGeometry {
  const positions: number[] = [0, moundHeight, 0];
  const uvs: number[] = [0.5, 0.5];
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const y = moundHeight * Math.cos((t * Math.PI) / 2); // 中央高く、縁でゼロ
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = Math.cos(theta) * RADIUS * t;
      const z = Math.sin(theta) * RADIUS * t;
      positions.push(x, y, z);
      uvs.push(0.5 + Math.cos(theta) * t * 0.5, 0.5 + Math.sin(theta) * t * 0.5);
    }
  }
  const indices: number[] = [];
  for (let s = 0; s < segments; s++) indices.push(0, 1 + s, 1 + ((s + 1) % segments));
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

export function createSandPit(): SandPit {
  const spot = getSpot("sand");
  const rng = seededRandom(6161);
  const group = new THREE.Group();
  group.name = "sand-pit";

  const flatGeo = buildMoundGeometry(6, 28, 0.02);
  paintVertexAO(flatGeo, SAND_COLOR, rng, { aoStrength: 0.15, hueJitter: 0.06 });
  const moundGeo = buildMoundGeometry(6, 28, 0.32);
  paintVertexAO(moundGeo, SAND_COLOR, rng, { aoStrength: 0.15, hueJitter: 0.06 });

  const material = standardMaterial({ color: 0xffffff, roughness: 1 });
  const mesh = new THREE.Mesh(flatGeo, material);
  mesh.name = "sand-pit-surface";
  mesh.receiveShadow = true;
  mesh.position.y = 0.01;
  group.add(mesh);

  group.position.set(spot.position.x, 0, spot.position.z);

  let mounded = false;
  function setMound(on: boolean): void {
    if (on === mounded) return;
    mounded = on;
    mesh.geometry = on ? moundGeo : flatGeo;
  }

  function disposeGeometries(): void {
    flatGeo.dispose();
    moundGeo.dispose();
  }

  return { group, setMound, disposeGeometries };
}

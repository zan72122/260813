// 砂場: 中央がわずかに盛れる形状+丸い木枠の縁で地面と明確に区別。盛り上げ/平らのstate切替APIを用意
// (morph本体はS3bが仕上げる)。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getSpot } from "../../game/spots";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

// 地面の砂(#e8d5a8)より明るく、粒が細かく見えるよう色ムラを控えめにした専用の砂色。
const SAND_COLOR = new THREE.Color("#faf0d0");
const RIM_COLOR = new THREE.Color("#8a6a44");
const RADIUS = 1.7;
const RIM_RADIUS = RADIUS + 0.16;

export interface SandPit {
  readonly group: THREE.Group;
  setMound(on: boolean): void;
  /** 連続レベル(0=平ら/掘り切った状態 .. 1=盛り上げ)。dig-sand行動が掘り進む段階演出に使う。
   * flat/moundは同トポロジ(頂点数・順序一致)なので、位置属性を線形補間して1メッシュに焼き込む。 */
  setMoundLevel(t: number): void;
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

// 丸い木枠(短い丸太を弧状に並べてmerge、1 draw call)。砂場の輪郭を地面から明確に切り離す。
function buildRim(rng: () => number): THREE.Mesh {
  const logs = 22;
  const geoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < logs; i++) {
    const theta = (i / logs) * Math.PI * 2;
    const x = Math.cos(theta) * RIM_RADIUS;
    const z = Math.sin(theta) * RIM_RADIUS;
    const len = ((Math.PI * 2) / logs) * RIM_RADIUS * 1.15;
    const geo = new THREE.CylinderGeometry(0.09, 0.1, len, 6);
    geo.rotateZ(Math.PI / 2);
    geo.rotateY(-theta);
    paintVertexAO(geo, RIM_COLOR, rng, { aoStrength: 0.22, hueJitter: 0.1 });
    geo.translate(x, 0.09, z);
    geoms.push(geo);
  }
  const merged = mergeGeometries(geoms, false) as THREE.BufferGeometry;
  geoms.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, standardMaterial({ color: 0xffffff, roughness: 0.9 }));
  mesh.name = "sand-pit-rim";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createSandPit(): SandPit {
  const spot = getSpot("sand");
  const rng = seededRandom(6161);
  const group = new THREE.Group();
  group.name = "sand-pit";

  // 既定(未使用時)は僅かに中央が盛れた形状にして、地面のフラットな砂と見分けやすくする。
  const flatGeo = buildMoundGeometry(6, 28, 0.1);
  paintVertexAO(flatGeo, SAND_COLOR, rng, { aoStrength: 0.1, hueJitter: 0.04 });
  const moundGeo = buildMoundGeometry(6, 28, 0.32);
  paintVertexAO(moundGeo, SAND_COLOR, rng, { aoStrength: 0.1, hueJitter: 0.04 });

  // dig-sand行動が段階的にレベルを下げられるよう、flat/moundを線形補間した専用の可変geometryを
  // メッシュの実体として使う(flatGeo/moundGeoはソースデータとして保持、disposeGeometriesで解放)。
  const liveGeo = flatGeo.clone();
  const flatPos = flatGeo.getAttribute("position");
  const moundPos = moundGeo.getAttribute("position");
  const livePos = liveGeo.getAttribute("position");

  const material = standardMaterial({ color: 0xffffff, roughness: 0.92 });
  const mesh = new THREE.Mesh(liveGeo, material);
  mesh.name = "sand-pit-surface";
  mesh.receiveShadow = true;
  mesh.position.y = 0.01;
  group.add(mesh);
  group.add(buildRim(seededRandom(6262)));

  group.position.set(spot.position.x, 0, spot.position.z);

  function setMoundLevel(t: number): void {
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    for (let i = 0; i < livePos.count; i++) {
      const fy = flatPos.getY(i);
      const my = moundPos.getY(i);
      livePos.setY(i, THREE.MathUtils.lerp(fy, my, clamped));
    }
    livePos.needsUpdate = true;
    liveGeo.computeVertexNormals();
  }

  function setMound(on: boolean): void {
    setMoundLevel(on ? 1 : 0);
  }
  // 既定(未使用時)はflatGeoそのまま(=level 0)。従来の見た目を変えない。
  setMoundLevel(0);

  function disposeGeometries(): void {
    flatGeo.dispose();
    moundGeo.dispose();
    liveGeo.dispose();
  }

  return { group, setMound, setMoundLevel, disposeGeometries };
}

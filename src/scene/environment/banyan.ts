// ガジュマル(banyan): 太い幹+垂れ下がる気根+根元の絡む太根。根の間に餌の収まる窪みを1つ用意。
import * as THREE from "three";
import * as BGU from "three/addons/utils/BufferGeometryUtils.js";
import { getSpot } from "../../game/spots";
import { makeLeafCluster, paintVertexAO, roughenGeometry, seededRandom, standardMaterial } from "./proc";

const BARK_COLOR = new THREE.Color("#7a6a52");
const LEAF_COLOR_A = new THREE.Color("#5aa860");
const LEAF_COLOR_B = new THREE.Color("#2e6b45");

export interface Banyan {
  readonly group: THREE.Group;
  readonly gapPosition: THREE.Vector3;
  readonly leafCluster: THREE.Object3D;
}

function tubeAlongPoints(points: THREE.Vector3[], radiusFn: (t: number) => number, radialSegments: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const tubularSegments = Math.max(8, points.length * 6);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  // TubeGeometryは半径固定なのでUV.xを使って半径をテーパーさせる。
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const normal = geo.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) {
    const t = uv.getX(i);
    const r = radiusFn(t);
    // 中心線からの半径方向オフセットをr倍に再スケール(法線方向 = 元の半径1相当のオフセット方向)。
    // TubeGeometry radius=1で生成したので、normal*(r-1)を追加すればスケールできる。
    pos.setXYZ(i, pos.getX(i) + normal.getX(i) * (r - 1), pos.getY(i) + normal.getY(i) * (r - 1), pos.getZ(i) + normal.getZ(i) * (r - 1));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createBanyan(): Banyan {
  const spot = getSpot("banyan-root");
  const rng = seededRandom(9911);
  const group = new THREE.Group();
  group.name = "banyan";

  // 幹: 積み重ねた不揃いテーパー円柱をマージ。
  const trunkPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    trunkPts.push(new THREE.Vector3((rng() - 0.5) * 0.25, t * 3.6, (rng() - 0.5) * 0.25));
  }
  const trunkGeo = tubeAlongPoints(trunkPts, (t) => 0.85 - t * 0.45, 9);
  roughenGeometry(trunkGeo, 0.04, rng);
  paintVertexAO(trunkGeo, BARK_COLOR, rng, { aoStrength: 0.3, hueJitter: 0.12 });

  // 太い絡む根元(地表付近を這う3本)。
  const rootGeoms: THREE.BufferGeometry[] = [trunkGeo];
  const rootDirs: Array<[number, number]> = [
    [1, 0.3],
    [-0.6, 1],
    [-1, -0.5]
  ];
  for (const [dx, dz] of rootDirs) {
    const pts = [
      new THREE.Vector3(0, 0.35, 0),
      new THREE.Vector3(dx * 0.8, 0.18, dz * 0.8),
      new THREE.Vector3(dx * 1.7, 0.06, dz * 1.7),
      new THREE.Vector3(dx * 2.3, 0.02, dz * 2.3)
    ];
    const geo = tubeAlongPoints(pts, (t) => 0.4 - t * 0.28, 7);
    roughenGeometry(geo, 0.03, rng);
    paintVertexAO(geo, BARK_COLOR, rng, { aoStrength: 0.35, hueJitter: 0.12 });
    rootGeoms.push(geo);
  }

  // 垂れ下がる気根 5本(上部の分岐点から地面近くまで)。
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + rng();
    const topY = 2.2 + rng() * 1.1;
    const ox = Math.cos(ang) * (0.3 + rng() * 0.3);
    const oz = Math.sin(ang) * (0.3 + rng() * 0.3);
    const pts = [
      new THREE.Vector3(ox, topY, oz),
      new THREE.Vector3(ox * 1.3, topY * 0.6, oz * 1.3),
      new THREE.Vector3(ox * 1.5, Math.max(0.05, topY * 0.15 - rng() * 0.3), oz * 1.5)
    ];
    const geo = tubeAlongPoints(pts, (t) => 0.09 - t * 0.05, 5);
    roughenGeometry(geo, 0.015, rng);
    paintVertexAO(geo, BARK_COLOR, rng, { aoStrength: 0.25, hueJitter: 0.1 });
    rootGeoms.push(geo);
  }

  const mergedTrunk = BGU.mergeGeometries(rootGeoms, false) as THREE.BufferGeometry;
  rootGeoms.forEach((g) => g.dispose());
  const trunkMesh = new THREE.Mesh(mergedTrunk, standardMaterial({ color: 0xffffff, roughness: 0.95 }));
  trunkMesh.name = "banyan-trunk";
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  group.add(trunkMesh);

  const leafCluster = makeLeafCluster(rng, new THREE.Vector3(0.2, 3.0, 0.1), 2.1, 46, LEAF_COLOR_A, LEAF_COLOR_B);
  leafCluster.name = "banyan-leaves";
  group.add(leafCluster);

  group.position.set(spot.position.x, 0, spot.position.z);

  // 窪み(gap)は根元の絡む根の間、アンカーは spot.position をそのまま使う(game/spots.ts基準)。
  const gapPosition = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z);

  return { group, gapPosition, leafCluster };
}

// 放飼場の外側の背景: 遠方まで続く外周地面(半径~60)+簡略なジャングル帯(instancing木々)+遠くの低い丘。
// 「浮き島」状態(放飼場楕円の外が完全な虚空)を解消するために、terrain.tsのgroundHeightと高さ0で
// 自然に接続する連続した地面メッシュを1枚追加する。fogと調和させ地平線を空に溶かす。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { fbm2D, seededRandom, standardMaterial, valueNoise2D } from "./proc";
import { groundHeight } from "./terrain";

const RADIUS_X = 14;
const RADIUS_Z = 12;
const OUTER_T = 4.3; // RADIUS_X * OUTER_T ≈ 60(要件の「半径~60」相当)
const GRASS_NEAR = new THREE.Color("#8fce6e");
const GRASS_FAR = new THREE.Color("#f5ead8"); // 乳白(朝の地平色)に霞ませる
const HILL_TINT = new THREE.Color("#bcd3c4"); // 遠景の丘の青緑がかった霞

function outerHeight(x: number, z: number, t: number): number {
  // t=1(放飼場の縁)ではgroundHeightそのものを使い、terrain.tsのground面と高さがぴったり一致する
  // (継ぎ目/段差なし)。tが増えるにつれ元の起伏を減衰させつつ、より大きなうねり(丘)を足していく。
  const innerBlend = 1 - THREE.MathUtils.smoothstep(t, 1, 1.3);
  const base = groundHeight(x, z) * innerBlend;
  const hillMask = THREE.MathUtils.smoothstep(t, 1.1, 2.6);
  const hills = (fbm2D(x * 0.045, z * 0.045, 555, 3) - 0.5) * 5.5 * hillMask;
  return base + hills;
}

function buildOuterGround(): THREE.Mesh {
  const rings = 26;
  const segments = 72;
  const positions: number[] = [];
  const colors: number[] = [];
  const nearGrass = GRASS_NEAR;
  const c = new THREE.Color();
  for (let r = 0; r <= rings; r++) {
    // r=0行はt=1(放飼場の縁)に一致させ、terrain.tsの外周と縫い目なく繋げる。
    const t = 1 + (r / rings) * (OUTER_T - 1);
    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = Math.cos(theta) * RADIUS_X * t;
      const z = Math.sin(theta) * RADIUS_Z * t;
      const y = outerHeight(x, z, t);
      positions.push(x, y, z);

      const farFrac = THREE.MathUtils.clamp((t - 1) / (OUTER_T - 1), 0, 1);
      // 近くは草地、遠くで乳白/霞んだ丘色へ滑らかにブレンド(地平線を空に溶かす)。
      c.copy(nearGrass).lerp(HILL_TINT, THREE.MathUtils.smoothstep(farFrac, 0.15, 0.55));
      c.lerp(GRASS_FAR, THREE.MathUtils.smoothstep(farFrac, 0.55, 1));
      const n = valueNoise2D(x * 0.12, z * 0.12, 88) - 0.5;
      colors.push(
        THREE.MathUtils.clamp(c.r + n * 0.06, 0, 1),
        THREE.MathUtils.clamp(c.g + n * 0.06, 0, 1),
        THREE.MathUtils.clamp(c.b + n * 0.06, 0, 1)
      );
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rings; r++) {
    const a0 = r * segments;
    const b0 = (r + 1) * segments;
    for (let s = 0; s < segments; s++) {
      const a = a0 + s;
      const b = a0 + ((s + 1) % segments);
      const c2 = b0 + s;
      const d = b0 + ((s + 1) % segments);
      indices.push(a, b, c2);
      indices.push(b, d, c2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 1 }));
  mesh.name = "backdrop-outer-ground";
  mesh.receiveShadow = true;
  // わずかに沈めてterrain-groundの外周と確実に重ね、砂→草の境界にギャップが出ないようにする。
  mesh.position.y = -0.01;
  return mesh;
}

// 1本分の簡略ジャングル木シルエット(幹+円錐状の葉冠)を1つのジオメトリにマージ。InstancedMeshで量産。
function buildJungleTreeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6);
  trunk.translate(0, 0.8, 0);
  const canopy = new THREE.ConeGeometry(0.95, 2.1, 7);
  canopy.translate(0, 1.9, 0);
  const parts = [trunk, canopy];
  const merged = mergeGeometries(parts, false) as THREE.BufferGeometry;
  parts.forEach((g) => g.dispose());
  return merged;
}

function buildJungleBand(): THREE.InstancedMesh {
  const rng = seededRandom(5151);
  const count = 16; // 10-20本の範囲
  const geo = buildJungleTreeGeometry();
  // 彩度低めの単色(instanceColorで濃淡だけ付ける)。素朴なシルエットとして遠景に霞ませる。
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, fog: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.name = "backdrop-jungle-band";
  const dummy = new THREE.Object3D();
  const dark = new THREE.Color("#6f8f68");
  const light = new THREE.Color("#8fae7c");
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.35;
    const t = 1.35 + rng() * 0.55;
    const x = Math.cos(theta) * RADIUS_X * t;
    const z = Math.sin(theta) * RADIUS_Z * t;
    const y = outerHeight(x, z, t);
    dummy.position.set(x, y, z);
    dummy.rotation.y = rng() * Math.PI * 2;
    const s = 1.1 + rng() * 1.3;
    dummy.scale.set(s * (0.85 + rng() * 0.3), s, s * (0.85 + rng() * 0.3));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.copy(dark).lerp(light, rng());
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export interface Backdrop {
  readonly group: THREE.Group;
}

export function createBackdrop(): Backdrop {
  const group = new THREE.Group();
  group.name = "backdrop";
  group.add(buildOuterGround());
  group.add(buildJungleBand());
  return { group };
}

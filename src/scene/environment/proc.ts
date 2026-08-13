// 環境ジオメトリ共通ユーティリティ: 決定論的seeded random、CanvasTexture生成、頂点色AO/色ムラ。
// 外部モデル/テクスチャ画像は一切使わない（ART_DIRECTION.md準拠）。全てコード生成。
import * as THREE from "three";

/** mulberry32 seeded PRNG。core/rngとは独立（sceneはgame/coreに依存できるが、環境ジオメトリの
 * 見た目乱数はゲームロジックのRNGと無関係なので、軽量な専用実装を持つ）。 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** jsdom環境ではgetContext('2d')がnullを返すため、その場合は描画をスキップして
 * 空のCanvasTextureを返す（テスト時にthrowしないためのガード）。 */
export function makeCanvasTexture(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function jitterColor(base: THREE.Color, amount: number, rng: () => number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const h = hsl.h + (rng() - 0.5) * amount * 0.06;
  const s = THREE.MathUtils.clamp(hsl.s + (rng() - 0.5) * amount, 0, 1);
  const l = THREE.MathUtils.clamp(hsl.l + (rng() - 0.5) * amount, 0, 1);
  const c = new THREE.Color();
  c.setHSL(((h % 1) + 1) % 1, s, l);
  return c;
}

/** ワールド座標ベースの決定論的value noise(2D, smoothstep補間)。依存追加禁止のための自前実装。
 * 頂点インデックス順(リング/放射状トポロジ)に依存しないため、center-fanのような扇状メッシュでも
 * 隣接頂点が空間的に近ければ近い値を返し、放射状のスジ/リングのアーティファクトが出ない。 */
function hash2D(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 0.6180339887) * 43758.5453123;
  return s - Math.floor(s);
}

export function valueNoise2D(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2D(xi, zi, seed);
  const b = hash2D(xi + 1, zi, seed);
  const c = hash2D(xi, zi + 1, seed);
  const d = hash2D(xi + 1, zi + 1, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

/** 数オクターブ重ねたvalueNoise2D(-1..1相当ではなく0..1)。地面などの広い面の色ムラ向け。 */
export function fbm2D(x: number, z: number, seed: number, octaves = 3, scale = 1): number {
  let sum = 0;
  let amp = 0.5;
  let freq = scale;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, z * freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** paintVertexAOのワールド座標ノイズ版。頂点index順の独立乱数(rng())の代わりにx/z座標由来の
 * 連続したvalue noiseを使うため、center-fanなど扇状トポロジでも放射状のスジ/リング構造が出ない。
 * yの高さでAO(低いほど暗い)、x/z位置のfbmで色相・彩度・明度を滑らかにジッター。 */
export function paintVertexAOWorld(
  geometry: THREE.BufferGeometry,
  baseColor: THREE.Color,
  seed: number,
  opts?: { aoStrength?: number; hueJitter?: number; noiseScale?: number }
): void {
  const aoStrength = opts?.aoStrength ?? 0.3;
  const hueJitter = opts?.hueJitter ?? 0.1;
  const noiseScale = opts?.noiseScale ?? 0.15;
  const pos = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox as THREE.Box3;
  const minY = bb.min.y;
  const range = Math.max(1e-4, bb.max.y - minY);
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL(hsl);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = fbm2D(x, z, seed, 3, noiseScale) - 0.5; // -0.5..0.5、空間的に連続
    const n2 = valueNoise2D(x * noiseScale * 3.7, z * noiseScale * 3.7, seed + 500) - 0.5;
    const t = (y - minY) / range;
    const ao = 1 - aoStrength * (1 - t);
    const h = hsl.h + n1 * hueJitter * 0.06;
    const s = THREE.MathUtils.clamp(hsl.s + n2 * hueJitter, 0, 1);
    const l = THREE.MathUtils.clamp(hsl.l * ao + n1 * hueJitter * 0.5, 0, 1);
    c.setHSL(((h % 1) + 1) % 1, s, l);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** ジオメトリに頂点色を焼き込む。yLowほど暗く(目地/クレバスのAO風)、色相・彩度・明度をわずかにジッター。 */
export function paintVertexAO(
  geometry: THREE.BufferGeometry,
  baseColor: THREE.Color,
  rng: () => number,
  opts?: { aoStrength?: number; hueJitter?: number }
): void {
  const aoStrength = opts?.aoStrength ?? 0.3;
  const hueJitter = opts?.hueJitter ?? 0.1;
  const pos = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox as THREE.Box3;
  const minY = bb.min.y;
  const range = Math.max(1e-4, bb.max.y - minY);
  const tint = jitterColor(baseColor, hueJitter, rng);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y - minY) / range;
    const noise = 0.92 + rng() * 0.16;
    const ao = (1 - aoStrength * (1 - t)) * noise;
    colors[i * 3] = THREE.MathUtils.clamp(tint.r * ao, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(tint.g * ao, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(tint.b * ao, 0, 1);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** 全頂点を単色で塗る（paintVertexAOのuniform版、色ムラ無しの部品向け）。 */
export function paintVertexUniform(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** 小さな表面ノイズを頂点位置に加える(石・樹皮など有機的サーフェス向け)。継ぎ目は微小なので視認されにくい。 */
export function roughenGeometry(geometry: THREE.BufferGeometry, amount: number, rng: () => number): void {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (rng() - 0.5) * amount;
    const y = pos.getY(i) + (rng() - 0.5) * amount;
    const z = pos.getZ(i) + (rng() - 0.5) * amount;
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** 不揃いな直方体ブロックのジオメトリを1個作る(石垣/岩用)。サイズ・回転・AOをランダム化。 */
export function makeIrregularBlock(
  size: THREE.Vector3,
  baseColor: THREE.Color,
  rng: () => number,
  opts?: { rough?: number; aoStrength?: number; hueJitter?: number }
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z, 2, 2, 2);
  roughenGeometry(geo, opts?.rough ?? size.x * 0.06, rng);
  paintVertexAO(geo, baseColor, rng, { aoStrength: opts?.aoStrength, hueJitter: opts?.hueJitter });
  return geo;
}

export function standardMaterial(opts?: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, ...opts });
}

/** インスタンシングされた葉クラスタ(instanceColorで色ムラ)。banyan/tallTreeで共用。effects/leaves.tsが
 * 親グループ単位で風の微揺れを掛けるため、戻り値はグループでラップして返す想定は呼び出し側に委ねる。
 * colorC(省略時はcolorAを明るくした自動生成)を含めた3段の明度バンドを、内側/下向き=暗い〜外側/上向き=
 * 明るいでゾーニングして選ぶ(純粋な per-instance 乱数だけだと単色の塊に見えるため)。 */
export function makeLeafCluster(
  rng: () => number,
  center: THREE.Vector3,
  radius: number,
  count: number,
  colorA: THREE.Color,
  colorB: THREE.Color,
  colorC?: THREE.Color
): THREE.InstancedMesh {
  const light = colorC ?? colorA.clone().lerp(new THREE.Color(0xffffff), 0.28);
  const geo = new THREE.IcosahedronGeometry(0.34, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.6, rng() - 0.5).normalize();
    const rFrac = 0.4 + rng() * 0.6;
    const r = radius * rFrac;
    dummy.position.copy(center).addScaledVector(dir, r);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const s = 0.6 + rng() * 0.7;
    dummy.scale.set(s, s * (0.7 + rng() * 0.5), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    // 3段バンド: 内側/下向き=最暗(colorB)、中間=colorA、外側/上向き=最明(light)。
    const band = rFrac * 0.65 + Math.max(0, dir.y) * 0.5 + (rng() - 0.5) * 0.14;
    if (band < 0.42) col.copy(colorB);
    else if (band < 0.72) col.copy(colorA);
    else col.copy(light);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

// ゾウ専用のジオメトリ変形ヘルパー。src/scene/environment/proc.ts(参照のみ)の共通ユーティリティを
// 補うモデリング関数群。外部モデル/画像テクスチャは使わず、頂点位置変形+頂点色のみで表現する。
import * as THREE from "three";

/** 頭頂に2つの膨らみ(twin domes)をガウス状(smoothstep)バンプとして加える。 */
export function addTwinDomeBumps(
  geometry: THREE.BufferGeometry,
  centers: THREE.Vector2[], // ローカル(x, z)
  opts: { yMin: number; radius: number; strength: number }
): void {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y < opts.yMin) continue;
    let bump = 0;
    for (const c of centers) {
      const d = Math.hypot(x - c.x, z - c.y);
      const falloff = Math.max(0, 1 - d / opts.radius);
      const s = falloff * falloff * (3 - 2 * falloff);
      bump = Math.max(bump, s);
    }
    pos.setY(i, y + bump * opts.strength);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** z方向(体長軸)に沿ったアーチを上半分(y>0)にのみ加える。中央が高く前後で低い滑らかな背中の弧。 */
export function addBackArch(
  geometry: THREE.BufferGeometry,
  opts: { center: number; halfWidth: number; height: number }
): void {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y <= 0) continue;
    const z = pos.getZ(i);
    const t = (z - opts.center) / opts.halfWidth;
    const arch = Math.max(0, 1 - t * t) * opts.height;
    pos.setY(i, y + arch * Math.min(1, y * 2));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** 腹側(y<0)をやや平らに均す(丸すぎる腹を抑え、重心の低い安定した輪郭にする)。 */
export function flattenBelly(geometry: THREE.BufferGeometry, factor: number): void {
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y >= 0) continue;
    pos.setY(i, y * factor);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

/** ローカルZ符号で2色を混ぜて頂点色にする(耳の内側=z>0/外側=z<0の色分け用)。 */
export function paintTwoToneByLocalZ(
  geometry: THREE.BufferGeometry,
  innerColor: THREE.Color,
  outerColor: THREE.Color,
  rng: () => number,
  hueJitter = 0.05
): void {
  const pos = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox as THREE.Box3;
  const maxAbsZ = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z), 1e-4);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp((z / maxAbsZ + 1) / 2, 0, 1);
    c.copy(outerColor).lerp(innerColor, t * t);
    const j = 1 + (rng() - 0.5) * hueJitter;
    colors[i * 3] = THREE.MathUtils.clamp(c.r * j, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(c.g * j, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(c.b * j, 0, 1);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** Y方向(0=根本..max=先端)に沿って2色をブレンドした頂点色(鼻先のほのかな桃色用)。 */
export function paintGradientAlongY(
  geometry: THREE.BufferGeometry,
  baseColor: THREE.Color,
  tipColor: THREE.Color,
  tipStart: number,
  rng: () => number
): void {
  const pos = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox as THREE.Box3;
  const range = Math.max(1e-4, bb.max.y - bb.min.y);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y - bb.min.y) / range;
    const tipT = THREE.MathUtils.clamp((t - tipStart) / Math.max(1e-4, 1 - tipStart), 0, 1);
    c.copy(baseColor).lerp(tipColor, tipT * 0.85);
    const j = 0.94 + rng() * 0.12;
    colors[i * 3] = THREE.MathUtils.clamp(c.r * j, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(c.g * j, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(c.b * j, 0, 1);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

/** 全頂点を単色で塗る(小物パーツ用)。 */
export function paintUniform(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const pos = geometry.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

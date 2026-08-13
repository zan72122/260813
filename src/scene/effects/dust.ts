// 軽量な粒子演出(砂埃/葉くず等)。品質lowで減量、依存追加禁止のため自前のInstancedMeshのみで実装。
// 物理エンジンは使わず、放射状に散って上昇しながらフェードする単純な時間ベースの動きのみ。
import * as THREE from "three";
import type { Quality } from "../../core/types";

/** baseCountを品質に応じて間引く。 */
export function quantizeParticleCount(base: number, quality: Quality): number {
  if (quality === "low") return Math.max(2, Math.round(base * 0.35));
  if (quality === "medium") return Math.max(3, Math.round(base * 0.7));
  return base;
}

export interface PuffOptions {
  color: THREE.Color;
  count: number;
  spread: number;
  size: number;
  rise: number;
  duration: number;
}

export interface PuffHandle {
  readonly object: THREE.Object3D;
  /** dt(秒)進める。falseが返ったら寿命切れ(呼び出し側でdisposeしてシーンから外すこと)。 */
  step(dt: number): boolean;
  dispose(): void;
}

/** originを中心に小さな破片/埃を放射状に散らして少し上昇しながらフェードするワンショット演出。 */
export function spawnPuffs(origin: THREE.Vector3, opts: PuffOptions, rng: () => number): PuffHandle {
  const count = Math.max(1, opts.count);
  const geo = new THREE.IcosahedronGeometry(opts.size, 0);
  const mat = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 1, transparent: true, opacity: 0.85 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.position.copy(origin);
  mesh.frustumCulled = false;

  const dirs: THREE.Vector3[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const r = rng() * opts.spread;
    const d = new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    dirs.push(d);
    dummy.position.copy(d);
    const s = 0.6 + rng() * 0.6;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  let elapsed = 0;
  function step(dt: number): boolean {
    elapsed += dt;
    const t = Math.min(1, elapsed / Math.max(0.001, opts.duration));
    dirs.forEach((d, i) => {
      dummy.position.set(d.x * (1 + t * 0.6), t * opts.rise, d.z * (1 + t * 0.6));
      const s = (0.6 + (i % 5) * 0.06) * (1 - t * 0.4);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mat.opacity = 0.85 * (1 - t);
    return t < 1;
  }

  function dispose(): void {
    mesh.parent?.remove(mesh);
    geo.dispose();
    mat.dispose();
  }

  return { object: mesh, step, dispose };
}

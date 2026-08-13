// 葉の微揺れ(風)。instancing対応の葉クラスタ(Object3Dグループ単位)を登録し、毎フレーム僅かに揺らす。
// reducedMotion時は基準姿勢に固定して停止する。
import type * as THREE from "three";

interface RegisteredLeaf {
  target: THREE.Object3D;
  baseRotX: number;
  baseRotZ: number;
  amplitude: number;
  speed: number;
  phase: number;
}

export interface WindSystem {
  register(target: THREE.Object3D, opts?: { amplitude?: number; speed?: number }): void;
  unregister(target: THREE.Object3D): void;
  update(dt: number): void;
  setReducedMotion(on: boolean): void;
  clear(): void;
}

export function createWindSystem(): WindSystem {
  const items: RegisteredLeaf[] = [];
  let elapsed = 0;
  let reducedMotion = false;

  function register(target: THREE.Object3D, opts?: { amplitude?: number; speed?: number }): void {
    items.push({
      target,
      baseRotX: target.rotation.x,
      baseRotZ: target.rotation.z,
      amplitude: opts?.amplitude ?? 0.035,
      speed: opts?.speed ?? 0.9,
      phase: items.length * 1.37
    });
  }

  function unregister(target: THREE.Object3D): void {
    const idx = items.findIndex((it) => it.target === target);
    if (idx >= 0) items.splice(idx, 1);
  }

  function update(dt: number): void {
    if (reducedMotion) return;
    elapsed += dt;
    for (const it of items) {
      const sway = Math.sin(elapsed * it.speed + it.phase) * it.amplitude;
      const sway2 = Math.cos(elapsed * it.speed * 0.63 + it.phase) * it.amplitude * 0.6;
      it.target.rotation.x = it.baseRotX + sway2;
      it.target.rotation.z = it.baseRotZ + sway;
    }
  }

  function setReducedMotion(on: boolean): void {
    reducedMotion = on;
    if (on) {
      for (const it of items) {
        it.target.rotation.x = it.baseRotX;
        it.target.rotation.z = it.baseRotZ;
      }
    }
  }

  function clear(): void {
    items.length = 0;
  }

  return { register, unregister, update, setReducedMotion, clear };
}

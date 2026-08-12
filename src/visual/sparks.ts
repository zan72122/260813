// src/visual/sparks.ts
// Short-lived emissive streak sprites for hammer hits. Same pooled
// InstancedMesh approach as steam.ts (1 draw call, no per-frame allocation),
// capped at 40 per PERFORMANCE_BUDGET.md.

import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Camera, CanvasTexture, Object3D } from 'three';

interface Spark {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  angle: number;
}

const MAX_CAPACITY = 40;

export interface SparkSystem {
  burst(x: number, y: number, z: number, count: number): void;
  update(dtMs: number, camera: Camera): void;
  setCap(max: number): void;
  mesh: InstancedMesh;
  dispose(scene: Object3D): void;
}

const scratchPos = new Vector3();
const scratchQuat = new Quaternion();
const scratchScale = new Vector3();
const scratchMatrix = new Matrix4();
const camPos = new Vector3();
const dirVec = new Vector3();
const unitZ = new Vector3(0, 0, 1);
const rollQuat = new Quaternion();
const upHint = new Vector3(0, 1, 0);

export function createSparkSystem(texture: CanvasTexture): SparkSystem {
  const geometry = new PlaneGeometry(1, 0.28);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    color: new Color('#ffcf6a'),
  });
  const mesh = new InstancedMesh(geometry, material, MAX_CAPACITY);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;

  const pool: Spark[] = [];
  for (let i = 0; i < MAX_CAPACITY; i += 1) {
    pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, angle: 0 });
  }

  let cap = MAX_CAPACITY;
  let emitCursor = 0;

  function findFree(): Spark | undefined {
    for (let i = 0; i < cap; i += 1) {
      const s = pool[i];
      if (s && !s.alive) return s;
    }
    return undefined;
  }

  function burst(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const s = findFree();
      if (!s) return;
      const a = pseudoRand(emitCursor) * Math.PI * 2;
      const speed = 1.6 + pseudoRand(emitCursor + 1) * 2.2;
      s.alive = true;
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.cos(a) * speed;
      s.vy = 0.8 + pseudoRand(emitCursor + 2) * 1.6;
      s.vz = Math.sin(a) * speed;
      s.age = 0;
      s.life = 0.25 + pseudoRand(emitCursor + 3) * 0.25;
      s.angle = a;
      emitCursor += 4;
    }
  }

  const gravity = -9;

  function update(dtMs: number, camera: Camera): void {
    const dt = Math.min(dtMs, 100) / 1000;
    camera.getWorldPosition(camPos);
    let instanceIndex = 0;
    for (let i = 0; i < cap; i += 1) {
      const s = pool[i];
      if (!s || !s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.alive = false;
        continue;
      }
      s.vy += gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;

      const t = s.age / s.life;
      const len = 0.35 * (1 - t * 0.4);

      scratchPos.set(s.x, s.y, s.z);
      dirVec.copy(scratchPos).sub(camPos).normalize().negate();
      scratchQuat.setFromUnitVectors(unitZ, dirVec);
      rollQuat.setFromAxisAngle(upHint, s.angle);
      scratchQuat.multiply(rollQuat);
      scratchScale.set(len, len * 0.6, 1);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      mesh.setMatrixAt(instanceIndex, scratchMatrix);
      instanceIndex += 1;
    }
    mesh.count = instanceIndex;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setCap(max: number): void {
    cap = Math.min(Math.max(max, 0), MAX_CAPACITY);
  }

  function dispose(scene: Object3D): void {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }

  return { burst, update, setCap, mesh, dispose };
}

function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 78.233) * 12543.789;
  return x - Math.floor(x);
}

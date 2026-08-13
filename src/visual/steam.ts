// src/visual/steam.ts
// Soft white steam-puff particle system. Billboarded sprites via a single
// InstancedMesh (1 draw call), buoyant rise + spread + fade. Respects
// reducedMotion (fewer/slower particles) and adaptive quality (steamMax cap).
// A pooled fixed-capacity array avoids any per-frame allocation.

import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Camera, CanvasTexture, Object3D } from 'three';

interface Puff {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  spin: number;
}

const MAX_CAPACITY = 120;

export interface SteamSystem {
  /** Emit a small burst of `count` puffs from a world position. */
  burst(x: number, y: number, z: number, count: number): void;
  update(dtMs: number, camera: Camera): void;
  setCap(max: number): void;
  setReducedMotion(reduced: boolean): void;
  mesh: InstancedMesh;
  dispose(scene: Object3D): void;
}

const scratchPos = new Vector3();
const scratchQuat = new Quaternion();
const scratchScale = new Vector3();
const scratchMatrix = new Matrix4();
const camPos = new Vector3();
const upHint = new Vector3(0, 1, 0);
const dirVec = new Vector3();
const unitZ = new Vector3(0, 0, 1);
const rollQuat = new Quaternion();

export function createSteamSystem(texture: CanvasTexture): SteamSystem {
  const geometry = new PlaneGeometry(1, 1);
  // Normal (not additive) alpha blending, capped opacity: additive white
  // sprites stack toward pure white as puffs overlap (the D5 "white-out"
  // failure) — normal blending caps every pixel at this material's opacity
  // regardless of how many puffs overlap there, so the frame center can
  // never wash out to solid white.
  // R4: climb puffs read as "two faint dots" at the old 0.5 cap — raised to
  // the budget's max allowed (still capped, still NormalBlending so it
  // still can't wash out toward pure white as puffs overlap).
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: NormalBlending,
    color: new Color('#fbf8f2'),
  });
  const mesh = new InstancedMesh(geometry, material, MAX_CAPACITY);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;

  const pool: Puff[] = [];
  for (let i = 0; i < MAX_CAPACITY; i += 1) {
    pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, spin: 0 });
  }

  let cap = MAX_CAPACITY;
  let reduced = false;
  let emitCursor = 0;

  function findFree(): Puff | undefined {
    for (let i = 0; i < cap; i += 1) {
      const p = pool[i];
      if (p && !p.alive) return p;
    }
    return undefined;
  }

  function burst(x: number, y: number, z: number, count: number): void {
    const n = reduced ? Math.ceil(count * 0.4) : count;
    for (let i = 0; i < n; i += 1) {
      const p = findFree();
      if (!p) return;
      const spread = 0.35;
      p.alive = true;
      p.x = x + (pseudoRand(emitCursor) - 0.5) * spread;
      p.y = y;
      p.z = z + (pseudoRand(emitCursor + 1) - 0.5) * spread;
      p.vx = (pseudoRand(emitCursor + 2) - 0.5) * (reduced ? 0.3 : 0.6);
      p.vy = (reduced ? 0.9 : 1.4) + pseudoRand(emitCursor + 3) * 0.6;
      p.vz = (pseudoRand(emitCursor + 4) - 0.5) * (reduced ? 0.3 : 0.6);
      p.age = 0;
      p.life = (reduced ? 2.0 : 1.5) + pseudoRand(emitCursor + 5) * 0.7;
      // Small, soft puffs (D5) — the old 0.5-1.2 range read as huge opaque
      // spheres once several overlapped; this tops out well under half that.
      // R4: nudged up from 0.22-0.48 (which read as "faint dots" at climb
      // distance) — still nowhere near the pre-D5 size, just readable.
      p.size = 0.28 + pseudoRand(emitCursor + 6) * 0.3;
      p.spin = (pseudoRand(emitCursor + 7) - 0.5) * 0.6;
      emitCursor += 8;
    }
  }

  function update(dtMs: number, camera: Camera): void {
    const dt = Math.min(dtMs, 100) / 1000;
    camera.getWorldPosition(camPos);
    let instanceIndex = 0;
    for (let i = 0; i < cap; i += 1) {
      const p = pool[i];
      if (!p || !p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        continue;
      }
      const damp = Math.pow(0.55, dt);
      p.vx *= damp;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt * (1 - 0.3 * (p.age / p.life));
      p.z += p.vz * dt;

      const t = p.age / p.life;
      // Rise-and-dissipate silhouette approximated purely through scale (no
      // per-instance alpha in InstancedMesh without a custom shader): grow in
      // over the first fifth of life, then visibly shrink away over the last
      // third instead of just popping out at end-of-life — reads as
      // "dispersing" rather than "growing into a screen-filling cloud".
      const growT = Math.min(t / 0.2, 1);
      const shrinkT = t > 0.65 ? (t - 0.65) / 0.35 : 0;
      const fadeScale = (0.55 + growT * 0.55) * (1 - shrinkT * 0.7);
      const scale = p.size * fadeScale;

      scratchPos.set(p.x, p.y, p.z);
      // Billboard: face the camera by aligning the plane's local +z to the
      // camera direction (lookAt-style quaternion), reusing scratch vectors.
      dirVec.copy(scratchPos).sub(camPos).normalize().negate();
      scratchQuat.setFromUnitVectors(unitZ, dirVec);
      rollQuat.setFromAxisAngle(upHint, p.spin * p.age);
      scratchQuat.multiply(rollQuat);
      scratchScale.set(scale, scale, scale);
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

  function setReducedMotion(r: boolean): void {
    reduced = r;
  }

  function dispose(scene: Object3D): void {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }

  return { burst, update, setCap, setReducedMotion, mesh, dispose };
}

/** Deterministic pseudo-random in [0,1) from an integer cursor (no Math.random per test-mode determinism contract). */
function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

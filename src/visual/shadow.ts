// src/visual/shadow.ts
// Cheap "blob shadow" decals (no shadow maps, per PERFORMANCE_BUDGET.md):
// soft dark radial-gradient circles laid flat on the ground under movable
// objects (crane, workers, beam, crates). One InstancedMesh, one draw call.

import {
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import type { Object3D } from 'three';

const FLAT_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);

function makeBlobTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(20,15,10,0.45)');
  g.addColorStop(0.7, 'rgba(20,15,10,0.22)');
  g.addColorStop(1, 'rgba(20,15,10,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export interface BlobShadowSystem {
  mesh: InstancedMesh;
  /** Set slot `i`'s shadow transform (ground position + world-space radius). */
  setAt(i: number, x: number, y: number, z: number, radius: number): void;
  commit(): void;
  dispose(scene: Object3D): void;
}

export function createBlobShadowSystem(count: number): BlobShadowSystem {
  const texture = makeBlobTexture();
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  const scratchPos = new Vector3();
  const scratchScale = new Vector3();
  const scratchMatrix = new Matrix4();

  function setAt(i: number, x: number, y: number, z: number, radius: number): void {
    scratchPos.set(x, y + 0.02, z);
    scratchScale.set(radius * 2, radius * 2, 1);
    scratchMatrix.compose(scratchPos, FLAT_ROTATION, scratchScale);
    mesh.setMatrixAt(i, scratchMatrix);
  }

  function commit(): void {
    mesh.instanceMatrix.needsUpdate = true;
  }

  function dispose(scene: Object3D): void {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { mesh, setAt, commit, dispose };
}

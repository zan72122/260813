import * as THREE from 'three';
import { createBlobShadowTexture } from './materials/textures.ts';

/**
 * All contact "shadows" in the scene are cheap blob sprites sharing one
 * InstancedMesh (one draw call for every shadow in the room, static or
 * moving) instead of real shadow maps.
 */
export class BlobShadowManager {
  private mesh: THREE.InstancedMesh;
  private matrix = new THREE.Matrix4();
  private slots: { used: boolean; baseScale: number }[] = [];
  readonly group = new THREE.Group();

  constructor(maxCount: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const tex = createBlobShadowTexture(128);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxCount);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < maxCount; i++) this.slots.push({ used: false, baseScale: 0.2 });
    this.group.add(this.mesh);
  }

  /** Registers a new shadow slot, returns its index for later updates. */
  allocate(scale: number): number {
    const idx = this.slots.findIndex((s) => !s.used);
    const index = idx === -1 ? this.slots.length : idx;
    if (idx === -1) this.slots.push({ used: true, baseScale: scale });
    else this.slots[index]!.used = true;
    this.slots[index]!.baseScale = scale;
    this.mesh.count = Math.max(this.mesh.count, index + 1);
    return index;
  }

  update(index: number, worldX: number, worldZ: number, opacity = 1): void {
    const scale = this.slots[index]!.baseScale * THREE.MathUtils.clamp(opacity, 0, 1.4);
    this.matrix.makeScale(scale, 1, scale);
    this.matrix.setPosition(worldX, 0.002, worldZ);
    this.mesh.setMatrixAt(index, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(index: number): void {
    this.matrix.makeScale(0, 0, 0);
    this.matrix.setPosition(0, -10, 0);
    this.mesh.setMatrixAt(index, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * B6 fix (fix-round-1): releases a previously-allocated slot back to the
   * pool so a later allocate() can reuse it. Without this, every seed
   * reshuffle allocated a fresh batch of slots against the same fixed-size
   * pool and never freed the previous seed's — the InstancedMesh overflowed
   * (shadows silently stopped appearing) after ~48/7 ~= 6 shuffles. Callers
   * that own a batch of indices (e.g. ToySystem.dispose()) must call this
   * for each one before the owning system is discarded.
   */
  free(index: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.used = false;
    this.hide(index);
  }

  /** Count of slots currently marked in-use (test/diagnostic use). */
  get usedCount(): number {
    return this.slots.reduce((n, s) => n + (s.used ? 1 : 0), 0);
  }
}

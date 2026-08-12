/**
 * STUB — owner A (gameplay-camera) owns src/scenes/**.
 * Real responsibility: Salon/Forest/Rustic SceneModules, auditorium +
 * understage scene graphs, all rig meshes driven by
 * src/core/TransformTimeline.ts's deriveTransformState(p).
 *
 * This is the Wave 1 boot placeholder: a single low-poly mesh so the render
 * loop, camera and dispose path all have something real to exercise. Owner A
 * replaces this wholesale; it is intentionally not a "scene" in the
 * docs/MASTER_SPEC.md sense.
 */
import { BoxGeometry, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { GameStateSnapshot, QualityTier, SceneContext, SceneModule, SceneId } from '../core';

export class PlaceholderScene implements SceneModule {
  readonly id: SceneId | 'auditorium' | 'understage' = 'auditorium';

  private mesh: Mesh | null = null;
  private ctx: SceneContext | null = null;

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshStandardMaterial({ color: 0x8899aa });
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.set(0, 0.5, 0);
    ctx.three.scene.add(this.mesh as unknown as Object3D);
  }

  update(dt: number, _state: Readonly<GameStateSnapshot>): void {
    if (!this.mesh) return;
    // Purely decorative idle spin so the boot frame is visibly live; owner A's
    // real scenes drive all motion from StageTransformProgress, not elapsed time.
    this.mesh.rotation.y += dt * 0.4;
  }

  applyQuality(_tier: QualityTier): void {
    // TODO(owner A/B): swap material/geometry detail per tier.
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      const material = this.mesh.material;
      if (Array.isArray(material)) {
        material.forEach((m) => m.dispose());
      } else {
        material.dispose();
      }
      this.ctx?.three.scene.remove(this.mesh as unknown as Object3D);
      this.mesh = null;
    }
    this.ctx = null;
  }
}

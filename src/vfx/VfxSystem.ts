/**
 * STUB — owner B (rendering-audio) owns src/vfx/**.
 * Real responsibility: dust particles, dappled-light gobo, footlights,
 * bird billboards, all under the particle/draw-call budget in docs/MASTER_SPEC.md.
 */
import type { Scene } from 'three';

export class VfxSystem {
  init(_scene: Scene): void {
    // TODO(owner B): particle systems, gobo projections, footlights.
  }

  update(_dt: number): void {
    // TODO(owner B): advance particle simulations.
  }

  dispose(): void {
    // TODO(owner B): dispose geometries/materials/textures.
  }
}

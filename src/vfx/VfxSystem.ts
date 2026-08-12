import type { Object3D } from 'three';
import type { QualityTier, VfxSystem } from '../core';

/**
 * Null-object stub — owner B (rendering-audio) replaces this wholesale with
 * real dust particles / dappled-light gobo / footlights / bird billboards per
 * docs/CONTRACTS_ADDENDUM.md, within the particle/draw-call budget in
 * docs/MASTER_SPEC.md.
 */
export class NullVfxSystem implements VfxSystem {
  attach(_parent: Object3D): void {
    // TODO(owner B): parent particle systems/gobo projectors under this node.
  }

  setDust(_active: boolean): void {
    // TODO(owner B): understage dust particles.
  }

  setGobo(_intensity: number): void {
    // TODO(owner B): dappled-light gobo projection, 0..1.
  }

  setFootlights(_intensity: number): void {
    // TODO(owner B): footlight glow.
  }

  setBirds(_active: boolean): void {
    // TODO(owner B): bird billboards.
  }

  update(_dt: number): void {
    // TODO(owner B): advance particle simulations.
  }

  applyQuality(_tier: QualityTier): void {
    // TODO(owner B): scale particle counts per tier.
  }

  dispose(): void {
    // TODO(owner B): dispose geometries/materials/textures.
  }
}

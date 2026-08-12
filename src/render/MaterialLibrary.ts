import { Material, MeshBasicMaterial } from 'three';
import type { MaterialLibrary, QualityTier, SceneId } from '../core';

/**
 * Null-object stub — owner B (rendering-audio) replaces this wholesale with
 * real procedural materials/textures per docs/CONTRACTS_ADDENDUM.md. Returns
 * cheap flat-color placeholder materials so owner A can build real geometry
 * against the MaterialLibrary contract today (no ad-hoc materials in scenes).
 */
export class NullMaterialLibrary implements MaterialLibrary {
  private readonly created: Material[] = [];

  private make(color: number): Material {
    const material = new MeshBasicMaterial({ color });
    this.created.push(material);
    return material;
  }

  paintedFlat(_scene: SceneId, _element: string): Material {
    return this.make(0x808080);
  }

  wood(_kind: 'beam' | 'drum' | 'floor' | 'furniture' | 'pulley'): Material {
    return this.make(0x6b4a2f);
  }

  rope(): Material {
    return this.make(0x9a7b4f);
  }

  setRopeScroll(_offset: number): void {
    // TODO(owner B): scroll rope material UV by offset (rope travel in meters).
  }

  metal(): Material {
    return this.make(0xaaaaaa);
  }

  goldTrim(): Material {
    return this.make(0xd4af37);
  }

  auditorium(_kind: 'wall' | 'seat' | 'marble' | 'curtain'): Material {
    return this.make(0x3a3a55);
  }

  applyQuality(_tier: QualityTier): void {
    // TODO(owner B): swap texture resolution / shader complexity per tier.
  }

  dispose(): void {
    for (const material of this.created) material.dispose();
    this.created.length = 0;
  }
}

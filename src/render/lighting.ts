// src/render/lighting.ts
// Morning lighting rig: exactly ONE shadow-casting directional light (low
// warm morning angle) + soft sky-colored ambient, per VISUAL_DIRECTION.md.

import * as THREE from 'three';
import type { QualityTier } from '../contracts';

export interface MorningLightingRig {
  readonly sun: THREE.DirectionalLight;
  readonly sky: THREE.HemisphereLight;
  dispose(): void;
}

function shadowMapSizeForTier(tier: QualityTier): number {
  switch (tier) {
    case 'low':
      return 512;
    case 'medium':
      return 1024;
    case 'high':
      return 2048;
  }
}

/**
 * Adds (and returns) the single shadow-casting sun + soft ambient sky light.
 * Idempotent-ish: callers should call this once per scene and keep the
 * returned rig to `dispose()` on teardown.
 */
export function createMorningLightingRig(scene: THREE.Scene, quality: QualityTier): MorningLightingRig {
  const group = new THREE.Group();
  group.name = 'hero-lighting-rig';

  // Low warm morning angle: sun still fairly close to the horizon.
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(-9, 5.5, 6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const mapSize = shadowMapSizeForTier(quality);
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 40;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.02;
  group.add(sun);
  group.add(sun.target);

  // Soft pale-blue sky / warm ground ambient — no second shadow caster.
  const sky = new THREE.HemisphereLight(0xbcd4e6, 0xe8e0d0, 0.9);
  group.add(sky);

  scene.add(group);

  return {
    sun,
    sky,
    dispose(): void {
      scene.remove(group);
    },
  };
}

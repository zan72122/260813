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

  // Low, golden morning angle (~21° elevation) for long, legible shadows.
  // Intensity kept moderate (not pushed higher for "richness") specifically
  // because ANY smooth/metallic surface in the scene — ours or another
  // worker's (e.g. the king procession's flat gold sun-disc token) — can
  // still clip to a flat white specular patch at grazing angles even with
  // renderer.toneMapping enabled (Wave 5 fix, see src/render/index.ts) once
  // a directional light's peak specular radiance gets too high.
  const sun = new THREE.DirectionalLight(0xffdca3, 1.7);
  sun.position.set(-10, 4.2, 6.5);
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
  // Kept a touch dimmer than the sun so its long low-angle shadows stay
  // legible instead of being washed out by flat ambient fill.
  const sky = new THREE.HemisphereLight(0xbcd4e6, 0xe8e0d0, 0.85);
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

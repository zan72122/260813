/**
 * Warm-day lighting: directional key light + hemisphere ambient
 * (VISUAL_ACCEPTANCE "昼の柔らかい日光(暖色key + 空色ambient)"). Shadows
 * (single ≤1024² map) only ever enabled on the high quality tier, per
 * PERFORMANCE_BUDGET.md.
 */
import * as THREE from 'three';
import type { QualityState } from '../contracts/quality';
import { GIRDER_RING_Y } from '../scene/layout';

/** Shadow map resolution cap (px) — PERFORMANCE_BUDGET "単一directional shadow map ≤1024²". */
export const SHADOW_MAP_SIZE = 1024;

export interface Lighting {
  key: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Re-applies shadow settings for the current quality tier (call after any quality downgrade, and on context-restored rebuild). */
  applyQuality(quality: QualityState): void;
  dispose(): void;
}

export function createLighting(quality: QualityState): Lighting {
  const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
  key.position.set(60, 90, 40);
  key.target.position.set(0, GIRDER_RING_Y * 0.4, 0);

  const hemi = new THREE.HemisphereLight(0xbcd9e8, 0x8a7a55, 0.9);

  function applyQuality(q: QualityState): void {
    key.castShadow = q.shadows;
    if (q.shadows) {
      key.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      const cam = key.shadow.camera;
      cam.left = -70;
      cam.right = 70;
      cam.top = 70;
      cam.bottom = -70;
      cam.near = 10;
      cam.far = 220;
      cam.updateProjectionMatrix();
      key.shadow.bias = -0.0015;
    }
  }
  applyQuality(quality);

  function dispose(): void {
    key.dispose();
    hemi.dispose();
    key.shadow.dispose();
  }

  return { key, hemi, applyQuality, dispose };
}

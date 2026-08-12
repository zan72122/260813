// src/render/index.ts
// applyHeroMaterials(scene, quality) — see docs/CONTRACTS.md wiring section.
// Traverses named meshes ('valve-head', 'wrench', 'fountain-*', hedges,
// stone, statues, sun token) and upgrades their materials to the hero set,
// then installs the single-shadow-caster morning lighting rig.
//
// Note for Integrator: PMREM environment reflection needs a WebGLRenderer,
// which the frozen wiring signature (scene, quality) doesn't carry. This adds
// an OPTIONAL third `renderer` param — passing it enables the gold/brass env
// reflection; omitting it still upgrades all materials, just without env
// reflection. This is additive-only and does not break the 2-arg call shape.

import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { buildHeroMaterials, makeWetStone, type HeroMaterialSet } from './materials';
import { createMorningLightingRig, type MorningLightingRig } from './lighting';
import { buildHeroEnvironment, type HeroEnvironment } from './envmap';

export { makeWetStone } from './materials';
export type { HeroMaterialSet } from './materials';
export { createMorningLightingRig } from './lighting';
export type { MorningLightingRig } from './lighting';
export { buildHeroEnvironment } from './envmap';
export type { HeroEnvironment } from './envmap';

export interface HeroMaterialsHandle {
  readonly materials: HeroMaterialSet;
  readonly lighting: MorningLightingRig;
  readonly env: HeroEnvironment | null;
  /** Meshes classified as "stone" during traversal — candidates for makeWetStone(). */
  readonly wetStoneMeshes: readonly THREE.Mesh[];
  /** Convenience: apply a uniform wetness (0..1) to every classified stone mesh. */
  setWetness(intensity: number): void;
  dispose(): void;
}

interface NameRule {
  test(name: string): boolean;
  materialKey: keyof HeroMaterialSet & ('hedge' | 'stone' | 'gold' | 'brass');
  trackAsStone?: boolean;
}

const RULES: NameRule[] = [
  { test: (n) => n === 'valve-head' || n.includes('valve') || n === 'wrench' || n.includes('wrench'), materialKey: 'brass' },
  { test: (n) => n.includes('sun') || n.includes('statue') || n.includes('gilt') || n.includes('gold'), materialKey: 'gold' },
  { test: (n) => n.includes('hedge') || n.includes('topiary'), materialKey: 'hedge' },
  {
    test: (n) =>
      n.includes('stone') ||
      n.includes('basin') ||
      n.includes('curb') ||
      n.includes('pedestal') ||
      n.includes('balustrade') ||
      (n.startsWith('fountain-') && (n.includes('rim') || n.includes('base') || n.includes('pool'))),
    materialKey: 'stone',
    trackAsStone: true,
  },
];

export function applyHeroMaterials(
  scene: THREE.Scene,
  quality: QualityTier,
  renderer?: THREE.WebGLRenderer,
): HeroMaterialsHandle {
  const env = renderer ? buildHeroEnvironment(renderer) : null;
  const materials = buildHeroMaterials(quality, env?.texture ?? null);
  const lighting = createMorningLightingRig(scene, quality);
  const wetStoneMeshes: THREE.Mesh[] = [];

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const name = obj.name.toLowerCase();
    if (!name) return;
    for (const rule of RULES) {
      if (!rule.test(name)) continue;
      obj.material = materials[rule.materialKey];
      obj.castShadow = rule.materialKey !== 'stone';
      obj.receiveShadow = true;
      if (rule.trackAsStone) wetStoneMeshes.push(obj);
      break;
    }
  });

  return {
    materials,
    lighting,
    env,
    wetStoneMeshes,
    setWetness(intensity: number): void {
      for (const mesh of wetStoneMeshes) makeWetStone(mesh, intensity);
    },
    dispose(): void {
      materials.dispose();
      lighting.dispose();
      env?.dispose();
    },
  };
}

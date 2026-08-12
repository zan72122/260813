// src/render/materials.ts
// Hero material factories: deep hedge green, warm stone, gilt gold, and
// brass+verdigris. Palette values come straight from docs/VISUAL_DIRECTION.md.
// Env reflection is deliberately subtle (envMapIntensity kept low) —
// "控えめな反射" (restrained reflection), never a mirror-gold look.

import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { createBrassDetailTextures, createStoneTexture } from './textures';

export interface HeroMaterialSet {
  hedge: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function buildHeroMaterials(quality: QualityTier, envMap: THREE.Texture | null): HeroMaterialSet {
  const disposables: Array<{ dispose(): void }> = [];

  const hedge = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#3d6b4a'),
    emissive: new THREE.Color('#0c1c12'),
    emissiveIntensity: 1,
    roughness: 0.92,
    metalness: 0.0,
  });
  // Slight per-vertex-less variation via a cheap fake AO: darken a touch and
  // let geometry silhouette carry the "clipped topiary" read per spec —
  // individual leaves are explicitly NOT drawn.

  const stoneTex = createStoneTexture(quality);
  disposables.push(stoneTex.map, stoneTex.roughnessMap);
  stoneTex.map.repeat.set(2, 2);
  stoneTex.roughnessMap.repeat.set(2, 2);
  const stone = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e8e2d4'),
    map: stoneTex.map,
    roughnessMap: stoneTex.roughnessMap,
    roughness: 0.85,
    metalness: 0.02,
  });

  const gold = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c9a227'),
    emissive: new THREE.Color('#5a4308'),
    emissiveIntensity: 0.06,
    roughness: 0.35,
    metalness: 0.85,
  });
  if (envMap) {
    gold.envMap = envMap;
    gold.envMapIntensity = 0.55;
  }

  const brassTex = createBrassDetailTextures(quality);
  disposables.push(brassTex.normalMap, brassTex.roughnessMap, brassTex.colorMap);
  const brass = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    map: brassTex.colorMap,
    normalMap: brassTex.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: brassTex.roughnessMap,
    roughness: 0.55,
    metalness: 0.75,
  });
  if (envMap) {
    brass.envMap = envMap;
    brass.envMapIntensity = 0.35;
  }

  return {
    hedge,
    stone,
    gold,
    brass,
    dispose(): void {
      hedge.dispose();
      stone.dispose();
      gold.dispose();
      brass.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Darkens + glosses a stone mesh's material to read as freshly wetted by an
 * active fountain (roughness drop + subtle darken). Time-agnostic: the spec
 * explicitly allows it to stay wet indefinitely once triggered. Safe to call
 * repeatedly with the same or different intensity (0..1).
 */
export function makeWetStone(mesh: THREE.Mesh, wetness = 1): void {
  const material = mesh.material;
  const materials = Array.isArray(material) ? material : [material];
  for (const mat of materials) {
    if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
    const baseRoughness = (mat.userData.__dryRoughness as number | undefined) ?? mat.roughness;
    const baseColor = (mat.userData.__dryColor as THREE.Color | undefined) ?? mat.color.clone();
    mat.userData.__dryRoughness = baseRoughness;
    mat.userData.__dryColor = baseColor;

    const t = Math.min(1, Math.max(0, wetness));
    mat.roughness = THREE.MathUtils.lerp(baseRoughness, Math.min(baseRoughness, 0.18), t);
    mat.color.copy(baseColor).lerp(new THREE.Color('#8f9a8a'), t * 0.35);
    mat.needsUpdate = true;
  }
}

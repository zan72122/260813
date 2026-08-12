// src/render/envmap.ts
// Builds a subtle PMREM environment map from a small procedurally generated
// gradient-sky canvas (no HDRI file) for gold/brass reflections per
// VISUAL_DIRECTION.md "控えめな反射" (restrained reflection) guidance.

import * as THREE from 'three';
import { createEnvSkyCanvas } from './textures';

export interface HeroEnvironment {
  texture: THREE.Texture;
  dispose(): void;
}

export function buildHeroEnvironment(renderer: THREE.WebGLRenderer): HeroEnvironment {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const equirect = new THREE.CanvasTexture(createEnvSkyCanvas());
  equirect.colorSpace = THREE.SRGBColorSpace;
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.needsUpdate = true;

  const renderTarget = pmrem.fromEquirectangular(equirect);
  equirect.dispose();

  return {
    texture: renderTarget.texture,
    dispose(): void {
      renderTarget.dispose();
      pmrem.dispose();
    },
  };
}

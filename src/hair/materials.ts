import * as THREE from 'three';
import { HAIR, GEM, PALETTE, REDUCED_MOTION, STYLE } from '../style';

/**
 * Hero materials of the piece (see STYLE_LOCK.hairMaterial / gemMaterial):
 *   1. hair — silk sheen, warm apricot, teal rim from the rim light
 *   2. gem — dew-drop opal, faceted, softly self-lit
 *   3. sky dome (lives in stage.ts)
 * Everything else stays quiet on purpose.
 */

const patchedShaders: THREE.WebGLProgramParametersWithUniforms[] = [];

export function tickHairTime(time: number): void {
  for (const s of patchedShaders) {
    s.uniforms.uTime.value = time;
  }
}

const SWAY_AMP = REDUCED_MOTION
  ? STYLE.motionReduction.prefersReducedMotion.swayAmplitude
  : HAIR.swayAmplitude;

/**
 * Living-hair material. A gentle vertex sway, weighted toward the tips via
 * uv.y, keeps every strand breathing — cheaper and calmer than physics.
 */
export function makeHairMaterial(opts?: { shadowTint?: boolean; under?: boolean; sway?: number }): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(
      opts?.under ? PALETTE.hairUnder : opts?.shadowTint ? PALETTE.hairShadow : PALETTE.hairBase
    ),
    roughness: opts?.shadowTint || opts?.under ? 0.6 : HAIR.roughness,
    metalness: HAIR.metalness,
    sheen: HAIR.sheen,
    sheenRoughness: HAIR.sheenRoughness,
    sheenColor: new THREE.Color(PALETTE.hairSheen),
    clearcoat: HAIR.clearcoat,
    clearcoatRoughness: HAIR.clearcoatRoughness,
    envMapIntensity: HAIR.envMapIntensity,
    emissive: new THREE.Color(PALETTE.hintGlow),
    emissiveIntensity: 0
  });
  const sway = (opts?.sway ?? 1) * SWAY_AMP;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime; uniform float uSway;
         varying float vTip;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vTip = uv.y;
         {
           float w = pow(uv.y, 1.6);
           float ph = position.x * 3.1 + position.y * 2.3;
           transformed.x += sin(uTime * ${(Math.PI * 2 / HAIR.swayPeriod).toFixed(4)} + ph) * uSway * w;
           transformed.z += cos(uTime * ${(Math.PI * 2 / (HAIR.swayPeriod * 1.31)).toFixed(4)} + ph * 1.7) * uSway * 0.6 * w;
         }`
      );
    patchedShaders.push(shader);
  };
  return mat;
}

export function makeGemMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(PALETTE.gemCore),
    roughness: GEM.roughness,
    metalness: GEM.metalness,
    envMapIntensity: GEM.envMapIntensity,
    emissive: new THREE.Color(GEM.emissive),
    emissiveIntensity: GEM.emissiveIntensityIdle,
    flatShading: true
  });
}

export function makeSkinMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.skin),
    roughness: 0.75,
    metalness: 0
  });
}

export function makeDressMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.dress),
    roughness: 0.85,
    metalness: 0.05
  });
}

/** Soft radial glow texture, generated once — used by hint & halo sprites. */
let glowTex: THREE.Texture | null = null;
export function getGlowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,244,220,0.55)');
  grad.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

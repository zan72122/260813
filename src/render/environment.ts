/**
 * A tiny procedural (canvas-generated, per ARCHITECTURE_CONTRACT) equirect
 * environment, prefiltered via `PMREMGenerator` and set as `scene.environment`
 * so the metallic hero materials (brass, black iron, steel cable/rails) get
 * real specular image-based lighting instead of rendering near-black --
 * three.js metals with no environment have almost no diffuse response
 * (`diffuse *= 1 - metalness`) and nothing for their specular BRDF to
 * reflect. This is generated once at scene-build time, not per frame.
 */

import * as THREE from 'three';

import { PALETTE } from '../contracts/constants.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';

function buildEquirectCanvas(): HTMLCanvasElement {
  const width = 128;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('environment: 2D canvas context unavailable');

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, PALETTE.skyZenith);
  grad.addColorStop(0.42, PALETTE.skyHorizon);
  grad.addColorStop(0.52, '#c9c2a8');
  grad.addColorStop(1, '#6b6555');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // A soft warm "lamp" glow band low in the sky so brass/steel catch a highlight.
  const glow = ctx.createRadialGradient(width * 0.72, height * 0.4, 0, width * 0.72, height * 0.4, width * 0.22);
  glow.addColorStop(0, 'rgba(255,190,120,0.9)');
  glow.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

export interface EnvironmentResult {
  readonly texture: THREE.Texture;
}

/** Build + assign `scene.environment`; caller registers the returned texture for disposal. */
export function applyProceduralEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  registry: DisposeRegistry,
): EnvironmentResult {
  const equirect = new THREE.CanvasTexture(buildEquirectCanvas());
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  equirect.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(equirect);
  pmrem.dispose();
  equirect.dispose();

  scene.environment = target.texture;
  scene.environmentIntensity = 1;
  registry.track(target.texture);

  return { texture: target.texture };
}

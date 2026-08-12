// src/app/renderer.ts
// WebGL2 renderer bootstrap. Owned by Integrator (src/app/**).

import * as THREE from 'three';
import { MAX_DPR, computeViewportProfile } from './viewport';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const context = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  if (!context) {
    throw new Error('WebGL2 is not available on this device.');
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    context: context as WebGL2RenderingContext,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });

  const { width, height, dpr } = computeViewportProfile();
  renderer.setPixelRatio(Math.min(dpr, MAX_DPR));
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  return renderer;
}

export function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  dpr: number,
): void {
  renderer.setPixelRatio(Math.min(dpr, MAX_DPR));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

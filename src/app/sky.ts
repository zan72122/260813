// src/app/sky.ts
// Procedural sky gradient texture (no external assets). Owned by Integrator.

import * as THREE from 'three';

/**
 * Builds a small vertical-gradient canvas texture to use as `scene.background`.
 * Fully procedural — no network/asset fetch, safe for offline static hosting.
 */
export function createSkyGradientTexture(
  topColor = '#8fc7ff',
  bottomColor = '#eaf6ff',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for sky gradient.');

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// src/render/textures.ts
// Procedural canvas textures for hero materials. No external images —
// everything is drawn on an offscreen <canvas> at runtime. Sizes are capped
// per QualityTier (≤1024px) per MASTER_SPEC / VISUAL_DIRECTION.

import * as THREE from 'three';
import type { QualityTier } from '../contracts';

export function textureSizeForTier(tier: QualityTier): number {
  switch (tier) {
    case 'low':
      return 256;
    case 'medium':
      return 512;
    case 'high':
      return 1024;
  }
}

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for procedural texture.');
  return { canvas, ctx };
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Warm gray-white Versailles stone: subtle mottled blocks + fine speckle so
 * macro camera distances still read as quarried stone, not a flat fill.
 */
export function createStoneTexture(tier: QualityTier): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const size = textureSizeForTier(tier);
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(101);

  ctx.fillStyle = '#e2dac9';
  ctx.fillRect(0, 0, size, size);

  // Large soft mottling blocks.
  const blockCount = Math.max(8, Math.floor(size / 48));
  for (let i = 0; i < blockCount * blockCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.06 + rand() * 0.09);
    const shade = 210 + Math.floor(rand() * 34) - 17;
    ctx.fillStyle = `rgba(${shade}, ${shade - 6}, ${shade - 20}, 0.24)`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine speckle grain.
  const speckleCount = size * 10;
  for (let i = 0; i < speckleCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${0.02 + rand() * 0.03})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // Sparse mortar-like joint lines.
  ctx.strokeStyle = 'rgba(120,112,94,0.12)';
  ctx.lineWidth = Math.max(1, size / 512);
  const joints = Math.max(3, Math.floor(size / 180));
  for (let i = 1; i < joints; i++) {
    const y = (size / joints) * i + (rand() - 0.5) * 8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rand() - 0.5) * 10);
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  // Roughness variant: grayscale, brighter = rougher (dry stone).
  const { canvas: rCanvas, ctx: rCtx } = makeCanvas(size);
  const rRand = seededRandom(202);
  rCtx.fillStyle = '#c9c9c9';
  rCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < speckleCount; i++) {
    const x = rRand() * size;
    const y = rRand() * size;
    const shade = 150 + Math.floor(rRand() * 80);
    rCtx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.4)`;
    rCtx.fillRect(x, y, 1, 1);
  }
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;

  return { map, roughnessMap };
}

/**
 * Brass + verdigris canvas normal/roughness detail for valve heads and the
 * wrench — enough surface variation to survive a macro camera without a
 * real 3D-scanned normal map.
 */
export function createBrassDetailTextures(tier: QualityTier): {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  colorMap: THREE.CanvasTexture;
} {
  const size = textureSizeForTier(tier);
  const rand = seededRandom(303);

  // Height-ish field built from soft radial bumps (patina blotches) painted
  // in grayscale, then converted to a fake normal map via a Sobel pass.
  const { ctx: hCtx } = makeCanvas(size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);
  const bumpCount = size * 2;
  for (let i = 0; i < bumpCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.01 + rand() * 0.025);
    const raise = rand() < 0.5;
    const grad = hCtx.createRadialGradient(x, y, 0, x, y, r);
    const centerV = raise ? 150 : 90;
    grad.addColorStop(0, `rgba(${centerV},${centerV},${centerV},0.5)`);
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    hCtx.fillStyle = grad;
    hCtx.beginPath();
    hCtx.arc(x, y, r, 0, Math.PI * 2);
    hCtx.fill();
  }
  const heightData = hCtx.getImageData(0, 0, size, size);

  const { canvas: nCanvas, ctx: nCtx } = makeCanvas(size);
  const normalImg = nCtx.createImageData(size, size);
  const at = (x: number, y: number): number => {
    const cx = (x + size) % size;
    const cy = (y + size) % size;
    return heightData.data[(cy * size + cx) * 4] ?? 128;
  };
  const strength = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      normalImg.data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(normalImg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;

  // Color map: warm brass base with verdigris (#5e8f7a) patina blotches
  // reusing the same height field for coherent placement.
  const { canvas: cCanvas, ctx: cCtx } = makeCanvas(size);
  cCtx.fillStyle = '#a67c3d';
  cCtx.fillRect(0, 0, size, size);
  const cRand = seededRandom(404);
  // Sparse verdigris blotches: an accent on the brass, never the dominant hue.
  const patinaCount = Math.max(6, Math.floor(size / 40));
  for (let i = 0; i < patinaCount; i++) {
    const x = cRand() * size;
    const y = cRand() * size;
    const r = size * (0.015 + cRand() * 0.03);
    const grad = cCtx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(94,143,122,0.4)');
    grad.addColorStop(1, 'rgba(94,143,122,0)');
    cCtx.fillStyle = grad;
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();
  }
  const colorMap = new THREE.CanvasTexture(cCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.wrapS = THREE.RepeatWrapping;
  colorMap.wrapT = THREE.RepeatWrapping;
  colorMap.needsUpdate = true;

  // Roughness: brighter where patina sits (rougher), darker on polished brass.
  const { canvas: rCanvas, ctx: rCtx } = makeCanvas(size);
  rCtx.fillStyle = '#585858';
  rCtx.fillRect(0, 0, size, size);
  rCtx.drawImage(cCanvas, 0, 0);
  rCtx.globalCompositeOperation = 'source-atop';
  rCtx.fillStyle = 'rgba(255,255,255,0.25)';
  rCtx.fillRect(0, 0, size, size);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap, colorMap };
}

/** Small vertical gradient used to build a PMREM environment map (no HDRI file). */
export function createEnvSkyCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for env sky.');
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, '#bcd4e6');
  gradient.addColorStop(0.55, '#dfe7d8');
  gradient.addColorStop(1, '#e8e0d0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  // Soft warm sun glow low on the horizon (morning light source hint).
  const sun = ctx.createRadialGradient(48, 46, 0, 48, 46, 22);
  sun.addColorStop(0, 'rgba(255,230,180,0.9)');
  sun.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
}

/**
 * Subtle clipped-topiary color variation: soft mottled patches (darker/
 * lighter foliage clumps) + fine speckle over the base hedge green, so large
 * flat hedge blocks don't read as one dead-flat fill under the Wave 5
 * "materials/lighting richness" pass. Individual leaves are still NOT drawn
 * (VISUAL_DIRECTION: silhouette carries the read, not per-leaf detail).
 */
export function createHedgeTexture(tier: QualityTier): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const size = textureSizeForTier(tier);
  const { canvas, ctx } = makeCanvas(size);
  const rand = seededRandom(505);

  ctx.fillStyle = '#3d6b4a';
  ctx.fillRect(0, 0, size, size);

  // Soft clumps of foliage — some darker (shadowed pockets), some lighter
  // (sun-catching tips) — at a scale that reads as clipped topiary texture.
  const clumpCount = Math.max(24, Math.floor(size / 10));
  for (let i = 0; i < clumpCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.02 + rand() * 0.045);
    const lighter = rand() < 0.55;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    if (lighter) {
      grad.addColorStop(0, 'rgba(150,190,140,0.30)');
    } else {
      grad.addColorStop(0, 'rgba(20,45,28,0.30)');
    }
    grad.addColorStop(1, 'rgba(61,107,74,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine speckle for close-up (macro camera) grain.
  const speckleCount = size * 6;
  for (let i = 0; i < speckleCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const lighter = rand() < 0.5;
    ctx.fillStyle = lighter ? 'rgba(210,230,180,0.05)' : 'rgba(10,25,15,0.06)';
    ctx.fillRect(x, y, 1, 1);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;

  const { canvas: rCanvas, ctx: rCtx } = makeCanvas(size);
  const rRand = seededRandom(606);
  rCtx.fillStyle = '#e0e0e0';
  rCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < speckleCount; i++) {
    const x = rRand() * size;
    const y = rRand() * size;
    const shade = 170 + Math.floor(rRand() * 60);
    rCtx.fillStyle = `rgba(${shade},${shade},${shade},0.35)`;
    rCtx.fillRect(x, y, 1, 1);
  }
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.needsUpdate = true;

  return { map, roughnessMap };
}

/**
 * Very gentle gilt surface variation for statues/sun tokens: low-amplitude
 * normal bumps (hammered-gold read) so the envMap reflection sparkles softly
 * across the surface instead of behaving like a perfect mirror.
 */
export function createGoldDetailTexture(tier: QualityTier): THREE.CanvasTexture {
  const size = textureSizeForTier(tier);
  const rand = seededRandom(707);

  const { ctx: hCtx } = makeCanvas(size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);
  const bumpCount = Math.floor(size * 1.2);
  for (let i = 0; i < bumpCount; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.008 + rand() * 0.016);
    const raise = rand() < 0.5;
    const grad = hCtx.createRadialGradient(x, y, 0, x, y, r);
    const centerV = raise ? 138 : 108;
    grad.addColorStop(0, `rgba(${centerV},${centerV},${centerV},0.35)`);
    grad.addColorStop(1, 'rgba(128,128,128,0)');
    hCtx.fillStyle = grad;
    hCtx.beginPath();
    hCtx.arc(x, y, r, 0, Math.PI * 2);
    hCtx.fill();
  }
  const heightData = hCtx.getImageData(0, 0, size, size);

  const { canvas: nCanvas, ctx: nCtx } = makeCanvas(size);
  const normalImg = nCtx.createImageData(size, size);
  const at = (x: number, y: number): number => {
    const cx = (x + size) % size;
    const cy = (y + size) % size;
    return heightData.data[(cy * size + cx) * 4] ?? 128;
  };
  const strength = 1.1; // gentle — this is a sparkle, not a rough hammered texture
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const idx = (y * size + x) * 4;
      normalImg.data[idx] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 3] = 255;
    }
  }
  nCtx.putImageData(normalImg, 0, 0);
  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.needsUpdate = true;
  return normalMap;
}

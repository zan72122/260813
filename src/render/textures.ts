/**
 * Procedural canvas textures for the five hero material families
 * (VISUAL_ACCEPTANCE "Hero materials"). Every texture is generated at
 * runtime on an offscreen `<canvas>` — no network fetches, no binary
 * assets — and stays well under the 2048px/texture and 64MB-total budgets
 * (PERFORMANCE_BUDGET). Browser-only (uses `document`); never imported by
 * `tests/unit/**` (node env, no DOM canvas 2D context).
 */

import * as THREE from 'three';

import { PALETTE } from '../contracts/constants.ts';

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('textures: 2D canvas context unavailable');
  return { canvas, ctx };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finishTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Dark warm-grey iron lattice: subtle mottled roughness + faint rivet dots.
 * Rendered noticeably LIGHTER than the frozen `PALETTE.iron` anchor itself
 * (a near-black `#2b2b30`) -- at that literal luminance the lattice reads as
 * a flat unlit silhouette once actually lit and photographed, losing the
 * "subtle roughness variation" VISUAL_ACCEPTANCE calls for. Lifting the
 * texture's own base tone keeps it recognizably dark iron while leaving
 * headroom for real shading/highlight detail to show through.
 */
export function createIronTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const rand = mulberry32(1001);
  const base = new THREE.Color(PALETTE.iron).lerp(new THREE.Color('#9a9aa0'), 0.22);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, size, size);
  // Mottled patina speckle.
  for (let i = 0; i < 900; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = rand() * 0.5 + 0.5;
    const c = Math.round(90 + shade * 40);
    ctx.fillStyle = `rgba(${c + 8},${c + 6},${c + 10},${0.10 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, rand() * 1.6 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Painted panel seams.
  ctx.strokeStyle = 'rgba(30,28,30,0.45)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    const p = (i / 4) * size;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  // Rivet hints along the seams.
  ctx.fillStyle = 'rgba(70,66,58,0.7)';
  for (let i = 0; i <= 4; i += 1) {
    const y = (i / 4) * size;
    for (let x = 8; x < size; x += 24) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finishTexture(canvas, 2, 2);
}

/** Polished brass: warm gradient sweep + light burnish scratches. */
export function createBrassTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#8c6c2c');
  grad.addColorStop(0.45, PALETTE.brass);
  grad.addColorStop(0.55, '#d8b768');
  grad.addColorStop(1, '#8c6c2c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(2002);
  ctx.strokeStyle = 'rgba(255,240,210,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i += 1) {
    const y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rand() - 0.5) * 6);
    ctx.stroke();
  }
  return finishTexture(canvas, 1, 1);
}

/** Oily black-iron machinery body: near-black with soft specular sheen bands. */
export function createBlackIronTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#2a2a2f';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(3003);
  for (let i = 0; i < 24; i += 1) {
    const y = rand() * size;
    const w = 4 + rand() * 10;
    const grad = ctx.createLinearGradient(0, y - w, 0, y + w);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(210,210,220,${0.12 + rand() * 0.1})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - w, size, w * 2);
  }
  return finishTexture(canvas, 1, 1);
}

/**
 * Twisted steel cable: diagonal strand striping wrapped around the tube
 * circumference, with one brighter helical highlight band baked in so
 * scrolling the texture's V offset (driven by `cableTravel`) reads as the
 * cable actually moving (VISUAL_ACCEPTANCE "moving highlight").
 */
export function createCableTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('textures: 2D canvas context unavailable');
  ctx.fillStyle = '#6b6f76';
  ctx.fillRect(0, 0, w, h);
  const strands = 6;
  const twistPerH = 3; // full twists along the texture height
  for (let s = 0; s < strands; s += 1) {
    ctx.strokeStyle = s === 0 ? '#eef1f4' : 'rgba(40,42,46,0.5)';
    ctx.lineWidth = s === 0 ? 3.5 : 5;
    ctx.beginPath();
    const phase = (s / strands) * w;
    for (let y = -w; y <= h + w; y += 4) {
      const x = ((phase + (y / h) * twistPerH * w) % w + w) % w;
      if (y === -w) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      // wrap seam: draw a second pass shifted by -w and +w so strands cross the edge continuously
    }
    ctx.stroke();
  }
  return finishTexture(canvas, 1, 4);
}

/** Warm ochre cabin panelling: painted vertical planks + rivet rows. */
export function createCabinTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = PALETTE.cabinOchre;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(90,58,10,0.28)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 8; i += 1) {
    const x = (i / 8) * size;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  const rand = mulberry32(4004);
  ctx.fillStyle = 'rgba(70,45,10,0.35)';
  for (let i = 1; i < 8; i += 1) {
    const x = (i / 8) * size;
    for (let y = 6; y < size; y += 28) {
      ctx.beginPath();
      ctx.arc(x, y + rand() * 3, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Soft top-to-bottom sheen so the ochre reads warm and lacquered.
  const sheen = ctx.createLinearGradient(0, 0, 0, size);
  sheen.addColorStop(0, 'rgba(255,235,190,0.18)');
  sheen.addColorStop(0.5, 'rgba(255,235,190,0)');
  sheen.addColorStop(1, 'rgba(40,20,0,0.12)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
  return finishTexture(canvas, 1, 1);
}

/** Soft radial dot sprite used for the additive steam/sparkle particle fx. */
export function createSoftDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('textures: 2D canvas context unavailable');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Ground plane: soft mottled Champ-de-Mars green with faint gravel paths. */
export function createGroundTexture(): THREE.CanvasTexture {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#b7c39a';
  ctx.fillRect(0, 0, size, size);
  const rand = mulberry32(5005);
  for (let i = 0; i < 1400; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const g = 150 + rand() * 40;
    ctx.fillStyle = `rgba(${g - 40},${g},${g - 60},${0.08 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, rand() * 2 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(196,184,150,0.5)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.62);
  ctx.quadraticCurveTo(size * 0.5, size * 0.7, size, size * 0.6);
  ctx.stroke();
  return finishTexture(canvas, 24, 24);
}

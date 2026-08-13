// src/visual/textures.ts
// Procedural canvas textures (all <=512px, well under the 1024px budget).
// Every generator is a pure function of a seeded PRNG so results are
// deterministic under ?test=1 / ?seed=. No network, no external assets.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from 'three';

type Rand = () => number;

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement, repeat = true): CanvasTexture {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  if (repeat) {
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
  }
  tex.needsUpdate = true;
  return tex;
}

/** Weathered Venice-red/red-brown riveted iron plate with soot mottling. */
export function makeIronTexture(rand: Rand, size = 256): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#7a2e1e';
  ctx.fillRect(0, 0, size, size);
  // base mottling
  for (let i = 0; i < 900; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 3;
    const dark = rand() < 0.5;
    ctx.fillStyle = dark ? `rgba(30,18,14,${0.05 + rand() * 0.15})` : `rgba(170,90,55,${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // soot streaks
  for (let i = 0; i < 26; i += 1) {
    const x = rand() * size;
    ctx.strokeStyle = `rgba(15,12,10,${0.06 + rand() * 0.1})`;
    ctx.lineWidth = 2 + rand() * 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rand() - 0.5) * 30, size);
    ctx.stroke();
  }
  // faint panel seams
  ctx.strokeStyle = 'rgba(20,10,8,0.35)';
  ctx.lineWidth = 2;
  const seams = 4;
  for (let i = 1; i < seams; i += 1) {
    const p = (i / seams) * size;
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return finish(canvas);
}

/**
 * Riveted iron with a faint procedural X-lattice cross-hatch baked in, for
 * the tower legs (VISUAL_ACCEPTANCE hero material #1: "鉄骨...X格子"). Real
 * 3D corner chords + diagonal members (tower.ts) carry the actual silhouette
 * reading; this texture is the supporting surface detail on the leg faces.
 */
export function makeLatticeIronTexture(rand: Rand, size = 256): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#7a2e1e';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 3;
    const dark = rand() < 0.5;
    ctx.fillStyle = dark ? `rgba(30,18,14,${0.05 + rand() * 0.15})` : `rgba(170,90,55,${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // X-lattice cells: a grid of cross-hatch diagonals reading as riveted panel
  // bracing at a glance, with a rivet dot at every intersection.
  const cells = 4;
  const cell = size / cells;
  ctx.strokeStyle = 'rgba(18,10,8,0.5)';
  ctx.lineWidth = Math.max(1.5, size * 0.012);
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const x0 = cx * cell;
      const y0 = cy * cell;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + cell, y0 + cell);
      ctx.moveTo(x0 + cell, y0);
      ctx.lineTo(x0, y0 + cell);
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(200,160,90,0.55)';
  const dot = Math.max(1.4, size * 0.014);
  for (let cy = 0; cy <= cells; cy += 1) {
    for (let cx = 0; cx <= cells; cx += 1) {
      ctx.beginPath();
      ctx.arc(cx * cell, cy * cell, dot, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // soot streaks (same treatment as the plain iron plate)
  for (let i = 0; i < 18; i += 1) {
    const x = rand() * size;
    ctx.strokeStyle = `rgba(15,12,10,${0.05 + rand() * 0.08})`;
    ctx.lineWidth = 2 + rand() * 5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rand() - 0.5) * 30, size);
    ctx.stroke();
  }
  return finish(canvas);
}

/** Champ-de-Mars earth/grass ground: mottled green-brown, deliberately low-
 * contrast/flat so it reads calmly under fog rather than competing with the
 * hero iron/rivet/steam materials. */
export function makeGroundTexture(rand: Rand, size = 256): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#5c6a3c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 3 + rand() * 10;
    const dirt = rand() < 0.4;
    ctx.fillStyle = dirt
      ? `rgba(112,92,58,${0.06 + rand() * 0.14})`
      : `rgba(120,138,80,${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // a few worn dirt patches near the (implied) work paths
  for (let i = 0; i < 10; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 20 + rand() * 40;
    ctx.fillStyle = `rgba(100,82,52,${0.08 + rand() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.55, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas);
}

/** Rough sawn timber planks for the yard deck. */
export function makeTimberTexture(rand: Rand, size = 256): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 0, size, size);
  const planks = 6;
  for (let i = 0; i < planks; i += 1) {
    const y = (i / planks) * size;
    const h = size / planks;
    const shade = 0.85 + rand() * 0.3;
    ctx.fillStyle = `rgba(${Math.round(120 * shade)},${Math.round(88 * shade)},${Math.round(52 * shade)},1)`;
    ctx.fillRect(0, y, size, h);
    ctx.strokeStyle = 'rgba(40,26,14,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, y, size, h);
    for (let g = 0; g < 12; g += 1) {
      const gx = rand() * size;
      ctx.strokeStyle = `rgba(60,40,20,${0.08 + rand() * 0.12})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, y + 2);
      ctx.lineTo(gx + (rand() - 0.5) * 10, y + h - 2);
      ctx.stroke();
    }
  }
  return finish(canvas);
}

/** Cream Haussmann wall + dark zinc mansard hint, for instanced backdrop blocks. */
export function makeHaussmannTexture(rand: Rand, size = 128): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#e8dcc2';
  ctx.fillRect(0, 0, size, size * 0.78);
  ctx.fillStyle = '#3a3a3f';
  ctx.fillRect(0, size * 0.78, size, size * 0.22);
  ctx.strokeStyle = 'rgba(120,105,80,0.4)';
  ctx.lineWidth = 1;
  const rows = 5;
  const cols = 4;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = (c / cols) * size + size * 0.06;
      const y = (r / rows) * size * 0.7 + size * 0.04;
      const w = size / cols - size * 0.12;
      const h = size * 0.7 / rows - size * 0.04;
      if (rand() < 0.85) {
        ctx.fillStyle = `rgba(70,80,95,${0.35 + rand() * 0.25})`;
        ctx.fillRect(x, y, w, h);
      }
    }
  }
  return finish(canvas, false);
}

/** Soft radial-gradient sprite for steam puffs. */
export function makeSoftCircleTexture(size = 64): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(canvas, false);
}

/** Elongated soft streak for spark sprites. */
export function makeSparkTexture(size = 32): CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, 'rgba(255,220,120,0)');
  g.addColorStop(0.5, 'rgba(255,210,90,0.9)');
  g.addColorStop(1, 'rgba(255,180,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, size * 0.35, size, size * 0.3);
  return finish(canvas, false);
}

/** Warm afternoon sky gradient with haze band near the horizon. */
export function makeSkyTexture(size = 256): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#5f8fc4');
  g.addColorStop(0.45, '#a7c3dd');
  g.addColorStop(0.72, '#e8cfa8');
  g.addColorStop(0.88, '#f3d9ad');
  g.addColorStop(1, '#f6e2bd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, size);
  const tex = finish(canvas, false);
  return tex;
}

export interface TextureSet {
  iron: CanvasTexture;
  latticeIron: CanvasTexture;
  ground: CanvasTexture;
  timber: CanvasTexture;
  haussmann: CanvasTexture;
  softCircle: CanvasTexture;
  spark: CanvasTexture;
  sky: CanvasTexture;
}

export function buildTextureSet(rand: Rand): TextureSet {
  const latticeIron = makeLatticeIronTexture(rand);
  latticeIron.repeat.set(3, 7);
  const ground = makeGroundTexture(rand);
  ground.repeat.set(48, 48);
  return {
    iron: makeIronTexture(rand),
    latticeIron,
    ground,
    timber: makeTimberTexture(rand),
    haussmann: makeHaussmannTexture(rand),
    softCircle: makeSoftCircleTexture(),
    spark: makeSparkTexture(),
    sky: makeSkyTexture(),
  };
}

export function disposeTextureSet(set: TextureSet): void {
  (Object.values(set) as Texture[]).forEach((t) => t.dispose());
}

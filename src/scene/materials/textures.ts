import * as THREE from 'three';

/** All textures are generated on <canvas> at runtime — no external image assets, all ≤1024px per side. */

function ctx2d(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function shade(hex: number, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Simple deterministic PRNG local to texture generation (not game-seeded, purely cosmetic grain). */
function localRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWoodGrainTexture(baseColor: number, size = 512, seed = 1): THREE.CanvasTexture {
  const { canvas, ctx } = ctx2d(size);
  const rand = localRand(seed);
  ctx.fillStyle = shade(baseColor, 0);
  ctx.fillRect(0, 0, size, size);

  // Horizontal-ish flowing grain lines with gentle sine wobble.
  const lineCount = 26;
  for (let i = 0; i < lineCount; i++) {
    const y0 = (i / lineCount) * size + rand() * 6;
    const amp = 4 + rand() * 10;
    const freq = 0.008 + rand() * 0.01;
    const phase = rand() * Math.PI * 2;
    const tone = rand() > 0.5 ? 14 : -18;
    ctx.strokeStyle = shade(baseColor, tone);
    ctx.globalAlpha = 0.25 + rand() * 0.2;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // A few subtle knots.
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 4; i++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 6 + rand() * 10;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, shade(baseColor, -30));
    grad.addColorStop(1, shade(baseColor, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.6, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  return toTexture(canvas, 2);
}

export function createFabricWeaveTexture(baseColor: number, size = 256, seed = 2): THREE.CanvasTexture {
  const { canvas, ctx } = ctx2d(size);
  const rand = localRand(seed);
  ctx.fillStyle = shade(baseColor, 0);
  ctx.fillRect(0, 0, size, size);

  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const warp = (x / cell + y / cell) % 2 === 0;
      const tone = warp ? 10 : -12;
      ctx.fillStyle = shade(baseColor, tone + (rand() - 0.5) * 6);
      ctx.globalAlpha = 0.5;
      if (warp) {
        ctx.fillRect(x, y, cell, cell * 0.55);
      } else {
        ctx.fillRect(x, y, cell * 0.55, cell);
      }
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(canvas, 3);
}

/** Soft radial-gradient blob used for all contact "shadows" (cheap, matches art direction's baked-feel look). */
export function createBlobShadowTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = ctx2d(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(60,45,30,0.38)');
  grad.addColorStop(0.6, 'rgba(60,45,30,0.20)');
  grad.addColorStop(1, 'rgba(60,45,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft glowing dot used for ceiling stars (Points sprite). */
export function createStarSpriteTexture(size = 64): THREE.CanvasTexture {
  const { canvas, ctx } = ctx2d(size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,248,220,1)');
  grad.addColorStop(0.35, 'rgba(255,240,190,0.9)');
  grad.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export type SymbolKind = 'star' | 'rainbow' | 'flower';

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const spikes = 5;
  const outerR = r;
  const innerR = r * 0.45;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawRainbow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const colors = ['#F2857E', '#F7D97B', '#8FD6C0', '#8EC9EB'];
  const bandWidth = r / (colors.length + 1);
  for (let i = 0; i < colors.length; i++) {
    ctx.strokeStyle = colors[i]!;
    ctx.lineWidth = bandWidth * 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.35, r - i * bandWidth, Math.PI, 0);
    ctx.stroke();
  }
}

function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const petals = 6;
  ctx.fillStyle = '#F2857E';
  for (let i = 0; i < petals; i++) {
    const angle = (Math.PI * 2 * i) / petals;
    const px = cx + Math.cos(angle) * r * 0.55;
    const py = cy + Math.sin(angle) * r * 0.55;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 0.42, r * 0.28, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#F7D97B';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

export interface SymbolAtlas {
  texture: THREE.CanvasTexture;
  uvRect: (symbol: SymbolKind) => { u0: number; v0: number; u1: number; v1: number };
}

/**
 * One shared 512px atlas holding the star/rainbow/flower icons used on baskets, toys, badges, and
 * replay UI. Fix-round-1 (B2/B3): each icon sits on its own cream/white backdrop disc with a dark
 * outline so the symbol reads with guaranteed contrast no matter what color (basket body, toy
 * accent) it is later composited over — the raw icon colors alone are not reliably distinct from
 * every basket/toy hue (e.g. a yellow star over a butter-colored surface).
 */
export function createSymbolAtlas(size = 512): SymbolAtlas {
  const { canvas, ctx } = ctx2d(size);
  ctx.clearRect(0, 0, size, size);
  const cell = size / 2;
  const positions: Record<SymbolKind, { x: number; y: number }> = {
    star: { x: 0, y: 0 },
    rainbow: { x: cell, y: 0 },
    flower: { x: 0, y: cell },
  };
  const r = cell * 0.32;
  for (const p of Object.values(positions)) {
    const cx = p.x + cell / 2;
    const cy = p.y + cell / 2;
    const backdropR = r * 1.45;
    ctx.beginPath();
    ctx.arc(cx, cy, backdropR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFBF2';
    ctx.fill();
    ctx.lineWidth = backdropR * 0.09;
    ctx.strokeStyle = 'rgba(74, 59, 44, 0.55)';
    ctx.stroke();
  }
  drawStar(ctx, positions.star.x + cell / 2, positions.star.y + cell / 2, r, '#F7D97B');
  drawRainbow(ctx, positions.rainbow.x + cell / 2, positions.rainbow.y + cell / 2, r * 1.1);
  drawFlower(ctx, positions.flower.x + cell / 2, positions.flower.y + cell / 2, r);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  const uvRect = (symbol: SymbolKind) => {
    const p = positions[symbol];
    const u0 = p.x / size;
    const v0 = 1 - (p.y + cell) / size;
    const u1 = (p.x + cell) / size;
    const v1 = 1 - p.y / size;
    return { u0, v0, u1, v1 };
  };

  return { texture: tex, uvRect };
}

/** Applies a symbol's UV rect to a plane geometry's existing UV attribute in place. */
export function applySymbolUv(geo: THREE.BufferGeometry, rect: { u0: number; v0: number; u1: number; v1: number }): void {
  const uv = geo.attributes['uv'];
  if (!uv) return;
  // PlaneGeometry default UVs: (0,0) bottom-left .. (1,1) top-right across 4 verts.
  const arr = uv.array as Float32Array;
  for (let i = 0; i < arr.length; i += 2) {
    const u = arr[i]!;
    const v = arr[i + 1]!;
    arr[i] = rect.u0 + u * (rect.u1 - rect.u0);
    arr[i + 1] = rect.v0 + v * (rect.v1 - rect.v0);
  }
  uv.needsUpdate = true;
}

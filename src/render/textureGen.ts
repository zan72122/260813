/**
 * Procedural canvas-2D painters for the "painted stage flat / dollhouse" look
 * described in docs/VISUAL_DIRECTION.md. Pure canvas painting utilities, no
 * three.js dependency, so they can be unit-exercised cheaply and reused by
 * every material generator in MaterialLibrary.ts. All output is deterministic
 * per (key, size) via a seeded PRNG so regenerating a texture at a new
 * QualityTier reproduces the same painting, just at a different resolution.
 */

export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) seeded from a string key. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFor(key: string): Rng {
  return mulberry32(hashSeed(key));
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToCss(c: Rgb, a = 1): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function lighten(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  return rgbToCss(lerpRgb(c, { r: 255, g: 255, b: 255 }, amount), 1);
}

export function darken(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  return rgbToCss(lerpRgb(c, { r: 0, g: 0, b: 0 }, amount), 1);
}

export function withAlpha(hex: string, a: number): string {
  return rgbToCss(hexToRgb(hex), a);
}

/** Diagonal linear gradient fill spanning the whole canvas. */
export function paintBaseGradient(
  ctx: CanvasRenderingContext2D,
  size: number,
  colorA: string,
  colorB: string,
  angleDeg = 90
): void {
  const rad = (angleDeg * Math.PI) / 180;
  const hw = size / 2;
  const x0 = hw - Math.cos(rad) * hw;
  const y0 = hw - Math.sin(rad) * hw;
  const x1 = hw + Math.cos(rad) * hw;
  const y1 = hw + Math.sin(rad) * hw;
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
}

/** Fine woven-thread crosshatch, imitating canvas cloth weave under paint. */
export function paintClothWeave(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  color = 'rgba(20,14,8,0.05)'
): void {
  const step = Math.max(2, Math.round(size / 96));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.5, size / 1400);
  for (let y = -step; y <= size + step; y += step) {
    const jitter = (rng() - 0.5) * step * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y + jitter);
    ctx.lineTo(size, y - jitter);
    ctx.stroke();
  }
  for (let x = -step; x <= size + step; x += step) {
    const jitter = (rng() - 0.5) * step * 0.5;
    ctx.beginPath();
    ctx.moveTo(x + jitter, 0);
    ctx.lineTo(x - jitter, size);
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft curved brushstroke gradients, imitating hand-painted flats. */
export function paintBrushStrokes(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  colors: string[],
  count = 22
): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const len = size * (0.22 + rng() * 0.55);
    const angle = rng() * Math.PI * 2;
    const color = colors[Math.floor(rng() * colors.length)] ?? colors[0] ?? '#808080';
    const hx = (Math.cos(angle) * len) / 2;
    const hy = (Math.sin(angle) * len) / 2;
    const grad = ctx.createLinearGradient(cx - hx, cy - hy, cx + hx, cy + hy);
    grad.addColorStop(0, withAlpha(color, 0));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, withAlpha(color, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = size * (0.05 + rng() * 0.1);
    ctx.globalAlpha = 0.08 + rng() * 0.14;
    const mx = cx + (rng() - 0.5) * len * 0.35;
    const my = cy + (rng() - 0.5) * len * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - hx, cy - hy);
    ctx.quadraticCurveTo(mx, my, cx + hx, cy + hy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Irregular darkened border band, imitating a hand-painted flat's worn edge. */
export function paintEdgeUnevenness(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  color = 'rgba(18,12,8,0.4)'
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const band = size * 0.07;
  const segments = 14;
  const sides: Array<[number, number, number, number, boolean]> = [
    [0, 0, size, band, true],
    [0, size - band, size, band, true],
    [0, 0, band, size, false],
    [size - band, 0, band, size, false]
  ];
  for (const [sx, sy, sw, sh, horizontal] of sides) {
    for (let i = 0; i < segments; i++) {
      ctx.globalAlpha = 0.12 + rng() * 0.18;
      ctx.fillStyle = color;
      const jitter = 0.4 + rng() * 0.6;
      if (horizontal) {
        const segW = sw / segments;
        ctx.fillRect(sx + i * segW, sy, segW + 1, sh * jitter);
      } else {
        const segH = sh / segments;
        ctx.fillRect(sx, sy + i * segH, sw * jitter, segH + 1);
      }
    }
  }
  ctx.restore();
}

export type GrainOrientation = 'horizontal' | 'vertical';

/** Old-wood grain: streaked fibers, occasional knots, worn highlight. */
export function paintWoodGrain(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  base: string,
  dark: string,
  orientation: GrainOrientation = 'horizontal'
): void {
  paintBaseGradient(ctx, size, lighten(base, 0.06), darken(base, 0.18), orientation === 'horizontal' ? 4 : 94);
  ctx.save();
  const baseRgb = hexToRgb(base);
  const darkRgb = hexToRgb(dark);
  const lines = 46;
  for (let i = 0; i < lines; i++) {
    const t = rng();
    const c = lerpRgb(baseRgb, darkRgb, 0.15 + t * 0.75);
    ctx.strokeStyle = rgbToCss(c, 0.12 + rng() * 0.22);
    ctx.lineWidth = size * (0.002 + rng() * 0.009);
    const segs = 9;
    ctx.beginPath();
    if (orientation === 'horizontal') {
      let y = rng() * size;
      ctx.moveTo(0, y);
      for (let s = 1; s <= segs; s++) {
        y += (rng() - 0.5) * size * 0.035;
        ctx.lineTo((size * s) / segs, y);
      }
    } else {
      let x = rng() * size;
      ctx.moveTo(x, 0);
      for (let s = 1; s <= segs; s++) {
        x += (rng() - 0.5) * size * 0.035;
        ctx.lineTo(x, (size * s) / segs);
      }
    }
    ctx.stroke();
  }
  const knots = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < knots; i++) {
    const kx = rng() * size;
    const ky = rng() * size;
    const kr = size * (0.018 + rng() * 0.03);
    const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
    grad.addColorStop(0, rgbToCss(darkRgb, 0.6));
    grad.addColorStop(0.7, rgbToCss(darkRgb, 0.25));
    grad.addColorStop(1, rgbToCss(darkRgb, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(kx, ky, kr, 0, Math.PI * 2);
    ctx.fill();
  }
  // worn edge highlight (corners lighten slightly, like handled wood)
  ctx.globalCompositeOperation = 'screen';
  const cornerGrad = ctx.createRadialGradient(size * 0.15, size * 0.15, 0, size * 0.15, size * 0.15, size * 0.5);
  cornerGrad.addColorStop(0, rgbToCss(baseRgb, 0.18));
  cornerGrad.addColorStop(1, rgbToCss(baseRgb, 0));
  ctx.fillStyle = cornerGrad;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
}

/** Twisted hemp-rope strands, tileable along V (rope length). */
export function paintRopeTwist(ctx: CanvasRenderingContext2D, size: number, rng: Rng): void {
  paintBaseGradient(ctx, size, '#c9b184', '#a88a58', 0);
  ctx.save();
  const period = Math.max(6, Math.round(size / 9));
  ctx.lineWidth = period * 0.62;
  ctx.lineCap = 'round';
  const strandColors = ['rgba(74,54,26,0.38)', 'rgba(238,222,180,0.3)', 'rgba(74,54,26,0.22)'];
  let idx = 0;
  for (let offset = -size; offset < size * 2; offset += period) {
    ctx.strokeStyle = strandColors[idx % strandColors.length] ?? strandColors[0]!;
    idx++;
    ctx.beginPath();
    ctx.moveTo(offset, -size * 0.25);
    ctx.lineTo(offset + size * 1.5, size * 1.25);
    ctx.stroke();
  }
  ctx.restore();
  paintClothWeave(ctx, size, rng, 'rgba(58,42,18,0.12)');
}

/** Faux-marble veining. */
export function paintMarbleVeins(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  base: string,
  vein: string
): void {
  paintBaseGradient(ctx, size, lighten(base, 0.08), darken(base, 0.06), 60);
  ctx.save();
  const veinCount = 6;
  for (let i = 0; i < veinCount; i++) {
    const startX = rng() * size;
    let x = startX;
    let y = -size * 0.1;
    ctx.strokeStyle = withAlpha(i % 2 === 0 ? vein : lighten(vein, 0.3), 0.28 + rng() * 0.2);
    ctx.lineWidth = size * (0.003 + rng() * 0.006);
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < size * 1.1) {
      x += (rng() - 0.45) * size * 0.12;
      y += size * 0.12;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Warm plaster/wall wash with soft blotchy noise. */
export function paintPlaster(ctx: CanvasRenderingContext2D, size: number, rng: Rng, base: string): void {
  paintBaseGradient(ctx, size, lighten(base, 0.05), darken(base, 0.05), 100 + rng() * 40);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 34; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.05 + rng() * 0.16);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rng() > 0.5 ? lighten(base, 0.12) : darken(base, 0.1);
    grad.addColorStop(0, withAlpha(shade, 0.16));
    grad.addColorStop(1, withAlpha(shade, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Fine vertical velvet nap noise over a top/bottom gradient. */
export function paintVelvet(ctx: CanvasRenderingContext2D, size: number, rng: Rng, top: string, bottom: string): void {
  paintBaseGradient(ctx, size, top, bottom, 90);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#050505';
  const step = Math.max(2, Math.round(size / 160));
  for (let x = 0; x < size; x += step) {
    const jitter = (rng() - 0.5) * step;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + jitter, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  for (let x = step / 2; x < size; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - (rng() - 0.5) * step, size);
    ctx.stroke();
  }
  ctx.restore();
}

/** Heavy curtain fabric with vertical fold shading. */
export function paintCurtainFolds(ctx: CanvasRenderingContext2D, size: number, rng: Rng, base: string): void {
  paintBaseGradient(ctx, size, lighten(base, 0.1), darken(base, 0.2), 0);
  ctx.save();
  const foldWidth = size * (0.09 + rng() * 0.03);
  for (let x = 0; x < size + foldWidth; x += foldWidth) {
    const shade = Math.sin((x / foldWidth) * Math.PI) * 0.5 + 0.5;
    const grad = ctx.createLinearGradient(x - foldWidth / 2, 0, x + foldWidth / 2, 0);
    grad.addColorStop(0, withAlpha('#000000', 0));
    grad.addColorStop(0.5, withAlpha(shade > 0.5 ? '#ffffff' : '#000000', Math.abs(shade - 0.5) * 0.35));
    grad.addColorStop(1, withAlpha('#000000', 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - foldWidth, 0, foldWidth * 2, size);
  }
  ctx.restore();
}

/** Brushed dark iron metal with subtle streaks. */
export function paintMetalBrushed(ctx: CanvasRenderingContext2D, size: number, rng: Rng, base: string): void {
  paintBaseGradient(ctx, size, lighten(base, 0.1), darken(base, 0.1), 90);
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 150; i++) {
    const y = rng() * size;
    const x0 = rng() * size * 0.3;
    const len = size * (0.3 + rng() * 0.7);
    ctx.strokeStyle = rng() > 0.5 ? '#ffffff' : '#000000';
    ctx.lineWidth = size / 900;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + len, y + (rng() - 0.5) * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Paper-gilt gold leaf: blotchy unevenness plus tiny bright flecks. */
export function paintGoldLeaf(ctx: CanvasRenderingContext2D, size: number, rng: Rng, base: string): void {
  paintBaseGradient(ctx, size, lighten(base, 0.18), darken(base, 0.14), 45);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 26; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.04 + rng() * 0.12);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rng() > 0.5 ? lighten(base, 0.25) : darken(base, 0.2);
    grad.addColorStop(0, withAlpha(shade, 0.22));
    grad.addColorStop(1, withAlpha(shade, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.08 + rng() * 0.14;
    ctx.fillStyle = '#fff7de';
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.002 + rng() * 0.006);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

export function getCtx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

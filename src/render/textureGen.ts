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

// ---- figurative scene painters --------------------------------------------------------
// A 4-year-old must recognize the picture at phone size, so these paint real shapes
// (a window, a chandelier, tree trunks, a hearth...) first, and layer the painted-canvas
// texture (weave/brushstroke/edge) on top only as a subtle finish, never in place of it.

/** Salon backdrop: wall panels with gold trim + a tall arched window + a chandelier silhouette. */
export function paintSalonBackdrop(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  wall: string,
  panel: string,
  gold: string
): void {
  paintBaseGradient(ctx, size, lighten(wall, 0.1), wall, 92);

  const panelCount = 3;
  const margin = size * 0.055;
  const panelW = (size - margin * (panelCount + 1)) / panelCount;
  const panelTop = size * 0.42;
  const panelH = size * 0.5;
  for (let i = 0; i < panelCount; i++) {
    const x = margin + i * (panelW + margin);
    const g = ctx.createLinearGradient(x, panelTop, x, panelTop + panelH);
    g.addColorStop(0, lighten(panel, 0.12));
    g.addColorStop(1, darken(panel, 0.1));
    ctx.fillStyle = g;
    ctx.fillRect(x, panelTop, panelW, panelH);
    ctx.lineWidth = size * 0.012;
    ctx.strokeStyle = gold;
    ctx.strokeRect(x + ctx.lineWidth, panelTop + ctx.lineWidth, panelW - ctx.lineWidth * 2, panelH - ctx.lineWidth * 2);
  }

  const winW = size * 0.3;
  const winH = size * 0.38;
  const winX = size / 2 - winW / 2;
  const winY = size * 0.06;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(winX, winY + winH);
  ctx.lineTo(winX, winY + winW / 2);
  ctx.arc(winX + winW / 2, winY + winW / 2, winW / 2, Math.PI, 0);
  ctx.lineTo(winX + winW, winY + winH);
  ctx.closePath();
  const sky = ctx.createLinearGradient(0, winY, 0, winY + winH);
  sky.addColorStop(0, '#d7e6f2');
  sky.addColorStop(1, '#9db6d2');
  ctx.fillStyle = sky;
  ctx.fill();
  ctx.lineWidth = size * 0.02;
  ctx.strokeStyle = gold;
  ctx.stroke();
  ctx.clip();
  ctx.strokeStyle = withAlpha('#ffffff', 0.55);
  ctx.lineWidth = size * 0.007;
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.moveTo(winX, winY + winH * 0.58);
  ctx.lineTo(winX + winW, winY + winH * 0.58);
  ctx.stroke();
  ctx.restore();

  // chandelier silhouette hanging above the window
  const cx = size / 2;
  const armY = size * 0.16;
  ctx.save();
  ctx.strokeStyle = darken(gold, 0.35);
  ctx.lineWidth = size * 0.008;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, armY);
  ctx.stroke();
  const arms: number = 5;
  for (let i = 0; i < arms; i++) {
    const t = arms === 1 ? 0.5 : i / (arms - 1);
    const ax = cx + (t * 2 - 1) * size * 0.09;
    const ay = armY + size * 0.035;
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.quadraticCurveTo((cx + ax) / 2, ay + size * 0.02, ax, ay);
    ctx.stroke();
    ctx.fillStyle = '#ffe6b0';
    ctx.beginPath();
    ctx.arc(ax, ay, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  paintBrushStrokes(ctx, size, rng, [lighten(wall, 0.1), lighten(panel, 0.12)], 10);
  paintClothWeave(ctx, size, rng, 'rgba(20,14,8,0.035)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(20,14,8,0.2)');
}

/** Salon wing: a fluted pilaster/column with gold capital, base and edge trim. */
export function paintSalonWing(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  wall: string,
  panel: string,
  gold: string
): void {
  paintBaseGradient(ctx, size, lighten(wall, 0.06), wall, 92);
  const shaftW = size * 0.46;
  const x = size / 2 - shaftW / 2;
  const shaftGrad = ctx.createLinearGradient(x, 0, x + shaftW, 0);
  shaftGrad.addColorStop(0, darken(panel, 0.08));
  shaftGrad.addColorStop(0.5, lighten(panel, 0.16));
  shaftGrad.addColorStop(1, darken(panel, 0.08));
  ctx.fillStyle = shaftGrad;
  ctx.fillRect(x, size * 0.1, shaftW, size * 0.82);
  ctx.strokeStyle = withAlpha('#000000', 0.14);
  ctx.lineWidth = size * 0.006;
  const flutes = 5;
  for (let i = 1; i < flutes; i++) {
    const fx = x + (shaftW / flutes) * i;
    ctx.beginPath();
    ctx.moveTo(fx, size * 0.12);
    ctx.lineTo(fx, size * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = gold;
  ctx.fillRect(x - size * 0.05, size * 0.07, shaftW + size * 0.1, size * 0.045);
  ctx.fillRect(x - size * 0.05, size * 0.9, shaftW + size * 0.1, size * 0.045);
  ctx.strokeStyle = gold;
  ctx.lineWidth = size * 0.012;
  ctx.strokeRect(x, size * 0.1, shaftW, size * 0.82);
  paintBrushStrokes(ctx, size, rng, [lighten(wall, 0.08)], 6);
  paintClothWeave(ctx, size, rng, 'rgba(20,14,8,0.03)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(20,14,8,0.2)');
}

/** Forest backdrop: layered tree trunks, canopy blobs, and warm light shafts between them. */
export function paintForestBackdrop(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  trunk: string,
  canopyLight: string,
  canopyDark: string,
  lightShaft: string
): void {
  paintBaseGradient(ctx, size, lighten(canopyLight, 0.18), darken(trunk, 0.25), 92);

  // warm light shafts between trunks
  for (let i = 0; i < 4; i++) {
    const cx = size * (0.14 + i * 0.25) + (rng() - 0.5) * size * 0.05;
    const grad = ctx.createLinearGradient(cx, 0, cx, size);
    grad.addColorStop(0, withAlpha(lightShaft, 0.4));
    grad.addColorStop(1, withAlpha(lightShaft, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.045, 0);
    ctx.lineTo(cx + size * 0.045, 0);
    ctx.lineTo(cx + size * 0.15, size);
    ctx.lineTo(cx - size * 0.15, size);
    ctx.closePath();
    ctx.fill();
  }

  // layered trunks, alternating near (darker/wider) and far (lighter/thinner)
  const trunkXs = [0.06, 0.26, 0.5, 0.74, 0.94];
  for (let i = 0; i < trunkXs.length; i++) {
    const near = i % 2 === 0;
    const w = size * (near ? 0.075 : 0.045);
    const cx = size * (trunkXs[i] ?? 0.5);
    ctx.fillStyle = near ? darken(trunk, 0.05) : lighten(trunk, 0.2);
    ctx.fillRect(cx - w / 2, size * 0.28, w, size * 0.72);
    ctx.strokeStyle = withAlpha('#000000', 0.12);
    ctx.lineWidth = size * 0.004;
    ctx.beginPath();
    ctx.moveTo(cx, size * 0.28);
    ctx.lineTo(cx, size);
    ctx.stroke();
  }

  // canopy blobs across the top
  for (let i = 0; i < 12; i++) {
    const cx = rng() * size;
    const cy = size * (0.03 + rng() * 0.24);
    const r = size * (0.09 + rng() * 0.09);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const shade = rng() > 0.5 ? canopyLight : canopyDark;
    grad.addColorStop(0, withAlpha(shade, 0.85));
    grad.addColorStop(1, withAlpha(shade, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  paintBrushStrokes(ctx, size, rng, [canopyLight, trunk], 10);
  paintClothWeave(ctx, size, rng, 'rgba(10,14,4,0.04)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(8,10,4,0.28)');
}

/**
 * Forest wing: a bold tree-trunk + foliage silhouette painted on a transparent
 * canvas (cut-flat look) — pair with alphaTest on the material so the plane's
 * rectangular edges vanish and only the trunk/canopy shape is opaque.
 */
export function paintForestWingCutout(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  trunk: string,
  canopyLight: string,
  canopyDark: string
): void {
  ctx.clearRect(0, 0, size, size);
  const midX = size * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(midX - size * 0.1, size);
  ctx.quadraticCurveTo(midX - size * 0.16, size * 0.5, midX - size * 0.065, size * 0.12);
  ctx.lineTo(midX + size * 0.065, size * 0.12);
  ctx.quadraticCurveTo(midX + size * 0.16, size * 0.5, midX + size * 0.1, size);
  ctx.closePath();
  const trunkGrad = ctx.createLinearGradient(midX - size * 0.16, 0, midX + size * 0.16, 0);
  trunkGrad.addColorStop(0, darken(trunk, 0.22));
  trunkGrad.addColorStop(0.5, lighten(trunk, 0.1));
  trunkGrad.addColorStop(1, darken(trunk, 0.18));
  ctx.fillStyle = trunkGrad;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = withAlpha('#000000', 0.18);
  ctx.lineWidth = size * 0.006;
  for (let i = 0; i < 9; i++) {
    const x = midX - size * 0.13 + rng() * size * 0.26;
    ctx.beginPath();
    ctx.moveTo(x, size * 0.12);
    ctx.lineTo(x + (rng() - 0.5) * size * 0.03, size);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < 7; i++) {
    const cx = midX + (rng() - 0.5) * size * 0.55;
    const cy = size * (0.02 + rng() * 0.24);
    const r = size * (0.14 + rng() * 0.1);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const shade = rng() > 0.5 ? canopyLight : canopyDark;
    grad.addColorStop(0, withAlpha(shade, 0.95));
    grad.addColorStop(0.75, withAlpha(shade, 0.5));
    grad.addColorStop(1, withAlpha(shade, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Rustic backdrop: beamed ceiling, a hearth with warm fire glow, and simple shelves. */
export function paintRusticBackdrop(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  plaster: string,
  beam: string,
  fire: string
): void {
  paintBaseGradient(ctx, size, lighten(plaster, 0.1), plaster, 92);

  const beamCount = 4;
  for (let i = 0; i < beamCount; i++) {
    const y = size * (0.03 + i * 0.06);
    ctx.fillStyle = beam;
    ctx.fillRect(0, y, size, size * 0.032);
  }

  const hw = size * 0.34;
  const hx = size * 0.5;
  const hy = size * 0.55;
  const hh = size * 0.4;
  ctx.fillStyle = darken(beam, 0.3);
  ctx.fillRect(hx - hw / 2 - size * 0.035, hy - size * 0.035, hw + size * 0.07, hh + size * 0.035);
  ctx.fillStyle = '#241810';
  ctx.fillRect(hx - hw / 2, hy, hw, hh);
  const fireGrad = ctx.createRadialGradient(hx, hy + hh * 0.82, 0, hx, hy + hh * 0.82, hw * 0.6);
  fireGrad.addColorStop(0, withAlpha(lighten(fire, 0.15), 0.95));
  fireGrad.addColorStop(0.55, withAlpha(fire, 0.55));
  fireGrad.addColorStop(1, withAlpha(fire, 0));
  ctx.fillStyle = fireGrad;
  ctx.beginPath();
  ctx.arc(hx, hy + hh * 0.82, hw * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = beam;
  ctx.fillRect(hx - hw / 2 - size * 0.05, hy - size * 0.045, hw + size * 0.1, size * 0.03);

  // simple side shelves with a couple of jug shapes
  for (const sx of [size * 0.1, size * 0.68]) {
    const sy = size * (0.34 + rng() * 0.08);
    const sw = size * 0.2;
    ctx.fillStyle = beam;
    ctx.fillRect(sx, sy, sw, size * 0.018);
    for (let i = 0; i < 2; i++) {
      const jx = sx + sw * (0.28 + i * 0.44);
      ctx.fillStyle = withAlpha('#cdb98d', 0.85);
      ctx.beginPath();
      ctx.ellipse(jx, sy - size * 0.022, size * 0.018, size * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  paintBrushStrokes(ctx, size, rng, [plaster, lighten(beam, 0.12)], 8);
  paintClothWeave(ctx, size, rng, 'rgba(20,14,8,0.035)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(20,14,8,0.25)');
}

/** Rustic wing: a plain timber post against plastered wall edges. */
export function paintRusticWing(
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: Rng,
  plaster: string,
  beam: string
): void {
  paintBaseGradient(ctx, size, lighten(plaster, 0.08), plaster, 92);
  const postW = size * 0.4;
  const x = size / 2 - postW / 2;
  const grad = ctx.createLinearGradient(x, 0, x + postW, 0);
  grad.addColorStop(0, darken(beam, 0.1));
  grad.addColorStop(0.5, lighten(beam, 0.12));
  grad.addColorStop(1, darken(beam, 0.1));
  ctx.fillStyle = grad;
  ctx.fillRect(x, size * 0.05, postW, size * 0.9);
  ctx.strokeStyle = withAlpha('#000000', 0.14);
  ctx.lineWidth = size * 0.005;
  for (let i = 0; i < 10; i++) {
    const gy = size * 0.05 + rng() * size * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + postW, gy + (rng() - 0.5) * size * 0.02);
    ctx.stroke();
  }
  paintBrushStrokes(ctx, size, rng, [lighten(plaster, 0.08)], 6);
  paintClothWeave(ctx, size, rng, 'rgba(20,14,8,0.03)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(20,14,8,0.2)');
}

/** Foreground prop: a rounded mossy rock with lichen patches. */
export function paintMossyRock(ctx: CanvasRenderingContext2D, size: number, rng: Rng, stone: string, moss: string): void {
  paintBaseGradient(ctx, size, lighten(stone, 0.16), darken(stone, 0.18), 100);
  for (let i = 0; i < 10; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = size * (0.08 + rng() * 0.18);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = rng() > 0.5 ? lighten(stone, 0.18) : darken(stone, 0.16);
    grad.addColorStop(0, withAlpha(shade, 0.4));
    grad.addColorStop(1, withAlpha(shade, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = rng() * size;
    const y = size * rng() * 0.4;
    const r = size * (0.05 + rng() * 0.09);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, withAlpha(moss, 0.8));
    grad.addColorStop(1, withAlpha(moss, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  paintClothWeave(ctx, size, rng, 'rgba(10,10,6,0.05)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(8,10,6,0.24)');
}

/** Foreground prop: a soft rounded accent (cushion / leaf-bush / basket) in a scene tint. */
export function paintSoftAccentProp(ctx: CanvasRenderingContext2D, size: number, rng: Rng, base: string): void {
  paintBaseGradient(ctx, size, lighten(base, 0.18), darken(base, 0.14), 100);
  paintBrushStrokes(ctx, size, rng, [lighten(base, 0.22), darken(base, 0.12)], 14);
  paintClothWeave(ctx, size, rng, 'rgba(20,14,8,0.04)');
  paintEdgeUnevenness(ctx, size, rng, 'rgba(20,14,8,0.22)');
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

import * as THREE from 'three';
import { makeRng } from '../core/math';

/**
 * Every texture in the game is generated at runtime on a 2D canvas.
 * No image downloads means a first paint that is essentially instant on a
 * phone connection, and it keeps the whole build under a few hundred KB.
 */

function canvas(size: number, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function finish(c: HTMLCanvasElement, repeat = false, aniso = 4): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Seamless speckle helper: draws a dot and its wrapped copies. */
function wrapDot(g: CanvasRenderingContext2D, size: number, x: number, y: number, r: number) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const px = x + dx * size, py = y + dy * size;
      if (px < -r || px > size + r || py < -r || py > size + r) continue;
      g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }
  }
}

/** Tilled brown earth seen from above. Deliberately low-chroma: this is "before". */
export function soilTexture(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const rng = makeRng(7717);
  g.fillStyle = '#8a6242';
  g.fillRect(0, 0, size, size);

  // broad blotches so the ground is not a flat colour at distance
  for (let i = 0; i < 90; i++) {
    const r = 20 + rng() * 90;
    const shade = 0.5 + rng() * 0.5;
    g.fillStyle = `rgba(${Math.round(120 * shade + 30)},${Math.round(86 * shade + 20)},${Math.round(58 * shade + 12)},0.22)`;
    wrapDot(g, size, rng() * size, rng() * size, r);
  }
  // furrows: soft parallel ridges, they read as "a field somebody prepared"
  const rows = 10;
  for (let i = 0; i < rows; i++) {
    const y = (i / rows) * size;
    const hgt = size / rows;
    const grad = g.createLinearGradient(0, y, 0, y + hgt);
    grad.addColorStop(0, 'rgba(60,38,22,0.30)');
    grad.addColorStop(0.35, 'rgba(255,224,190,0.10)');
    grad.addColorStop(0.75, 'rgba(255,224,190,0.05)');
    grad.addColorStop(1, 'rgba(60,38,22,0.26)');
    g.fillStyle = grad;
    g.fillRect(0, y, size, hgt);
  }
  // grain + pebbles
  for (let i = 0; i < size * 6; i++) {
    const v = rng();
    g.fillStyle = v > 0.5 ? 'rgba(255,230,200,0.14)' : 'rgba(52,32,18,0.16)';
    wrapDot(g, size, rng() * size, rng() * size, 0.7 + rng() * 1.9);
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${180 + rng() * 40 | 0},${160 + rng() * 30 | 0},${140 + rng() * 30 | 0},0.5)`;
    wrapDot(g, size, rng() * size, rng() * size, 1.4 + rng() * 2.6);
  }
  return finish(c, true);
}

/** Soil seen in cross-section: bright, friendly, storybook - never a dark cave. */
export function soilWallTexture(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const rng = makeRng(1234);
  // top of the canvas = ground surface, bottom = deep
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0.0, '#a9784e');
  grad.addColorStop(0.10, '#9c6c45');
  grad.addColorStop(0.45, '#8d6440');
  grad.addColorStop(1.0, '#7d5838');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);

  // gentle horizontal soil strata, warm and light
  for (let i = 0; i < 16; i++) {
    const y = rng() * size;
    const h = 6 + rng() * 34;
    g.fillStyle = rng() > 0.5 ? 'rgba(215,170,120,0.16)' : 'rgba(96,64,38,0.14)';
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 5);
    g.lineTo(size, y + h); 
    for (let x = size; x >= 0; x -= 32) g.lineTo(x, y + h + Math.sin(x * 0.02 + i) * 5);
    g.closePath(); g.fill();
  }
  // crumbs: readable "soft soil" grain
  for (let i = 0; i < size * 9; i++) {
    const v = rng();
    g.fillStyle = v > 0.55 ? 'rgba(255,228,190,0.16)' : 'rgba(70,44,26,0.15)';
    wrapDot(g, size, rng() * size, rng() * size, 0.8 + rng() * 2.2);
  }
  // friendly pebbles
  for (let i = 0; i < 120; i++) {
    const x = rng() * size, y = rng() * size, r = 2 + rng() * 5.5;
    g.fillStyle = `rgba(${196 + rng() * 40 | 0},${176 + rng() * 34 | 0},${152 + rng() * 30 | 0},0.75)`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rng() * 0.5), rng() * 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.35, r * 0.25, 0, 0, Math.PI * 2); g.fill();
  }
  return finish(c, true);
}

/** Papery tulip-bulb skin with the vertical fibres real bulbs have. */
export function bulbTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const rng = makeRng(90210);
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#c9a071');
  grad.addColorStop(0.45, '#b07f4e');
  grad.addColorStop(1, '#8a5c34');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 150; i++) {
    const x = rng() * size;
    g.strokeStyle = rng() > 0.5 ? 'rgba(255,226,190,0.22)' : 'rgba(96,58,28,0.20)';
    g.lineWidth = 0.6 + rng() * 2.4;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= size; y += 24) g.lineTo(x + Math.sin(y * 0.03 + i) * 6, y);
    g.stroke();
  }
  for (let i = 0; i < 800; i++) {
    g.fillStyle = rng() > 0.5 ? 'rgba(255,240,215,0.10)' : 'rgba(80,50,24,0.10)';
    wrapDot(g, size, rng() * size, rng() * size, 0.6 + rng() * 1.6);
  }
  return finish(c, true);
}

/**
 * Far-distance flower puff. One soft cluster silhouette, tinted per instance,
 * so the horizon reads as a continuous carpet for the price of two triangles.
 */
export function flowerPuffTexture(size = 128): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  g.clearRect(0, 0, size, size);
  const rng = makeRng(4242);
  // A small clump of tulip heads on stems, not a ball of cotton wool: the
  // silhouette is what sells "flowers" at 60 metres.
  const heads = 4;
  g.fillStyle = '#ffffff';
  for (let i = 0; i < heads; i++) {
    const cx = size * (0.5 + (i - (heads - 1) / 2) * 0.21 + (rng() - 0.5) * 0.07);
    const top = size * (0.10 + rng() * 0.20);
    const bot = size * (0.60 + rng() * 0.10);
    const w = size * (0.10 + rng() * 0.035);
    // stem
    g.fillRect(cx - size * 0.012, bot - size * 0.02, size * 0.024, size * 0.40);
    // head: rounded cup with a pointed tip
    g.beginPath();
    g.moveTo(cx, top);
    g.bezierCurveTo(cx + w, top + (bot - top) * 0.30, cx + w, bot - (bot - top) * 0.10, cx, bot);
    g.bezierCurveTo(cx - w, bot - (bot - top) * 0.10, cx - w, top + (bot - top) * 0.30, cx, top);
    g.closePath();
    g.fill();
  }
  // soften the edges so alpha-testing does not produce a crunchy cut-out
  return blurAlpha(c, size, 1.8);
}

/** Soft cloud sprite. */
export function cloudTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = canvas(size, size >> 1);
  const h = size >> 1;
  const rng = makeRng(31337);
  for (let i = 0; i < 14; i++) {
    const cx = size * (0.12 + rng() * 0.76);
    const cy = h * (0.45 + (rng() - 0.5) * 0.42);
    const r = size * (0.07 + rng() * 0.12);
    const grd = g.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Round soft alpha, reused for water droplets, sparkles and soil puffs. */
export function softDotTexture(size = 64, hardness = 0.25): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const grd = g.createRadialGradient(size / 2, size / 2, size * hardness * 0.5, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Leafy tuft for the sparse green cover that exists before anything blooms.
 *
 * The alpha is a solid silhouette with only a narrow soft edge. That matters:
 * an alpha-tested billboard whose alpha peaks well below 1 simply disappears at
 * distance, because mip filtering averages it under the cutoff.
 */
export function leafPuffTexture(size = 128): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const rng = makeRng(5150);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) {
    const cx = size * (0.5 + (rng() - 0.5) * 0.62);
    const bot = size * 0.96;
    const h = size * (0.36 + rng() * 0.40);
    const w = size * (0.045 + rng() * 0.035);
    const lean = (rng() - 0.5) * size * 0.24;
    g.beginPath();
    g.moveTo(cx - w, bot);
    g.quadraticCurveTo(cx - w * 0.5 + lean * 0.5, bot - h * 0.55, cx + lean, bot - h);
    g.quadraticCurveTo(cx + w * 0.9 + lean * 0.5, bot - h * 0.55, cx + w, bot);
    g.closePath();
    g.fill();
  }
  return blurAlpha(c, size, 1.6);
}

/** Soften a hard silhouette without losing its solid core. */
function blurAlpha(src: HTMLCanvasElement, size: number, px: number): THREE.CanvasTexture {
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const g = out.getContext('2d')!;
  g.filter = `blur(${px}px)`;
  g.drawImage(src, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Woven willow for the bulb basket. */
export function basketTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const rng = makeRng(6161);
  g.fillStyle = '#c69a63';
  g.fillRect(0, 0, size, size);
  const rows = 9;
  const h = size / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    const cols = 14;
    for (let i = 0; i < cols; i++) {
      const x = (i + (r % 2) * 0.5) * (size / cols);
      const w = size / cols;
      const grd = g.createLinearGradient(0, y, 0, y + h);
      const base = 0.82 + rng() * 0.32;
      grd.addColorStop(0, `rgba(${140 * base | 0},${100 * base | 0},${58 * base | 0},1)`);
      grd.addColorStop(0.45, `rgba(${216 * base | 0},${172 * base | 0},${112 * base | 0},1)`);
      grd.addColorStop(1, `rgba(${128 * base | 0},${90 * base | 0},${50 * base | 0},1)`);
      g.fillStyle = grd;
      roundRect(g, x + 1, y + 1.5, w - 2, h - 3, h * 0.35);
      g.fill();
    }
  }
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = rng() > 0.5 ? 'rgba(255,235,200,0.10)' : 'rgba(80,52,24,0.10)';
    wrapDot(g, size, rng() * size, rng() * size, 0.5 + rng() * 1.3);
  }
  return finish(c, true);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Painted wood for the sluice gate. */
export function woodTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const rng = makeRng(2468);
  g.fillStyle = '#d8a86a';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = rng() > 0.5 ? 'rgba(255,232,196,0.20)' : 'rgba(120,78,38,0.20)';
    g.lineWidth = 0.8 + rng() * 3;
    const y = rng() * size;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= size; x += 20) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3.5);
    g.stroke();
  }
  return finish(c, true);
}

/**
 * Tiling detail noise. Three channels at three different feature sizes, so one
 * texture fetch triple gives the ground its leaf/clump/patch structure without
 * any procedural noise in the shader.
 */
export function detailTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const rng = makeRng(9182736);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const layer = (ch: 'r' | 'g' | 'b', blobs: number, rMin: number, rMax: number) => {
    g.globalCompositeOperation = 'lighter';
    const col = ch === 'r' ? '255,0,0' : ch === 'g' ? '0,255,0' : '0,0,255';
    for (let i = 0; i < blobs; i++) {
      const r = rMin + rng() * (rMax - rMin);
      const x = rng() * size, y = rng() * size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const px = x + dx * size, py = y + dy * size;
          if (px < -r || px > size + r || py < -r || py > size + r) continue;
          const grd = g.createRadialGradient(px, py, 0, px, py, r);
          grd.addColorStop(0, `rgba(${col},0.55)`);
          grd.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = grd;
          g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
  };
  layer('r', 900, 2, 7);
  layer('g', 90, 12, 34);
  layer('b', 22, 34, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Soft annulus used to make the next hole glow without a hard outline. */
export function ringGlowTexture(size = 128): THREE.CanvasTexture {
  const { c, g } = canvas(size, size);
  const cx = size / 2;
  const grd = g.createRadialGradient(cx, cx, size * 0.16, cx, cx, size * 0.5);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.42, 'rgba(255,255,255,0.30)');
  grd.addColorStop(0.62, 'rgba(255,255,255,1)');
  grd.addColorStop(0.82, 'rgba(255,255,255,0.34)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

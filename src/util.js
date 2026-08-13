import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOut = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;
// frame-rate independent damping
export const damp = (cur, tgt, lambda, dt) => lerp(cur, tgt, 1 - Math.exp(-lambda * dt));

/** Layered value noise on a canvas: scales a tiny random image up with bilinear
 *  filtering several times. Works everywhere (no ctx.filter dependency). */
export function makeNoiseCanvas(size, layers, rng = Math.random) {
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  for (const { cells, alpha } of layers) {
    const small = document.createElement('canvas');
    small.width = small.height = cells;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(cells, cells);
    for (let i = 0; i < cells * cells; i++) {
      const v = Math.floor(rng() * 255);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, cells, cells, 0, 0, size, size);
  }
  ctx.globalAlpha = 1;
  return out;
}

/** Concrete floor with stains and wear. */
export function makeFloorTexture() {
  const s = 512;
  const c = makeNoiseCanvas(s, [
    { cells: 8, alpha: 0.30 }, { cells: 32, alpha: 0.22 }, { cells: 128, alpha: 0.14 },
  ]);
  const ctx = c.getContext('2d');
  // base tint
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#8d9297';
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over';
  // dark stains
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 18 + Math.random() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(24,26,24,${0.10 + Math.random() * 0.16})`);
    g.addColorStop(1, 'rgba(24,26,24,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // expansion joints
  ctx.strokeStyle = 'rgba(30,32,34,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2);
  ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Wall panels with grime near the bottom. */
export function makeWallTexture() {
  const s = 512;
  const c = makeNoiseCanvas(s, [{ cells: 16, alpha: 0.16 }, { cells: 64, alpha: 0.10 }]);
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#aeb6ba';
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over';
  // panel seams
  ctx.strokeStyle = 'rgba(40,46,50,0.55)';
  ctx.lineWidth = 4;
  for (let x = 0; x <= s; x += s / 4) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s); ctx.stroke();
  }
  // grime gradient at bottom
  const g = ctx.createLinearGradient(0, s * 0.55, 0, s);
  g.addColorStop(0, 'rgba(35,38,36,0)');
  g.addColorStop(1, 'rgba(35,38,36,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Oxide-thickness variation map (green channel drives iridescence thickness).
 *  Soft blotches so the colour "grows" unevenly, like a real anodized surface. */
export function makeThicknessTexture() {
  const c = makeNoiseCanvas(256, [
    { cells: 4, alpha: 0.55 }, { cells: 12, alpha: 0.35 }, { cells: 48, alpha: 0.18 },
  ]);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

/** Streaked poly-propylene texture for the tank body (waterline stain). */
export function makeTankTexture() {
  const s = 256;
  const c = makeNoiseCanvas(s, [{ cells: 6, alpha: 0.14 }, { cells: 24, alpha: 0.10 }]);
  const ctx = c.getContext('2d');
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#9fb3bd';
  ctx.fillRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'source-over';
  // vertical drip streaks
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * s;
    const h = 30 + Math.random() * 120;
    const g = ctx.createLinearGradient(0, 40, 0, 40 + h);
    g.addColorStop(0, 'rgba(52,60,58,0.24)');
    g.addColorStop(1, 'rgba(52,60,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 40, 2 + Math.random() * 3, h);
  }
  // waterline band
  ctx.fillStyle = 'rgba(48,66,62,0.4)';
  ctx.fillRect(0, 36, s, 7);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

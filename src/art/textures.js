import * as THREE from 'three';
import { drawAnimal, ANIMAL_IDS } from './animals.js';
import { makeRandom } from '../core/util.js';

export const DOUGH = '#efd9a9';
export const INK = '#4b2a12';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c, { srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function paintDough(ctx, w, h, seed = 7) {
  const rnd = makeRandom(seed);
  ctx.fillStyle = DOUGH;
  ctx.fillRect(0, 0, w, h);
  // speckles of bran so the raw dough does not look like flat plastic
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 0.6 + rnd() * 2.1;
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(196,159,102,0.30)' : 'rgba(255,244,214,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * The long beige band. One canvas, `cells` square cells side by side; the print
 * roller reveals each cell left-to-right as the dough rolls out from under it,
 * and the cut biscuits later sample the very same cells, so a face printed in
 * step 3 is still the face you break open in step 13.
 */
export class Strip {
  constructor({ cells = 8, cellPx = 256 } = {}) {
    this.cells = cells;
    this.cellPx = cellPx;
    this.canvas = canvas(cells * cellPx, cellPx);
    this.ctx = this.canvas.getContext('2d');
    this.base = canvas(cells * cellPx, cellPx);
    paintDough(this.base.getContext('2d'), this.base.width, this.base.height, 11);
    this.dockerHoles(this.base.getContext('2d'));
    this.ctx.drawImage(this.base, 0, 0);

    // one pre-rendered sprite per animal keeps per-frame printing cheap
    this.sprites = {};
    for (const id of ANIMAL_IDS) {
      const s = canvas(cellPx, cellPx);
      const c = s.getContext('2d');
      c.save();
      c.translate(cellPx * 0.11, cellPx * 0.1);
      drawAnimal(c, id, { size: cellPx * 0.78, line: INK, bg: DOUGH });
      c.restore();
      this.sprites[id] = s;
    }

    this.animalForCell = new Array(cells).fill(null);
    this.progress = new Array(cells).fill(0);
    this.texture = tex(this.canvas);
    this._dirty = false;
    this._acc = 0;
  }

  dockerHoles(ctx) {
    const rnd = makeRandom(3);
    ctx.fillStyle = 'rgba(180,142,88,0.28)';
    for (let x = 24; x < this.base.width; x += 48) {
      for (let y = 24; y < this.base.height; y += 48) {
        ctx.beginPath();
        ctx.arc(x + rnd() * 4, y + rnd() * 4, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Wipe every printed face (used by "play again"). */
  reset() {
    this.ctx.drawImage(this.base, 0, 0);
    this.animalForCell.fill(null);
    this.progress.fill(0);
    this._dirty = true;
  }

  /**
   * @param {number} cell  index 0..cells-1 along the band
   * @param {string} id    animal id
   * @param {number} p     0..1 — how much of the face has rolled out from under
   *                       the drum. The band travels +x, so the right-hand edge
   *                       of a cell touches the drum first.
   */
  printCell(cell, id, p) {
    if (cell < 0 || cell >= this.cells) return;
    this.animalForCell[cell] = id;
    this.progress[cell] = p;
    const s = this.cellPx;
    const x0 = cell * s;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, s, s);
    ctx.clip();
    ctx.drawImage(this.base, x0, 0, s, s, x0, 0, s, s);
    if (p > 0.002) {
      const w = s * Math.min(1, p);
      ctx.beginPath();
      ctx.rect(x0 + s - w, 0, w, s);
      ctx.clip();
      ctx.drawImage(this.sprites[id] || this.sprites.cat, x0, 0);
    }
    ctx.restore();
    this._dirty = true;
  }

  /** Uploading a 2048px canvas every frame is wasteful on a phone; 30 Hz is plenty. */
  flush(dt) {
    this._acc += dt;
    if (this._dirty && this._acc > 1 / 30) {
      this.texture.needsUpdate = true;
      this._dirty = false;
      this._acc = 0;
    }
  }
}

/** Underside of a biscuit: dough plus the little injection hole. */
export function makeBottomTexture(px = 256, holeU = 0.5, holeV = 0.5) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  paintDough(ctx, px, px, 23);
  const cx = px * holeU;
  const cy = px * holeV;
  const r = px * 0.1;
  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.1);
  g.addColorStop(0, '#3a2412');
  g.addColorStop(0.55, '#6b4a26');
  g.addColorStop(1, 'rgba(190,150,96,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1a0c';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,205,0.7)';
  ctx.lineWidth = px * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  return tex(c);
}

/** Subtle crumb bump for the hero biscuit only. */
export function makeDoughBump(px = 128) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  const rnd = makeRandom(99);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 1400; i++) {
    const v = Math.floor(90 + rnd() * 90);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rnd() * px, rnd() * px, 0.6 + rnd() * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = tex(c, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Engraved plates around the printing drum. */
export function makeDrumTexture(cells = 8, cellPx = 192) {
  const c = canvas(cells * cellPx, cellPx);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, cellPx);
  grad.addColorStop(0, '#e9f1f7');
  grad.addColorStop(0.45, '#ffffff');
  grad.addColorStop(1, '#cfdde8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cells; i++) {
    const x = i * cellPx;
    ctx.save();
    ctx.translate(x, 0);
    ctx.fillStyle = 'rgba(120,150,175,0.35)';
    ctx.fillRect(cellPx - 6, 0, 12, cellPx);
    ctx.translate(cellPx * 0.13, cellPx * 0.12);
    drawAnimal(ctx, ANIMAL_IDS[i % ANIMAL_IDS.length], {
      size: cellPx * 0.74,
      line: '#2c4d66',
      bg: '#f4f9fc',
      width: 9,
    });
    ctx.restore();
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Soft round blob — contact shadows and sparkles. */
export function makeBlobTexture(px = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  const t = tex(c);
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Warm room backdrop so nothing behind the machines gives the ending away. */
export function makeBackdropTexture(px = 512) {
  const c = canvas(px, px);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, px);
  g.addColorStop(0, '#eaf7fd');
  g.addColorStop(0.5, '#cfeaf4');
  g.addColorStop(1, '#a8dbd3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, px, px);
  const rnd = makeRandom(5);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.06})`;
    ctx.beginPath();
    ctx.arc(rnd() * px, rnd() * px * 0.8, 20 + rnd() * 60, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c);
}

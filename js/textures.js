// Every image in the game is drawn procedurally with Canvas2D, so there are
// no downloads and the palette can change per run.

const TILE_W = 256;
const TILE_H = 384;

export const CHARACTERS = [
  { id: 'momo', name: 'ももちゃん', hair: '#5b3a2e', cloth: '#ff8fb1', cloth2: '#ffd0de', skin: '#ffdcc4', shoe: '#f7f2ea', style: 'twin' },
  { id: 'sora', name: 'そらくん', hair: '#33302e', cloth: '#7fc7ff', cloth2: '#cfe9ff', skin: '#ffe0c8', shoe: '#fff6e8', style: 'short' },
  { id: 'yuzu', name: 'ゆずちゃん', hair: '#c8863c', cloth: '#ffd479', cloth2: '#fff0c2', skin: '#ffdfc9', shoe: '#f3ece2', style: 'bob' },
  { id: 'nagi', name: 'なぎくん', hair: '#4a3f6b', cloth: '#c0a6ff', cloth2: '#e6dcff', skin: '#f8d9bf', shoe: '#f2f0ff', style: 'cap' },
];

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function capsule(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 2;
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// One character pose. `view` is 'front' | 'side' | 'back'.
// With `flat` set, every part is filled white: that gives the shadow silhouette.
function drawPose(ctx, view, p, flat) {
  const col = (c) => (flat ? '#ffffff' : c);
  const cx = TILE_W / 2;

  const hairDark = flat ? '#ffffff' : shade(p.hair, -0.18);
  const clothDark = flat ? '#ffffff' : shade(p.cloth, -0.16);

  // --- legs & shoes -------------------------------------------------------
  ctx.strokeStyle = col(shade(p.skin, -0.08));
  capsule(ctx, cx - 21, 262, cx - 24, 336, 13);
  capsule(ctx, cx + 21, 262, cx + 24, 336, 13);
  ctx.fillStyle = col(p.shoe);
  roundRect(ctx, cx - 42, 332, 38, 30, 13);
  roundRect(ctx, cx + 4, 332, 38, 30, 13);

  // --- arms, held a little away from the body so the shadow reads ---------
  ctx.strokeStyle = col(p.cloth);
  capsule(ctx, cx - 44, 182, cx - 82, 258, 14);
  capsule(ctx, cx + 44, 182, cx + 82, 258, 14);
  ctx.strokeStyle = col(p.skin);
  capsule(ctx, cx - 82, 258, cx - 88, 276, 12);
  capsule(ctx, cx + 82, 258, cx + 88, 276, 12);

  // --- body ---------------------------------------------------------------
  ctx.fillStyle = col(p.cloth);
  ctx.beginPath();
  ctx.moveTo(cx - 46, 178);
  ctx.quadraticCurveTo(cx - 40, 168, cx, 166);
  ctx.quadraticCurveTo(cx + 40, 168, cx + 46, 178);
  ctx.lineTo(cx + 60, 272);
  ctx.quadraticCurveTo(cx, 288, cx - 60, 272);
  ctx.closePath();
  ctx.fill();
  if (!flat) {
    ctx.fillStyle = p.cloth2;
    ctx.beginPath();
    ctx.moveTo(cx - 57, 258);
    ctx.quadraticCurveTo(cx, 274, cx + 57, 258);
    ctx.lineTo(cx + 60, 272);
    ctx.quadraticCurveTo(cx, 288, cx - 60, 272);
    ctx.closePath();
    ctx.fill();
  }

  // --- head ---------------------------------------------------------------
  const hx = cx, hy = 104, hr = 66;
  ctx.fillStyle = col(p.skin);
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fill();

  // Hair, per style, per view.
  ctx.fillStyle = col(p.hair);
  if (view === 'back') {
    ctx.beginPath();
    ctx.arc(hx, hy, hr + 2, 0, Math.PI * 2);
    ctx.fill();
    if (p.style === 'twin') {
      ctx.beginPath(); ctx.ellipse(hx - hr - 12, hy + 16, 24, 34, -0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + hr + 12, hy + 16, 24, 34, 0.3, 0, 7); ctx.fill();
    } else if (p.style === 'bob') {
      ctx.beginPath(); ctx.ellipse(hx, hy + 34, hr + 4, 44, 0, 0, 7); ctx.fill();
    } else if (p.style === 'cap') {
      ctx.fillStyle = col(shade(p.cloth, 0.1));
      ctx.beginPath(); ctx.arc(hx, hy - 8, hr + 4, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col(p.hair);
    }
  } else {
    // front / side: hair as a cap plus side locks
    ctx.beginPath();
    ctx.arc(hx, hy - 6, hr + 2, Math.PI * 1.02, Math.PI * 2 - 0.06);
    ctx.quadraticCurveTo(hx + hr, hy + 22, hx + hr - 4, hy + 34);
    ctx.lineTo(hx + hr - 26, hy + 24);
    ctx.quadraticCurveTo(hx, hy - 34, hx - hr + 26, hy + 24);
    ctx.lineTo(hx - hr + 4, hy + 34);
    ctx.quadraticCurveTo(hx - hr, hy + 26, hx - hr - 2, hy + 6);
    ctx.closePath();
    ctx.fill();
    if (p.style === 'twin') {
      ctx.beginPath(); ctx.ellipse(hx - hr - 10, hy + 26, 20, 32, -0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx + hr + 10, hy + 26, 20, 32, 0.3, 0, 7); ctx.fill();
    }
    if (p.style === 'cap') {
      ctx.fillStyle = col(shade(p.cloth, 0.1));
      ctx.beginPath(); ctx.arc(hx, hy - 10, hr + 3, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx, hy - 12, hr + 26, 12, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col(p.hair);
    }
    if (!flat) {
      // face
      const ex = view === 'side' ? 22 : 0;
      const eye = (x, y) => {
        ctx.fillStyle = '#3a2f2b';
        ctx.beginPath(); ctx.ellipse(x, y, 8, 11, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.ellipse(x + 2.5, y - 4, 2.8, 3.4, 0, 0, 7); ctx.fill();
      };
      eye(hx - 24 + ex, hy + 30);
      if (view !== 'side') eye(hx + 24, hy + 30);

      ctx.strokeStyle = '#c8776b';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(hx + ex * 0.7, hy + 42, 11, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,150,160,0.45)';
      ctx.beginPath(); ctx.ellipse(hx - 42 + ex, hy + 42, 11, 7, 0, 0, 7); ctx.fill();
      if (view !== 'side') {
        ctx.beginPath(); ctx.ellipse(hx + 42, hy + 42, 11, 7, 0, 0, 7); ctx.fill();
      }
    }
  }

  if (!flat) {
    // A backlit character: darken the camera-facing side a touch.
    ctx.globalCompositeOperation = 'source-atop';
    const g = ctx.createLinearGradient(0, 40, 0, TILE_H);
    g.addColorStop(0, 'rgba(40,44,80,0.10)');
    g.addColorStop(0.55, 'rgba(30,36,70,0.20)');
    g.addColorStop(1, 'rgba(24,30,64,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TILE_W, TILE_H);
    ctx.globalCompositeOperation = 'source-over';
    void hairDark; void clothDark;
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt > 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Atlas of three poses side by side: [front | side | back].
export function makeCharacterAtlas(p) {
  const atlas = canvas(TILE_W * 3, TILE_H);
  const actx = atlas.getContext('2d');
  const views = ['front', 'side', 'back'];

  views.forEach((view, i) => {
    const tile = canvas(TILE_W, TILE_H);
    const tctx = tile.getContext('2d');
    drawPose(tctx, view, p, false);

    actx.save();
    actx.translate(i * TILE_W, 0);
    // Warm rim from the sun behind: an accumulated soft glow around the shape.
    actx.shadowColor = 'rgba(255,232,190,0.95)';
    for (const blur of [26, 14, 6]) {
      actx.shadowBlur = blur;
      actx.globalAlpha = 0.5;
      actx.drawImage(tile, 0, 0);
    }
    actx.shadowBlur = 0;
    actx.globalAlpha = 1;
    actx.drawImage(tile, 0, 0);
    actx.restore();
  });
  return atlas;
}

// Solid shape used as the projected shadow.
export function makeSilhouette(p) {
  const c = canvas(TILE_W, TILE_H);
  const ctx = c.getContext('2d');
  drawPose(ctx, 'back', p, true);
  // Slightly soften so the projection never shows canvas-hard edges.
  const blurred = canvas(TILE_W, TILE_H);
  const bctx = blurred.getContext('2d');
  if ('filter' in bctx) bctx.filter = 'blur(3px)';
  bctx.drawImage(c, 0, 0);
  return blurred;
}

// Soft irregular cloud puff, white with alpha.
export function makePuff(seed = 1) {
  const S = 256;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);

  for (let i = 0; i < 22; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.7) * S * 0.24;
    const x = S / 2 + Math.cos(a) * d;
    const y = S / 2 + Math.sin(a) * d * 0.72;
    const r = S * (0.10 + rnd() * 0.15);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const al = 0.10 + rnd() * 0.14;
    g.addColorStop(0, `rgba(255,255,255,${al})`);
    g.addColorStop(0.55, `rgba(255,255,255,${al * 0.5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Global falloff so cards never show a square edge.
  ctx.globalCompositeOperation = 'destination-in';
  const g2 = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g2.addColorStop(0, 'rgba(0,0,0,1)');
  g2.addColorStop(0.55, 'rgba(0,0,0,0.92)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

// Tileable value noise, one octave per channel.
export function makeNoise() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const grids = [8, 16, 32, 64];
  grids.forEach((G, ch) => {
    const pts = new Float32Array(G * G);
    for (let i = 0; i < G * G; i++) pts[i] = Math.random();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * G, fy = (y / S) * G;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const i00 = (y0 % G) * G + (x0 % G);
        const i10 = (y0 % G) * G + ((x0 + 1) % G);
        const i01 = ((y0 + 1) % G) * G + (x0 % G);
        const i11 = ((y0 + 1) % G) * G + ((x0 + 1) % G);
        const v = (pts[i00] * (1 - sx) + pts[i10] * sx) * (1 - sy) +
                  (pts[i01] * (1 - sx) + pts[i11] * sx) * sy;
        data[(y * S + x) * 4 + ch] = v * 255;
      }
    }
  });
  return { data, size: S };
}

// Little four-point sparkle for the special runs.
export function makeSparkle() {
  const S = 64;
  const c = canvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(S / 2, 6); ctx.lineTo(S / 2, S - 6);
  ctx.moveTo(6, S / 2); ctx.lineTo(S - 6, S / 2);
  ctx.stroke();
  return c;
}

// The rock ledge, seen from above: a long rounded shelf whose edges dissolve
// into the cloud. v = 0 is the near edge, v = 1 the far (sunward) edge.
export function makeTerrace() {
  const W = 512, H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#5d5678';
  ctx.beginPath();
  ctx.moveTo(40, 128);
  ctx.bezierCurveTo(70, 40, 190, 18, 262, 26);
  ctx.bezierCurveTo(352, 34, 452, 52, 478, 126);
  ctx.bezierCurveTo(452, 214, 330, 238, 250, 232);
  ctx.bezierCurveTo(150, 226, 62, 208, 40, 128);
  ctx.closePath();
  ctx.fill();

  // Mottled rock: darker toward the camera edge, warmer toward the sun.
  let s = 12345;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    g.addColorStop(0, light ? 'rgba(180,172,210,0.16)' : 'rgba(24,20,44,0.20)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const g = ctx.createLinearGradient(0, H, 0, 0);
  g.addColorStop(0, 'rgba(20,18,44,0.40)');
  g.addColorStop(0.5, 'rgba(60,54,96,0.10)');
  g.addColorStop(1, 'rgba(226,218,250,0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Soften the whole outline so it sits in the cloud instead of on top of it.
  ctx.globalCompositeOperation = 'destination-in';
  const g2 = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 210);
  g2.addColorStop(0, 'rgba(0,0,0,1)');
  g2.addColorStop(0.62, 'rgba(0,0,0,0.95)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  const soft = canvas(W, H);
  const sctx = soft.getContext('2d');
  if ('filter' in sctx) sctx.filter = 'blur(4px)';
  sctx.drawImage(c, 0, 0);
  return soft;
}

export const TILE = { W: TILE_W, H: TILE_H };

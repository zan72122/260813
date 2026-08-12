/**
 * Procedural canvas textures for the 5 hero materials (VISUAL_ACCEPTANCE.md
 * § Hero Materials). All generation happens on an offscreen `<canvas>` —
 * there are no bundled image assets anywhere in this project
 * (ARCHITECTURE_CONTRACT.md "runtime外部通信なし" / PERFORMANCE_BUDGET.md
 * "全て手続き生成"). Every texture is capped at 1024² or smaller.
 *
 * DOM-dependent (`document.createElement('canvas')`) — only ever called
 * from render/materials/index.ts at renderer-construction time, never from
 * scene/ geometry builders or anything a DOM-free unit test imports.
 */
import * as THREE from 'three';

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return { canvas, ctx };
}

// Deterministic small PRNG so texture noise is stable across context-lost
// rebuilds (mulberry32 duplicated in miniature here rather than importing
// contracts/rng.ts's game-seeded generator, since these textures are pure
// art-direction noise, independent of game `seed`).
function noiseRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(canvas: HTMLCanvasElement, repeatX = 4, repeatY = 4): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Dry sand: warm ochre base + speckled grain noise (VISUAL_ACCEPTANCE #1, #c9a45c base). */
export function createSandTexture(size = 512): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#c9a45c';
  ctx.fillRect(0, 0, size, size);
  const rng = noiseRng(0xa5d5);
  const speckles = Math.floor(size * size * 0.12);
  for (let i = 0; i < speckles; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const shade = rng();
    const c = shade < 0.5 ? `rgba(120,90,45,${0.15 + rng() * 0.2})` : `rgba(230,200,140,${0.15 + rng() * 0.25})`;
    ctx.fillStyle = c;
    const r = 0.5 + rng() * 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 6, 6);
}

/** Dark wrought iron with rivet rows + faint lattice grid (VISUAL_ACCEPTANCE #2, #4a3428 base). */
export function createIronTexture(size = 512): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#3a2a20';
  ctx.fillRect(0, 0, size, size);
  const rng = noiseRng(0x1e07);
  // mottled rust/patina noise
  const blotches = 900;
  for (let i = 0; i < blotches; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const dark = rng() < 0.5;
    ctx.fillStyle = dark ? `rgba(20,14,10,${0.1 + rng() * 0.25})` : `rgba(90,60,40,${0.08 + rng() * 0.2})`;
    const r = 2 + rng() * 10;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // faint lattice grid lines
  ctx.strokeStyle = 'rgba(15,10,8,0.35)';
  ctx.lineWidth = 2;
  const cell = size / 8;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  // rivet rows: small raised-looking dots along each grid line
  for (let i = 1; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const x = i * cell;
      const y = j * cell + cell / 2;
      ctx.fillStyle = 'rgba(180,150,110,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(10,8,6,0.7)';
      ctx.beginPath();
      ctx.arc(x - 0.8, y - 0.8, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(canvas, 3, 6);
}

/** Polished brass: warm gradient + brushed-metal streaks (VISUAL_ACCEPTANCE #3, #b08d3f). */
export function createBrassTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const grad = ctx.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#8a6c28');
  grad.addColorStop(0.5, '#d4b463');
  grad.addColorStop(1, '#8a6c28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const rng = noiseRng(0xb455);
  ctx.globalAlpha = 0.25;
  for (let y = 0; y < size; y += 2) {
    ctx.strokeStyle = rng() < 0.5 ? '#e8cf8f' : '#6f5720';
    ctx.beginPath();
    ctx.moveTo(0, y + rng());
    ctx.lineTo(size, y + rng());
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return finish(canvas, 2, 1);
}

/** Knotty scaffold-plank wood: warm brown with grain streaks + seams + knots (VISUAL_ACCEPTANCE #4, #8a6a45). */
export function createWoodTexture(size = 512): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(0, 0, size, size);
  const rng = noiseRng(0x5711);
  // vertical plank seams
  const plankW = size / 6;
  ctx.strokeStyle = 'rgba(40,26,14,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * plankW, 0);
    ctx.lineTo(i * plankW, size);
    ctx.stroke();
  }
  // horizontal grain streaks
  for (let i = 0; i < 260; i++) {
    const y = rng() * size;
    const x = rng() * size;
    const len = 20 + rng() * 70;
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(60,38,20,0.25)' : 'rgba(170,135,90,0.2)';
    ctx.lineWidth = 1 + rng();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rng() - 0.5) * 4);
    ctx.stroke();
  }
  // knots
  for (let i = 0; i < 5; i++) {
    const x = rng() * size;
    const y = rng() * size;
    ctx.fillStyle = 'rgba(45,28,15,0.6)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + rng() * 5, 4 + rng() * 3, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 2, 2);
}

/**
 * Sand-stream texture: vertical falling-grain streaks on a transparent
 * background, tileable along V — the sand/visual/sandVisual.ts stream mesh
 * scrolls this texture's V-offset over time (rate driven by `sandFlow`) so
 * the stream reads as continuously flowing sand rather than a static
 * gradient decal. Alpha-only variation (color comes from the material).
 */
export function createSandStreamTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  ctx.clearRect(0, 0, size, size);
  const rng = noiseRng(0x5a17d);
  const streaks = 90;
  for (let i = 0; i < streaks; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = size * (0.08 + rng() * 0.22);
    const w = 1 + rng() * 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + rng() * 0.5})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, (y + len) % size);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Warm-day sky gradient with a restrained Paris horizon silhouette baked
 * into a single vertical band — VISUAL_ACCEPTANCE.md "控えめなパリの地平・
 * 空". Authored for a sphere's default V coordinate (0 at the top pole, 1
 * at the bottom pole), so a dome mesh needs no extra UV work.
 */
export function createSkyTexture(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#4f86c6'); // zenith
  grad.addColorStop(0.55, '#bcd9e8'); // mid sky
  grad.addColorStop(0.72, '#f2e3c6'); // warm horizon haze
  grad.addColorStop(0.82, '#e8caa0'); // horizon band
  grad.addColorStop(1, '#cbb98c'); // below-horizon ground haze fallback
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, size);

  // Restrained skyline silhouette, a thin jagged band right at the horizon.
  const horizonY = size * 0.8;
  const rng = noiseRng(0x9a12);
  ctx.fillStyle = 'rgba(90,84,86,0.55)';
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 6);
  let x = 0;
  while (x < canvas.width) {
    const w = 2 + rng() * 5;
    const h = rng() * 10;
    ctx.lineTo(x, horizonY + 6 - h);
    x += w;
    ctx.lineTo(x, horizonY + 6 - h);
  }
  ctx.lineTo(canvas.width, horizonY + 6);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Brass magnifier-ring frame: a radial "torus of metal" gradient (bright
 * highlight arc, darker shadow arc, knurled edge speckle) baked flat so the
 * magnifier's rim reads as a beveled, lit brass ring even though the
 * overlay it's drawn in is unlit — VISUAL_ACCEPTANCE.md's magnifier must
 * "look like a machinist's loupe … not abstract UI". Alpha is 0 outside
 * the ring band and inside the lens hole, so it composites over the
 * circular render-to-texture lens cleanly.
 */
export function createBrassRingFrameTexture(size = 512): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.5;
  const innerR = size * 0.4;
  const rng = noiseRng(0x1055b);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
  ctx.clip('evenodd');

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#f4dfa0'); // top-left highlight
  grad.addColorStop(0.45, '#b08d3f');
  grad.addColorStop(0.75, '#7a5f28');
  grad.addColorStop(1, '#3f3115'); // bottom-right shadow
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // knurled speckle for a machined-metal feel
  for (let i = 0; i < 700; i++) {
    const a = rng() * Math.PI * 2;
    const r = innerR + rng() * (outerR - innerR);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,240,200,0.18)' : 'rgba(30,20,8,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + rng() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // crisp inner + outer bezel lines
  ctx.restore();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(40,28,10,0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, innerR + 1.5, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Forged iron wedge: near-black iron with hammer-strike dents/highlights (VISUAL_ACCEPTANCE #5). */
export function createForgedIronTexture(size = 256): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = '#211a16';
  ctx.fillRect(0, 0, size, size);
  const rng = noiseRng(0xf026);
  for (let i = 0; i < 500; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 1 + rng() * 5;
    const lit = rng() < 0.5;
    ctx.fillStyle = lit ? `rgba(150,130,110,${0.08 + rng() * 0.18})` : `rgba(0,0,0,${0.15 + rng() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return finish(canvas, 2, 2);
}

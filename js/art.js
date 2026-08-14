// Every pixel is drawn procedurally: no image downloads, instant start,
// and it scales to any iPhone/iPad resolution without asset variants.

import {
  TAU, clamp, clamp01, lerp, smooth, easeOut, mix, roundRect, strokeThrough,
} from './util.js';
import { W, RACK_HALF, GUIDE, strandPoints, noodleColor } from './world.js';
import { screenSize } from './scene.js';
import { LIGHT, LIT, SHADE, AMBIENT } from './light.js';
import { texStyle, pattern } from './textures.js';

// How many world units one tile of each material spans. These are chosen so
// the grain of every surface lands at a similar size on screen — a consistent
// grain scale is most of what separates "photographed" from "drawn".
const SPAN = {
  wall: 620,
  floor: 560,
  rod: 300,
  board: 460,
  bamboo: 230,    // the woven placemat, where the canes read small
  cane: 900,      // a single bamboo pole: one or two canes across the stick
  cloth: 330,
  dough: 260,
  flour: 70,      // flour is a powder, so its grain must stay very fine
  ice: 260,
};

// --- soft contact shadow ------------------------------------------------
// One radial sprite, built once, stamped wherever something meets a surface.
// Far cheaper than creating a gradient per object per frame, and it gives
// every object the same falloff so they read as sharing a room.

let shadowSprite = null;
function getShadowSprite() {
  if (shadowSprite) return shadowSprite;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(38,22,10,0.62)');
  grd.addColorStop(0.45, 'rgba(38,22,10,0.34)');
  grd.addColorStop(1, 'rgba(38,22,10,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  shadowSprite = c;
  return c;
}

/** Stamp a contact shadow, offset the way the one light says it should fall. */
export function softShadow(ctx, x, y, rx, ry, alpha = 1) {
  if (alpha <= 0.01) return;
  const s = getShadowSprite();
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.drawImage(s, x - rx + SHADE.x * rx * 0.28, y - ry + SHADE.y * ry * 0.2, rx * 2, ry * 2);
  ctx.restore();
}

const PAL = {
  shop:    { top: '#d9b184', bot: '#a87c50', warm: '#c99a63' },
  outdoor: { top: '#63b9e0', bot: '#cfe6c0', warm: '#9fd0e8' },
  table:   { top: '#d9bb92', bot: '#ad8555', warm: '#cfae83' },
  summer:  { top: '#5ab5dd', bot: '#dcefc9', warm: '#a6dcf2' },
  dark:    { top: '#3a2f28', bot: '#171210', warm: '#4a3a2e' },
};

const WOOD_A = '#c99358';
const WOOD_B = '#9a6a3c';
const WOOD_C = '#e0b47f';

// ---------------------------------------------------------------- shapes

/** Filled ribbon of variable width along a spine. */
function ribbon(ctx, spine, widthAt, style) {
  const n = spine.length / 2;
  if (n < 2) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = spine[i * 2], y = spine[i * 2 + 1];
    const px = spine[Math.max(0, i - 1) * 2], py = spine[Math.max(0, i - 1) * 2 + 1];
    const nx = spine[Math.min(n - 1, i + 1) * 2], ny = spine[Math.min(n - 1, i + 1) * 2 + 1];
    let tx = nx - px, ty = ny - py;
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    const w = widthAt(i / (n - 1)) / 2;
    const ox = -ty * w, oy = tx * w;
    if (i === 0) ctx.moveTo(x + ox, y + oy);
    else ctx.lineTo(x + ox, y + oy);
  }
  for (let i = n - 1; i >= 0; i--) {
    const x = spine[i * 2], y = spine[i * 2 + 1];
    const px = spine[Math.max(0, i - 1) * 2], py = spine[Math.max(0, i - 1) * 2 + 1];
    const nx = spine[Math.min(n - 1, i + 1) * 2], ny = spine[Math.min(n - 1, i + 1) * 2 + 1];
    let tx = nx - px, ty = ny - py;
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    const w = widthAt(i / (n - 1)) / 2;
    ctx.lineTo(x + ty * w, y - tx * w);
  }
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

function blobPath(ctx, x, y, r, squash, seed, t) {
  ctx.beginPath();
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * TAU;
    const rr = r * (1 + 0.045 * Math.sin(a * 3 + t * 1.4 + seed) + 0.03 * Math.sin(a * 5 - t + seed * 2));
    const sx = x + Math.cos(a) * rr * (1 + squash);
    const sy = y + Math.sin(a) * rr * (1 - squash);
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
}

/**
 * A lump of dough. Drawn in its own local frame so the fibre texture travels
 * with the lump instead of sliding underneath it, then lit as a sphere: a
 * bright terminator toward the light, a dark rim, and a faint bounce on the
 * shadow side because dough is slightly translucent.
 */
function doughShape(ctx, x, y, r, squash, seed, alpha = 1) {
  if (alpha <= 0.01 || r <= 0.5) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  softShadow(ctx, x, y + r * 0.92, r * 1.15, r * 0.42, 0.85);

  ctx.translate(x, y);
  blobPath(ctx, 0, 0, r, squash, seed, W.time);

  // fibrous, flour-dusted skin
  ctx.fillStyle = texStyle(ctx, 'dough', SPAN.dough, '#f4e7cd');
  ctx.fill();

  // sphere lighting
  const lx = LIT.x * r * 0.42, ly = LIT.y * r * 0.42;
  const g = ctx.createRadialGradient(lx, ly, r * 0.05, 0, 0, r * 1.14);
  g.addColorStop(0, 'rgba(255,253,244,0.62)');
  g.addColorStop(0.45, 'rgba(255,250,235,0.12)');
  g.addColorStop(0.84, 'rgba(126,88,44,0.13)');
  g.addColorStop(1, 'rgba(104,70,32,0.26)');
  ctx.fillStyle = g;
  ctx.fill();

  // a light dusting of flour, only on lumps big enough to show it
  if (r > 46) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillStyle = texStyle(ctx, 'flour', SPAN.flour, 'rgba(255,255,255,0.15)');
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Shading across a round bar, solved as an actual cylinder rather than a
 * guessed three-stop gradient. `lp` is the light's component perpendicular to
 * the bar's axis; the bar is assumed to lie along local +x.
 */
function cylinderShade(ctx, thick, lp, strength = 1) {
  const g = ctx.createLinearGradient(0, -thick / 2, 0, thick / 2);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const n = t * 2 - 1;                       // surface normal, across the bar
    const nz = Math.sqrt(Math.max(0, 1 - n * n));
    const ndl = Math.max(0, n * lp + nz * LIGHT.z);
    const v = AMBIENT + (1 - AMBIENT) * ndl;   // 0..1 brightness
    g.addColorStop(t, `rgba(26,14,4,${(1 - v) * 0.62 * strength})`);
  }
  return g;
}

/** A wooden bar: real timber, lit as a cylinder, with a contact shadow. */
function woodRod(ctx, x0, y0, x1, y1, thick, opts = {}) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const L = Math.hypot(x1 - x0, y1 - y0);
  const span = opts.span ?? SPAN.rod;
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);

  // The pattern rides the rotated frame, so the grain runs along the bar.
  roundRect(ctx, 0, -thick / 2, L, thick, thick / 2);
  ctx.fillStyle = texStyle(ctx, opts.material || 'wood', span, WOOD_A);
  ctx.fill();
  if (opts.tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = opts.tintAlpha ?? 0.5;
    ctx.fillStyle = opts.tint;
    ctx.fill();
    ctx.restore();
  }

  // light's component across the bar
  const lp = -LIT.x * Math.sin(ang) + LIT.y * Math.cos(ang);
  ctx.fillStyle = cylinderShade(ctx, thick, lp);
  ctx.fill();

  // the glint along the lit side
  const litY = lp * thick * 0.3;
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = '#fff6e2';
  roundRect(ctx, thick * 0.35, litY - thick * 0.07, Math.max(0, L - thick * 0.7), thick * 0.14, thick * 0.07);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// ------------------------------------------------------------ background

export function drawBackground(ctx) {
  const a = PAL[W.mood.from] || PAL.shop;
  const b = PAL[W.mood.to] || PAL.shop;
  const t = smooth(W.mood.t);
  const g = ctx.createLinearGradient(0, 0, 0, screenSize.h);
  g.addColorStop(0, mix(a.top, b.top, t));
  g.addColorStop(1, mix(a.bot, b.bot, t));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, screenSize.w, screenSize.h);
}

export function drawVignette(ctx) {
  const spot = W.spotlight;
  const cx = screenSize.w / 2, cy = screenSize.h / 2;
  const r = Math.hypot(cx, cy);
  const g = ctx.createRadialGradient(cx, cy, r * lerp(0.55, 0.18, spot), cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(60,36,16,${lerp(0.22, 0.66, spot)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, screenSize.w, screenSize.h);
  if (W.flash > 0.002) {
    ctx.fillStyle = `rgba(255,255,255,${clamp01(W.flash)})`;
    ctx.fillRect(0, 0, screenSize.w, screenSize.h);
  }
}

/** Outdoor visibility, 0..1, so both halves of the sky fade together. */
function outdoorAmount() {
  if (W.mood.to === 'outdoor') return smooth(W.mood.t);
  if (W.mood.from === 'outdoor') return 1 - smooth(W.mood.t);
  return 0;
}

/** Hills and field — static given the camera, so this half is cached. */
export function drawSky(ctx) {
  const out = outdoorAmount();
  if (out < 0.01) return;
  ctx.save();
  ctx.globalAlpha = out;
  ctx.fillStyle = '#8fbf76';
  ctx.beginPath();
  ctx.moveTo(-2400, 420);
  for (let i = -6; i <= 6; i++) {
    ctx.quadraticCurveTo(i * 400 - 200, 250 - (i % 2) * 90, i * 400, 400);
  }
  ctx.lineTo(2400, 1400);
  ctx.lineTo(-2400, 1400);
  ctx.closePath();
  ctx.fill();
  const gg = ctx.createLinearGradient(0, 400, 0, 1200);
  gg.addColorStop(0, '#a8cf8a');
  gg.addColorStop(1, '#7fae66');
  ctx.fillStyle = gg;
  ctx.fillRect(-2400, 430, 4800, 1000);
  ctx.restore();
}

/** Sun and clouds — these move, so they stay out of the cached backdrop. */
export function drawSkyLive(ctx) {
  const out = outdoorAmount();
  if (out < 0.01) return;
  ctx.save();
  ctx.globalAlpha = out;

  const sx = 430, sy = -430;
  const bright = 0.4 + W.dryness * 0.6;
  const g = ctx.createRadialGradient(sx, sy, 20, sx, sy, 300);
  g.addColorStop(0, `rgba(255,246,196,${0.85 * bright})`);
  g.addColorStop(1, 'rgba(255,246,196,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sx, sy, 300, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff3bc';
  ctx.beginPath(); ctx.arc(sx, sy, 74 + W.dryness * 10, 0, TAU); ctx.fill();

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(W.time * 0.12);
  ctx.strokeStyle = `rgba(255,241,170,${0.35 * bright})`;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    ctx.rotate(TAU / 8);
    ctx.beginPath();
    ctx.moveTo(96, 0);
    ctx.lineTo(140 + Math.sin(W.time * 2 + i) * 10, 0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 5; i++) {
    const cx = -1100 + i * 560 + Math.sin(W.time * 0.08 + i) * 40;
    const cy = -720 + (i % 3) * 150;
    cloud(ctx, cx, cy, 92 + (i % 3) * 22);
  }
  ctx.restore();
}

function cloud(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.arc(x + r * 0.85, y + r * 0.12, r * 0.72, 0, TAU);
  ctx.arc(x - r * 0.85, y + r * 0.18, r * 0.62, 0, TAU);
  ctx.arc(x + r * 0.1, y - r * 0.5, r * 0.6, 0, TAU);
  ctx.fill();
}

/**
 * Workshop interior: plank wall, a shelf of jars, and the floor. A phone in
 * portrait shows far more height than the action needs, so the scenery — not
 * the camera — is what fills it.
 */
export function drawShop(ctx, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;

  // wall planks
  ctx.strokeStyle = 'rgba(150,102,58,0.22)';
  ctx.lineWidth = 5;
  for (let i = -8; i <= 3; i++) {
    const y = i * 190;
    ctx.beginPath();
    ctx.moveTo(-2400, y);
    ctx.lineTo(2400, y + 6);
    ctx.stroke();
  }

  // shelf with a few jars — reads as "a place where food is made"
  const sy = -620;
  woodRod(ctx, -1100, sy, 1100, sy, 34);
  const jars = [[-560, 62, '#e7d3ae'], [-430, 46, '#cfa877'], [-300, 74, '#f0e2c4'],
                [330, 54, '#dcc39a'], [470, 70, '#e7d3ae']];
  for (const [jx, jr, col] of jars) {
    ctx.fillStyle = 'rgba(90,58,30,0.18)';
    ctx.beginPath(); ctx.ellipse(jx, sy - 16, jr * 1.05, jr * 0.28, 0, 0, TAU); ctx.fill();
    const g = ctx.createLinearGradient(jx - jr, 0, jx + jr, 0);
    g.addColorStop(0, '#a97754');
    g.addColorStop(0.4, col);
    g.addColorStop(1, '#a37b4c');
    ctx.fillStyle = g;
    roundRect(ctx, jx - jr, sy - 22 - jr * 1.9, jr * 2, jr * 1.9, jr * 0.42);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,80,44,0.65)';
    roundRect(ctx, jx - jr * 0.78, sy - 30 - jr * 2.1, jr * 1.56, jr * 0.34, jr * 0.16);
    ctx.fill();
  }

  // hanging cloth (noren) at the very top
  ctx.fillStyle = 'rgba(112,146,152,0.88)';
  roundRect(ctx, -900, -1180, 1800, 210, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = -3; i <= 3; i++) {
    roundRect(ctx, i * 270 - 8, -1180, 16, 210, 6);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Warm workshop floor / worktop. */
export function drawFloor(ctx, y = 300, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = texStyle(ctx, 'floor', SPAN.floor, '#b8834b');
  ctx.fillRect(-2400, y, 4800, 1400);
  // ambient occlusion where the floor meets the wall, and light spilling
  // forward — the same trick a photographer's bounce card plays
  const g = ctx.createLinearGradient(0, y, 0, y + 900);
  g.addColorStop(0, 'rgba(52,30,12,0.5)');
  g.addColorStop(0.22, 'rgba(52,30,12,0.1)');
  g.addColorStop(1, 'rgba(52,30,12,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(-2400, y, 4800, 1400);
  ctx.fillStyle = 'rgba(255,242,214,0.28)';
  ctx.fillRect(-2400, y, 4800, 12);
  ctx.restore();
}

/** The round wooden board the dough is gathered on. */
export function drawBoard(ctx, cx, cy, r, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(90,58,30,0.18)';
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.42, r * 1.02, r * 0.38, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.25, r, r * 0.34, 0, 0, TAU);
  ctx.fillStyle = texStyle(ctx, 'wood', SPAN.board, '#d2a067');
  ctx.fill();
  // the board is a shallow disc: dim it away from the light, catch its rim
  const bg = ctx.createLinearGradient(cx - r, cy - r * 0.34, cx + r * 0.4, cy + r * 0.6);
  bg.addColorStop(0, 'rgba(255,246,224,0.22)');
  bg.addColorStop(0.5, 'rgba(60,36,14,0.04)');
  bg.addColorStop(1, 'rgba(60,36,14,0.3)');
  ctx.fillStyle = bg;
  ctx.fill();
  // worked-in flour: two plain fills, heavier in the middle where the dough
  // sits. (A destination-in mask would punch through the opaque canvas.)
  ctx.save();
  ctx.globalAlpha = alpha * 0.4;
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.26, r * 0.72, r * 0.245, 0, 0, TAU);
  ctx.fillStyle = texStyle(ctx, 'flour', SPAN.flour, 'rgba(255,255,255,0.3)');
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,244,220,0.4)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.25, r * 0.995, r * 0.338, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ dough

export function drawBlobs(ctx) {
  for (const b of W.blobs) {
    if (b.alpha <= 0.01) continue;
    doughShape(ctx, b.x, b.y, b.r, b.squash, b.seed, b.alpha);
  }
}

export function drawBall(ctx) {
  const b = W.ball;
  if (b.alpha <= 0.01 || b.r <= 1) return;
  doughShape(ctx, b.x, b.y, b.r, b.squash, 1.7, b.alpha);
}

const ropeSpine = new Float32Array(28 * 2);

export function drawRope(ctx) {
  const r = W.rope;
  if (r.alpha <= 0.01) return;
  const n = 28;
  const dx = r.hx - r.ax, dy = r.hy - r.ay;
  const L = Math.hypot(dx, dy) || 1;
  const sag = clamp(L * 0.13, 0, 90) * (1 - r.coil * 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const bend = Math.sin(Math.PI * t);
    ropeSpine[i * 2] = r.ax + dx * t + Math.sin(W.time * 1.6 + t * 3) * 4 * bend;
    ropeSpine[i * 2 + 1] = r.ay + dy * t + sag * bend + Math.sin(W.time * 2.1 + t * 4) * 3 * bend;
  }
  ctx.save();
  ctx.globalAlpha = r.alpha;
  const thickHead = r.thick;
  const thickTail = r.thick * 0.62;
  const widthAt = (t) => lerp(thickHead, thickTail, easeOut(t)) * (t > 0.97 ? 0.55 : 1);
  // cast shadow first
  ctx.save();
  ctx.translate(SHADE.x * thickHead * 0.5, thickHead * 0.8);
  ribbon(ctx, ropeSpine, widthAt, 'rgba(84,52,24,0.2)');
  ctx.restore();

  // the rope's own skin, then a proper cylinder gradient across it
  ribbon(ctx, ropeSpine, widthAt, texStyle(ctx, 'dough', SPAN.dough, '#f0e0c2'));
  ctx.fillStyle = 'rgba(255,255,255,0)';
  ctx.beginPath();
  ctx.arc(r.hx, ropeSpine[(n - 1) * 2 + 1], thickTail * 0.42, 0, TAU);
  ctx.fillStyle = texStyle(ctx, 'dough', SPAN.dough, '#f0e0c2');
  ctx.fill();

  // The rope runs left to right, so its axis is x and the light's across-
  // axis component is simply LIT.y.
  const midY = r.ay;
  const cg = ctx.createLinearGradient(0, midY - thickHead * 0.62, 0, midY + thickHead * 0.62);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const nn = t * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - nn * nn));
    const ndl = Math.max(0, nn * LIT.y + nz * LIGHT.z);
    const v = AMBIENT + (1 - AMBIENT) * ndl;
    cg.addColorStop(t, `rgba(70,44,18,${(1 - v) * 0.5})`);
  }
  ribbon(ctx, ropeSpine, widthAt, cg);

  // glint along the lit side
  ctx.save();
  ctx.translate(LIT.x * thickHead * 0.1, LIT.y * thickHead * 0.3);
  ribbon(ctx, ropeSpine, (t) => widthAt(t) * 0.22, 'rgba(255,252,240,0.75)');
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ rack

export function drawRack(ctx) {
  const rk = W.rack;
  if (rk.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = rk.alpha;
  const px = RACK_HALF + 130;
  const post = { span: 520, tint: '#c08d55', tintAlpha: 0.35 };
  woodRod(ctx, -px, rk.postTop, -px, rk.postBot, 46, post);
  woodRod(ctx, px, rk.postTop, px, rk.postBot, 46, post);
  // cross braces top and bottom
  woodRod(ctx, -px, rk.postTop + 60, px, rk.postTop + 60, 26, post);
  woodRod(ctx, -px, rk.postBot - 60, px, rk.postBot - 60, 26, post);
  // the rod the noodles hang from: handled timber, darker with use
  woodRod(ctx, -px - 56, rk.rodTopY, px + 56, rk.rodTopY, 30,
    { span: 300, tint: '#b07d45', tintAlpha: 0.42 });
  ctx.restore();
}

export function drawBottomRod(ctx) {
  const rk = W.rack;
  if (rk.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = rk.alpha;
  const grabGlow = rk.grabbed ? 1 : 0;
  if (grabGlow) {
    ctx.strokeStyle = 'rgba(255,236,160,0.85)';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-RACK_HALF - 70, rk.rodBotY);
    ctx.lineTo(RACK_HALF + 70, rk.rodBotY);
    ctx.stroke();
  }
  woodRod(ctx, -RACK_HALF - 60, rk.rodBotY, RACK_HALF + 60, rk.rodBotY, 24,
    { span: 300, tint: '#b07d45', tintAlpha: 0.42 });
  ctx.restore();
}

/**
 * Rows of noodles receding behind the player's rack — the "ずらっ" moment.
 *
 * They are deliberately dense, short and hazy: sparse long lines read as
 * scratches on the sky, whereas a packed curtain tinted toward the
 * background reads as depth. That tint is atmospheric perspective, and it is
 * doing more work here than any amount of extra detail would.
 */
export function drawBackRacks(ctx) {
  const a = clamp01(W.backRacks);
  if (a <= 0.01) return;
  const rk = W.rack;
  const spanTop = rk.rodTopY;
  const len = (rk.rodBotY - spanTop) * 0.58;
  const haze = W.mood.to === 'outdoor' ? '#bfe0ef' : '#d9b184';
  ctx.save();
  ctx.lineCap = 'round';
  for (let row = 3; row >= 1; row--) {
    const s = 1 - row * 0.16;
    const fade = row / 3.0;                      // how far into the haze
    const alpha = a * (0.5 - row * 0.115);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(row * 46, spanTop - row * 116);
    ctx.scale(s, s);
    ctx.translate(0, -spanTop);

    ctx.globalAlpha = Math.min(1, alpha * 1.4);
    woodRod(ctx, -RACK_HALF - 700, spanTop, RACK_HALF + 700, spanTop, 20,
      { span: 300, tint: haze, tintAlpha: 0.35 + fade * 0.5 });

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = mix(W.dryness > 0.4 ? '#fffdf6' : '#f2e6cc', haze, 0.3 + fade * 0.6);
    ctx.lineWidth = Math.max(4, W.baseThick * 1.25);
    const count = 46;
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const x = lerp(-RACK_HALF - 640, RACK_HALF + 640, u);
      const sway = Math.sin(W.time * 0.9 + i * 0.7 + row) * 5;
      ctx.beginPath();
      ctx.moveTo(x, spanTop);
      ctx.quadraticCurveTo(x + sway, spanTop + len * 0.5, x, spanTop + len);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// --------------------------------------------------------------- strands

// --------------------------------------------------------------- strands

// Scratch buffers reused for every strand: the shading offsets are recomputed
// each frame, but nothing is allocated.
let shiftBuf = null;

/**
 * Move every point of a polyline sideways *toward the light*, along the local
 * surface normal. This is what turns a stroked line into a lit cylinder: the
 * offset follows the curve instead of being a fixed screen-space nudge, so a
 * hanging strand and a strand lying on a board are both shaded correctly.
 */
function shiftTowardLight(pts, d, out) {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0;
    const i1 = i < n - 1 ? i + 1 : n - 1;
    let tx = pts[i1 * 2] - pts[i0 * 2];
    let ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    // remove the component along the strand: what is left is the normal
    const dot = LIT.x * tx + LIT.y * ty;
    out[i * 2] = pts[i * 2] + d * (LIT.x - dot * tx);
    out[i * 2 + 1] = pts[i * 2 + 1] + d * (LIT.y - dot * ty);
  }
}

/**
 * Colour of a noodle at brightness `v` (0 = fully shaded, 1 = facing the
 * light). Dried somen is faintly translucent, so the shaded side keeps a warm
 * cast rather than going grey — that warmth is what stops a white noodle
 * looking like a white line.
 */
function noodleTone(s, v, dry) {
  const warm = 1 - v;
  const r = (lerp(238, 255, dry) + s.tint * 14) * v + 96 * warm;
  const g = (lerp(224, 252, dry) + s.tint * 11) * v + 74 * warm;
  const b = (lerp(196, 244, dry) + s.tint * 8) * v + 48 * warm;
  return `rgb(${Math.min(255, r) | 0},${Math.min(255, g) | 0},${Math.min(255, b) | 0})`;
}

export function drawStrands(ctx) {
  const strands = W.strands;
  if (!strands.length || W.strandAlpha <= 0.01) return;
  const A = clamp01(W.strandAlpha);
  const dry = clamp01(W.dryness);
  const hanging = W.layout.to === 'hang';
  // Straight layouts need far fewer control points than a hanging curve.
  const step = hanging ? 2 : 4;

  if (!shiftBuf || shiftBuf.length < strands[0].pts.length) {
    shiftBuf = new Float32Array(strands[0].pts.length);
  }

  ctx.save();
  ctx.translate(0, W.strandOffsetY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // --- 1. shadow.
  // Hanging strands each throw their own, because the gaps between them are
  // the whole point. Once they are packed into a board or a bundle the
  // individual shadows merge anyway, so one shape stands in for all of them
  // — forty fewer strokes for a better result.
  if (hanging) {
    ctx.save();
    ctx.globalAlpha = 0.26 * A;
    ctx.strokeStyle = '#5d3f20';
    ctx.translate(SHADE.x * 9, SHADE.y * 9 + 4);
    for (const s of strands) {
      if (s.birth <= 0.02) continue;
      ctx.lineWidth = Math.max(1.1, s.thick * s.birth * 0.95);
      strokeThrough(ctx, strandPoints(s), step);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strands) {
      const p = strandPoints(s);
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0) x0 = p[i];
        if (p[i] > x1) x1 = p[i];
        if (p[i + 1] < y0) y0 = p[i + 1];
        if (p[i + 1] > y1) y1 = p[i + 1];
      }
    }
    if (x1 > x0) {
      softShadow(ctx, (x0 + x1) / 2 + SHADE.x * 10,
        (y0 + y1) / 2 + SHADE.y * 6 + 10,
        (x1 - x0) * 0.62, (y1 - y0) * 0.85, 0.5 * A);
    }
  }

  // --- 2. the noodles themselves, shaded as cylinders
  for (const s of strands) {
    if (s.birth <= 0.02) continue;
    const pts = strandPoints(s);
    const w = Math.max(1.1, s.thick * s.birth);
    const a = clamp01(s.birth) * A;

    ctx.globalAlpha = a;
    ctx.strokeStyle = noodleTone(s, 0.88, dry);
    ctx.lineWidth = w;
    strokeThrough(ctx, pts, step);
    ctx.stroke();

    // Below about three pixels the shading bands stop being visible, so we
    // simply skip them — which is also why the thinnest, most numerous stage
    // is not the most expensive one.
    if (w >= 3) {
      shiftTowardLight(pts, -w * 0.34, shiftBuf);
      ctx.strokeStyle = noodleTone(s, 0.6, dry);
      ctx.lineWidth = w * 0.28;
      strokeThrough(ctx, shiftBuf, step);
      ctx.stroke();

      shiftTowardLight(pts, w * 0.28, shiftBuf);
      ctx.strokeStyle = noodleTone(s, 1, dry);
      ctx.lineWidth = w * 0.46;
      strokeThrough(ctx, shiftBuf, step);
      ctx.stroke();

      // The glint only appears once the noodles dry and harden — it is the
      // single clearest signal that the dough has become something else.
      if (dry > 0.25 && w >= 5) {
        shiftTowardLight(pts, w * 0.4, shiftBuf);
        ctx.globalAlpha = a * (dry - 0.25) * 1.15;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(0.7, w * 0.15);
        strokeThrough(ctx, shiftBuf, step);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function drawOffcuts(ctx) {
  if (!W.offcuts.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const o of W.offcuts) {
    const a = clamp01(1 - o.t / 1.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot);
    ctx.strokeStyle = '#f7f1de';
    ctx.lineWidth = Math.max(1.4, o.thick);
    for (let i = 0; i < o.rows; i++) {
      const y = lerp(-o.h, o.h, i / Math.max(1, o.rows - 1));
      ctx.beginPath();
      ctx.moveTo(-o.w, y);
      ctx.lineTo(o.w, y);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ----------------------------------------------------- tools & fixtures

/** The separating stick used for 箸分け. */
export function drawComb(ctx, alpha = 1) {
  if (alpha <= 0.01) return;
  const x = W.comb;
  const span = W.rack.rodBotY - W.rack.rodTopY;
  const y0 = W.rack.rodTopY + span * 0.2;
  const y1 = W.rack.rodTopY + span * 0.82;
  const half = 19;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(80,52,26,0.22)';
  roundRect(ctx, x - half + 16, y0 + 12, half * 2, y1 - y0, half);
  ctx.fill();
  roundRect(ctx, x - half, y0, half * 2, y1 - y0, half);
  ctx.fillStyle = texStyle(ctx, 'bamboo', SPAN.cane, '#d2a468');
  ctx.fill();
  // A working bamboo stick is pale and polished, not dark: lift the tile
  // before shading, or the cylinder gradient takes it to near-black.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#c69a5a';
  ctx.fill();
  ctx.restore();
  // the stick stands vertically, so the light crosses it in x
  const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const nn = t * 2 - 1;
    const nz = Math.sqrt(Math.max(0, 1 - nn * nn));
    const ndl = Math.max(0, nn * LIT.x + nz * LIGHT.z);
    const v = AMBIENT + (1 - AMBIENT) * ndl;
    g.addColorStop(t, `rgba(64,38,14,${(1 - v) * 0.42})`);
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,250,230,0.5)';
  roundRect(ctx, x + LIT.x * half * 0.34 - 4, y0 + 12, 8, y1 - y0 - 24, 4);
  ctx.fill();
  // a grip knob so it reads as a tool to pick up
  ctx.fillStyle = '#e2604a';
  ctx.beginPath(); ctx.arc(x, y0 - 4, half * 1.25, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath(); ctx.ellipse(x - half * 0.4, y0 - 12, half * 0.4, half * 0.24, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawGuides(ctx) {
  const a = W.cut.guides;
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.setLineDash([16, 16]);
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const pulse = 0.55 + 0.45 * Math.sin(W.time * 3);
  for (const [gx, done, flash] of [[-GUIDE, W.cut.left, W.cut.flashL], [GUIDE, W.cut.right, W.cut.flashR]]) {
    ctx.strokeStyle = done ? 'rgba(255,255,255,0.25)' : `rgba(226,96,74,${0.45 + 0.35 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(gx, -300);
    ctx.lineTo(gx, 300);
    ctx.stroke();
    if (flash > 0.01) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.globalAlpha = flash;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(gx, -320);
      ctx.lineTo(gx, 320);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawCuttingBoard(ctx, alpha) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(90,58,30,0.2)';
  roundRect(ctx, -520, -262, 1040, 540, 40);
  ctx.fill();
  roundRect(ctx, -520, -280, 1040, 540, 36);
  ctx.fillStyle = texStyle(ctx, 'wood', SPAN.board, '#d9ab74');
  ctx.fill();
  const g = ctx.createLinearGradient(-520, -280, 330, 260);
  g.addColorStop(0, 'rgba(255,248,228,0.2)');
  g.addColorStop(0.55, 'rgba(70,42,16,0.03)');
  g.addColorStop(1, 'rgba(70,42,16,0.26)');
  ctx.fillStyle = g;
  ctx.fill();
  // a dusting of flour left over from the work
  ctx.save();
  ctx.globalAlpha = alpha * 0.22;
  ctx.fillStyle = texStyle(ctx, 'flour', SPAN.flour, 'rgba(255,255,255,0.2)');
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** The paper band that turns loose noodles into a familiar bundle. */
export function drawBand(ctx) {
  const b = W.band;
  if (b.alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = b.alpha;
  const w = lerp(120, 132, b.t);
  const h = lerp(64, 148, b.t);
  const x = b.on ? 0 : b.x;
  const y = b.on ? 0 : b.y;
  ctx.save();
  ctx.translate(x, y);
  if (!b.on) ctx.rotate(Math.sin(W.time * 2.4) * 0.08);
  // paper, not plastic: the cloth weave carries the fibre, a red multiply
  // gives it colour without flattening the texture
  roundRect(ctx, -w / 2, -h / 2, w, h, b.on ? 10 : 16);
  // A pale fibrous base multiplied with vermilion: multiplying onto the dark
  // indigo cloth would only ever give maroon.
  ctx.fillStyle = texStyle(ctx, 'flour', 110, '#e85e42');
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#e8492c';
  ctx.fill();
  ctx.restore();
  // the band wraps a round bundle, so it curves away at both edges
  const bg2 = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  bg2.addColorStop(0, 'rgba(84,16,6,0.34)');
  bg2.addColorStop(0.34, 'rgba(255,238,226,0.3)');
  bg2.addColorStop(1, 'rgba(84,16,6,0.3)');
  ctx.fillStyle = bg2;
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------ the reveal

export function drawPot(ctx, t) {
  // t: 0..1 across the boiling beat
  const a = clamp01(t * 3);
  ctx.save();
  ctx.globalAlpha = a;
  const y = 150;
  // body
  const g = ctx.createLinearGradient(0, y - 120, 0, y + 200);
  g.addColorStop(0, '#8e9aa6');
  g.addColorStop(1, '#4d5761');
  ctx.fillStyle = g;
  roundRect(ctx, -320, y - 110, 640, 300, 44);
  ctx.fill();
  // handles
  ctx.strokeStyle = '#5d6874';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-320, y - 50); ctx.lineTo(-395, y - 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(320, y - 50); ctx.lineTo(395, y - 22); ctx.stroke();
  // water
  ctx.fillStyle = '#e6efe6';
  ctx.beginPath();
  ctx.ellipse(0, y - 108, 318, 62, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(-90, y - 118, 120, 22, -0.2, 0, TAU);
  ctx.fill();
  // rim
  ctx.strokeStyle = '#b9c4cd';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.ellipse(0, y - 108, 320, 64, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Noodles swimming in the pot. */
export function drawBoilingNoodles(ctx, t) {
  const a = clamp01(t);
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#fffdf4';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  const y = 42;
  for (let i = 0; i < 20; i++) {
    const ph = i * 0.7;
    const cx = Math.sin(ph * 2.1) * 210;
    const cy = y + Math.cos(ph * 1.7) * 34;
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const x = cx + lerp(-130, 130, u) * (0.6 + 0.4 * Math.sin(ph));
      const yy = cy + Math.sin(u * 6 + W.time * 3 + ph) * 16;
      if (k === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}


/** The table and mat under the finished bowl — static, so it is cached. */
export function drawRevealTable(ctx, t) {
  const a = clamp01(t);
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = texStyle(ctx, 'floor', SPAN.floor, '#b8834b');
  ctx.fillRect(-2400, 60, 4800, 1400);
  const tg = ctx.createLinearGradient(0, 60, 0, 820);
  tg.addColorStop(0, 'rgba(255,238,206,0.16)');
  tg.addColorStop(0.32, 'rgba(46,26,10,0.02)');
  tg.addColorStop(1, 'rgba(46,26,10,0.3)');
  ctx.fillStyle = tg;
  ctx.fillRect(-2400, 60, 4800, 1400);
  ctx.fillStyle = 'rgba(255,244,216,0.3)';
  ctx.fillRect(-2400, 60, 4800, 10);

  ctx.fillStyle = 'rgba(90,58,30,0.22)';
  roundRect(ctx, -690, 108, 1380, 320, 24);
  ctx.fill();
  roundRect(ctx, -690, 90, 1380, 320, 24);
  ctx.fillStyle = texStyle(ctx, 'bamboo', SPAN.bamboo, '#e0c795');
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = a * 0.34;
  ctx.fillStyle = '#f6e6bd';
  ctx.fill();
  ctx.restore();
  const mg = ctx.createLinearGradient(-690, 90, 200, 410);
  mg.addColorStop(0, 'rgba(255,250,232,0.24)');
  mg.addColorStop(1, 'rgba(70,44,16,0.24)');
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.restore();
}

/** The payoff: a glass bowl of ice-cold somen. */
export function drawBowlScene(ctx, t) {
  const a = clamp01(t);
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = a;
  const rise = lerp(70, 0, easeOut(clamp01(t * 1.4)));
  ctx.translate(0, rise);

  // ---- glass bowl
  const by = 150, brx = 330, bry = 118;
  ctx.save();
  ctx.fillStyle = 'rgba(70,90,100,0.18)';
  ctx.beginPath(); ctx.ellipse(10, by + 165, brx * 0.92, 42, 0, 0, TAU); ctx.fill();

  // Full vessel silhouette: the upper arc of the rim ellipse *is* the top
  // edge, so the opening belongs to the bowl instead of floating above it.
  const ry = bry * 0.36;
  ctx.beginPath();
  ctx.ellipse(0, by, brx, ry, 0, Math.PI, TAU);
  ctx.bezierCurveTo(brx * 0.98, by + 190, brx * 0.5, by + 215, 0, by + 215);
  ctx.bezierCurveTo(-brx * 0.5, by + 215, -brx * 0.98, by + 190, -brx, by);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, by, 0, by + 215);
  bg.addColorStop(0, 'rgba(150,208,232,0.95)');
  bg.addColorStop(0.55, 'rgba(108,182,215,0.92)');
  bg.addColorStop(1, 'rgba(74,152,190,0.96)');
  ctx.fillStyle = bg;
  ctx.fill();

  // water + noodles clipped inside the bowl
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(126,196,226,0.85)';
  ctx.fillRect(-brx, by - ry - 4, brx * 2, 300);

  // The somen mound. Same cylinder treatment as the hanging strands: a
  // shadow sinking into the water, a warm body, then a glint along the top
  // edge. The glint is what makes cold noodles look wet rather than chalky.
  ctx.lineCap = 'round';
  const passes = [
    { off: 3.2, w: 7.5, c: 'rgba(52,104,138,0.45)' },
    { off: 0, w: 6.2, c: '#faf4e6' },
    { off: LIT.y * 1.8, w: 2.6, c: '#fffdf7' },
  ];
  const ROWS = 44;
  for (const pass of passes) {
    ctx.strokeStyle = pass.c;
    ctx.lineWidth = pass.w;
    for (let i = 0; i < ROWS; i++) {
      const u = i / (ROWS - 1);
      const yy = by + 30 + u * 132 + Math.sin(i * 2.3) * 4 + pass.off;
      const half = lerp(268, 108, Math.abs(u - 0.34) * 1.4);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const kk = k / 12;
        const x = lerp(-half, half, kk);
        const wav = Math.sin(kk * 4.2 + i * 1.9 + W.time * 0.5) * 5;
        if (k === 0) ctx.moveTo(x, yy + wav); else ctx.lineTo(x, yy + wav);
      }
      ctx.stroke();
    }
  }

  // ice cubes
  for (const [ix, iy, s, rot] of [[-170, by + 62, 1, 0.3], [150, by + 84, 0.9, -0.4], [-30, by + 40, 0.75, 0.9]]) {
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    roundRect(ctx, -46, -40, 92, 80, 16);
    ctx.fillStyle = texStyle(ctx, 'ice', 60, 'rgba(238,251,255,0.82)');
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = 'rgba(246,253,255,0.92)';
    ctx.fill();
    ctx.restore();
    // a bright facet toward the light and a cool edge away from it
    const ig = ctx.createLinearGradient(-46, -40, 46, 40);
    ig.addColorStop(0, 'rgba(255,255,255,0.75)');
    ig.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    ig.addColorStop(1, 'rgba(122,176,204,0.4)');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3.5;
    roundRect(ctx, -46, -40, 92, 80, 16);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore(); // unclip

  // bowl rim + glass highlights
  ctx.strokeStyle = 'rgba(232,249,255,0.95)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(0, by, brx, ry, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-brx * 0.82, by + 40);
  ctx.quadraticCurveTo(-brx * 0.9, by + 140, -brx * 0.42, by + 194);
  ctx.stroke();
  ctx.restore();

  // ---- garnish: green shiso + tomato
  ctx.save();
  ctx.translate(-250, by - 6);
  ctx.rotate(-0.35);
  ctx.fillStyle = '#5aa64a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(60, -52, 130, -8);
  ctx.quadraticCurveTo(62, 44, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(120, -8); ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#e2503c';
  ctx.beginPath(); ctx.arc(232, by + 6, 40, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(218, by - 10, 13, 8, -0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4e9a3f';
  ctx.beginPath(); ctx.ellipse(232, by - 32, 20, 8, 0, 0, TAU); ctx.fill();

  // ---- dipping cup
  ctx.save();
  ctx.translate(430, by + 90);
  ctx.fillStyle = 'rgba(70,90,100,0.16)';
  ctx.beginPath(); ctx.ellipse(6, 78, 96, 24, 0, 0, TAU); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-96, -46);
  ctx.bezierCurveTo(-90, 60, -50, 76, 0, 76);
  ctx.bezierCurveTo(50, 76, 90, 60, 96, -46);
  ctx.closePath();
  const cg = ctx.createLinearGradient(0, -46, 0, 76);
  cg.addColorStop(0, '#fdfaf2');
  cg.addColorStop(1, '#ddd3c0');
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.fillStyle = '#5a3418';
  ctx.beginPath(); ctx.ellipse(0, -44, 92, 26, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(-30, -50, 34, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6fbf52';
  for (const [ox, oy] of [[-34, -44], [8, -50], [36, -38], [-8, -34]]) {
    ctx.beginPath(); ctx.ellipse(ox, oy, 9, 5, 0.4, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(0, -44, 94, 27, 0, 0, TAU); ctx.stroke();
  ctx.restore();

  // ---- chopsticks lifting a little bundle of noodles
  const lift = easeOut(clamp01((t - 0.35) * 1.8));
  if (lift > 0.01) {
    ctx.save();
    ctx.globalAlpha = a * lift;
    ctx.translate(40, by - 196 - lift * 18 + Math.sin(W.time * 1.4) * 6);
    ctx.rotate(0.42);
    // the drape first, so the sticks sit on top
    ctx.lineCap = 'round';
    for (const dp of [{ o: 2.4, w: 8, c: 'rgba(120,150,168,0.45)' },
                      { o: 0, w: 7, c: '#fbf6e9' },
                      { o: -2.1, w: 2.6, c: '#ffffff' }]) {
      ctx.strokeStyle = dp.c;
      ctx.lineWidth = dp.w;
      for (let i = 0; i < 12; i++) {
        const x = -46 + i * 8.5 + dp.o;
        const drop = 150 + Math.sin(i * 1.7) * 46;
        ctx.beginPath();
        ctx.moveTo(x, 6);
        ctx.quadraticCurveTo(x + 16 + Math.sin(W.time * 1.2 + i) * 6, drop * 0.6, x + 4, drop);
        ctx.stroke();
      }
    }
    for (const off of [-26, 22]) {
      ctx.save();
      ctx.rotate(off * 0.0045);
      roundRect(ctx, off - 9, -300, 18, 340, 9);
      ctx.fillStyle = texStyle(ctx, 'bamboo', SPAN.cane, '#d8b073');
      ctx.fill();
      const g2 = ctx.createLinearGradient(off - 9, 0, off + 9, 0);
      g2.addColorStop(0, 'rgba(255,246,224,0.4)');
      g2.addColorStop(1, 'rgba(58,34,12,0.4)');
      ctx.fillStyle = g2;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** The finished bundle, drawn as an object (used just before the reveal). */
export function drawBundleGlow(ctx, amount) {
  if (amount <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = amount * 0.5;
  const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 460);
  g.addColorStop(0, 'rgba(255,246,210,0.9)');
  g.addColorStop(1, 'rgba(255,246,210,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, 460, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- hints

/** A wiggling finger with a pulsing ring: "touch here next". */
export function drawHint(ctx) {
  const h = W.hint;
  if (h.on <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = h.on;
  const pulse = (W.time * 1.5) % 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 8 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(h.x, h.y, lerp(24, 100, pulse), 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,229,140,${0.8 * (1 - pulse)})`;
  ctx.lineWidth = 14 * (1 - pulse);
  ctx.beginPath();
  ctx.arc(h.x, h.y, lerp(18, 74, pulse), 0, TAU);
  ctx.stroke();

  const wig = Math.sin(W.time * 5) * 14;
  ctx.save();
  ctx.translate(h.x, h.y);
  if (h.kind === 'drag') {
    ctx.rotate(h.ang);
    ctx.translate(wig * 1.6, 0);
    ctx.rotate(-h.ang);
    // direction arrow
    ctx.save();
    ctx.rotate(h.ang);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.moveTo(120, 0); ctx.lineTo(74, -32); ctx.lineTo(74, 32);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {
    ctx.translate(0, wig * 0.5);
  }
  drawFinger(ctx);
  ctx.restore();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFinger(ctx) {
  ctx.save();
  // offset down-right so the finger points at the target without hiding it
  ctx.translate(34, 52);
  ctx.rotate(-0.25);
  ctx.fillStyle = 'rgba(60,40,24,0.25)';
  roundRect(ctx, -20 + 6, 6, 46, 104, 23);
  ctx.fill();
  ctx.fillStyle = '#ffe0be';
  roundRect(ctx, -20, 0, 46, 104, 23);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,132,88,0.75)';
  ctx.lineWidth = 4;
  roundRect(ctx, -20, 0, 46, 104, 23);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  roundRect(ctx, -12, 12, 12, 40, 6);
  ctx.fill();
  ctx.restore();
}

// -------------------------------------------------------- screen widgets

export function drawSpeaker(ctx, x, y, r, muted) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#6b4a2c';
  const s = r * 0.052;
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 5 * s);
  ctx.lineTo(x - 2 * s, y - 5 * s);
  ctx.lineTo(x + 4 * s, y - 11 * s);
  ctx.lineTo(x + 4 * s, y + 11 * s);
  ctx.lineTo(x - 2 * s, y + 5 * s);
  ctx.lineTo(x - 7 * s, y + 5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6b4a2c';
  ctx.lineWidth = 2.4 * s;
  ctx.lineCap = 'round';
  if (muted) {
    ctx.beginPath();
    ctx.moveTo(x + 8 * s, y - 6 * s);
    ctx.lineTo(x + 16 * s, y + 6 * s);
    ctx.moveTo(x + 16 * s, y - 6 * s);
    ctx.lineTo(x + 8 * s, y + 6 * s);
    ctx.stroke();
  } else {
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x + 4 * s, y, i * 6 * s, -0.8, 0.8);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Circular arrow around a little dough lump: "play again". */
export function drawReplay(ctx, x, y, r, t) {
  ctx.save();
  const pop = 1 + Math.sin(t * 2.4) * 0.05;
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e2604a';
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.56, -2.5, 1.9);
  ctx.stroke();
  const ax = Math.cos(-2.5) * r * 0.56, ay = Math.sin(-2.5) * r * 0.56;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(-2.5 + Math.PI / 2);
  ctx.fillStyle = '#e2604a';
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.3); ctx.lineTo(r * 0.26, r * 0.12); ctx.lineTo(-r * 0.26, r * 0.12);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f3e2c4';
  ctx.beginPath(); ctx.arc(0, r * 0.04, r * 0.24, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Warm sunbeams for the final tableau. */
export function drawSunbeams(ctx, amount) {
  if (amount <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = amount * 0.15;
  ctx.translate(screenSize.w * 0.5, -screenSize.h * 0.15);
  ctx.rotate(Math.sin(W.time * 0.15) * 0.05);
  const R = Math.hypot(screenSize.w, screenSize.h) * 1.4;
  for (let i = 0; i < 9; i++) {
    ctx.save();
    ctx.rotate((i / 9) * Math.PI - Math.PI / 2 + 0.15);
    const g = ctx.createLinearGradient(0, 0, 0, R);
    g.addColorStop(0, 'rgba(255,250,214,0.9)');
    g.addColorStop(1, 'rgba(255,250,214,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-38, R);
    ctx.lineTo(38, R);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

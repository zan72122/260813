// Particles: flour dust, sparkles, steam, bubbles. Fixed-size pool so a
// long session never grows the heap.

import { TAU, clamp01, lerp } from './util.js';

const MAX = 260;
const pool = [];
for (let i = 0; i < MAX; i++) {
  pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 4, rot: 0, spin: 0, kind: 'dust', color: '#ffffff', drag: 0.9 });
}
let cursor = 0;

function spawn() {
  for (let i = 0; i < MAX; i++) {
    const p = pool[(cursor + i) % MAX];
    if (!p.alive) { cursor = (cursor + i + 1) % MAX; return p; }
  }
  const p = pool[cursor];
  cursor = (cursor + 1) % MAX;
  return p;
}

export function emit(kind, x, y, opts = {}) {
  const n = opts.count ?? 8;
  for (let i = 0; i < n; i++) {
    const p = spawn();
    p.alive = true;
    p.kind = kind;
    p.x = x + (Math.random() * 2 - 1) * (opts.spread ?? 10);
    p.y = y + (Math.random() * 2 - 1) * (opts.spread ?? 10);
    const a = opts.angle ?? Math.random() * TAU;
    const sp = (opts.speed ?? 60) * (0.5 + Math.random());
    const aa = a + (Math.random() * 2 - 1) * (opts.arc ?? TAU / 2);
    p.vx = Math.cos(aa) * sp;
    p.vy = Math.sin(aa) * sp;
    p.rot = Math.random() * TAU;
    p.spin = (Math.random() * 2 - 1) * 4;
    p.max = (opts.life ?? 0.9) * (0.7 + Math.random() * 0.6);
    p.life = p.max;
    p.size = (opts.size ?? 5) * (0.6 + Math.random() * 0.8);
    p.color = opts.color ?? '#ffffff';

    switch (kind) {
      case 'dust':   p.g = 40;   p.drag = 1.6; break;
      case 'spark':  p.g = -10;  p.drag = 1.1; break;
      case 'star':   p.g = 90;   p.drag = 0.8; break;
      case 'steam':  p.g = -70;  p.drag = 0.9; break;
      case 'bubble': p.g = -140; p.drag = 0.6; break;
      case 'crumb':  p.g = 520;  p.drag = 0.4; break;
      default:       p.g = 0;    p.drag = 1.0;
    }
  }
}

export function updateFx(dt) {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; continue; }
    p.vy += p.g * dt;
    const d = Math.exp(-p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }
}

export function drawFx(ctx) {
  for (let i = 0; i < MAX; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    const t = clamp01(p.life / p.max);
    ctx.save();
    ctx.translate(p.x, p.y);
    switch (p.kind) {
      case 'spark':
      case 'star': {
        ctx.rotate(p.rot);
        const s = p.size * (p.kind === 'star' ? lerp(0.4, 1.2, t) : lerp(0.2, 1.3, t));
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        // four-point twinkle
        ctx.beginPath();
        ctx.moveTo(0, -s * 2);
        ctx.quadraticCurveTo(s * 0.28, -s * 0.28, s * 2, 0);
        ctx.quadraticCurveTo(s * 0.28, s * 0.28, 0, s * 2);
        ctx.quadraticCurveTo(-s * 0.28, s * 0.28, -s * 2, 0);
        ctx.quadraticCurveTo(-s * 0.28, -s * 0.28, 0, -s * 2);
        ctx.fill();
        break;
      }
      case 'steam': {
        ctx.globalAlpha = t * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * lerp(2.4, 0.8, t), 0, TAU);
        ctx.fill();
        break;
      }
      case 'bubble': {
        ctx.globalAlpha = t * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * lerp(0.5, 1.1, 1 - t), 0, TAU);
        ctx.stroke();
        break;
      }
      default: {
        ctx.globalAlpha = t * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * lerp(0.3, 1, t), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function clearFx() {
  for (let i = 0; i < MAX; i++) pool[i].alive = false;
}

// --- expanding rings (used for "you touched here" feedback) ------------

const rings = [];
export function ring(x, y, opts = {}) {
  rings.push({
    x, y, t: 0,
    life: opts.life ?? 0.6,
    r0: opts.r0 ?? 10,
    r1: opts.r1 ?? 90,
    color: opts.color ?? '#ffffff',
    width: opts.width ?? 6,
  });
}
export function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].t += dt;
    if (rings[i].t >= rings[i].life) rings.splice(i, 1);
  }
}
export function drawRings(ctx) {
  for (const r of rings) {
    const k = clamp01(r.t / r.life);
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width * (1 - k * 0.6);
    ctx.beginPath();
    ctx.arc(r.x, r.y, lerp(r.r0, r.r1, 1 - Math.pow(1 - k, 2)), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
export function clearRings() { rings.length = 0; }

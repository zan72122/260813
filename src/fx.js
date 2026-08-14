// パーティクル（湯気・きらきら・ミスト・しずく・泡）
import { TAU, clamp, rrange, rand, softDisc, starSprite } from './util.js';

export class Particles {
  constructor(max = 220) {
    this.list = [];
    this.max = max;
  }
  clear() { this.list.length = 0; }
  get count() { return this.list.length; }

  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
      life: 0, max: 1, size: 10, grow: 0, rot: 0, vr: 0,
      kind: 'steam', color: '#fff', alpha: 1, wob: 0, phase: rand() * TAU,
    }, p));
  }

  /** もくもく湯気 */
  steam(x, y, opts = {}) {
    const n = opts.n ?? 1;
    for (let i = 0; i < n; i++) {
      this.spawn({
        kind: 'steam',
        x: x + rrange(-1, 1) * (opts.spread ?? 8),
        y: y + rrange(-4, 4),
        vx: rrange(-0.25, 0.25) * (opts.drift ?? 30),
        vy: -rrange(0.6, 1.3) * (opts.rise ?? 60),
        ay: -rrange(4, 16),
        size: (opts.size ?? 34) * rrange(0.7, 1.25),
        grow: (opts.grow ?? 42) * rrange(0.8, 1.3),
        max: (opts.life ?? 1.6) * rrange(0.8, 1.25),
        alpha: opts.alpha ?? 0.5,
        wob: rrange(6, 18),
      });
    }
  }

  /** きらきら */
  sparkle(x, y, opts = {}) {
    const n = opts.n ?? 1;
    for (let i = 0; i < n; i++) {
      this.spawn({
        kind: 'star',
        x: x + rrange(-1, 1) * (opts.spread ?? 20),
        y: y + rrange(-1, 1) * (opts.spread ?? 20),
        vx: rrange(-1, 1) * (opts.speed ?? 30),
        vy: -rrange(0.2, 1) * (opts.rise ?? 50),
        ay: opts.gravity ?? 20,
        size: (opts.size ?? 22) * rrange(0.6, 1.3),
        grow: -6,
        max: (opts.life ?? 0.9) * rrange(0.7, 1.3),
        alpha: opts.alpha ?? 1,
        vr: rrange(-2, 2),
      });
    }
  }

  /** 霧吹きのミスト（円錐状） */
  mist(x, y, dir, opts = {}) {
    const n = opts.n ?? 6;
    for (let i = 0; i < n; i++) {
      const a = dir + rrange(-1, 1) * (opts.cone ?? 0.35);
      const sp = (opts.speed ?? 300) * rrange(0.6, 1.4);
      this.spawn({
        kind: 'mist',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        ay: 220,
        size: rrange(3, 8) * (opts.scale ?? 1),
        grow: 6,
        max: rrange(0.35, 0.7),
        alpha: 0.75,
        color: opts.color ?? '#eaf6ff',
      });
    }
  }

  /** しずく／飛沫 */
  splash(x, y, opts = {}) {
    const n = opts.n ?? 8;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rrange(-1, 1) * (opts.cone ?? 1.1);
      const sp = (opts.speed ?? 220) * rrange(0.5, 1.3);
      this.spawn({
        kind: 'drop',
        x: x + rrange(-8, 8), y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        ay: 900,
        size: rrange(3, 7) * (opts.scale ?? 1),
        max: rrange(0.4, 0.8),
        alpha: 0.9,
        color: opts.color ?? '#9ad9f0',
      });
    }
  }

  /** 泡（水中） */
  bubble(x, y, opts = {}) {
    this.spawn({
      kind: 'bubble',
      x: x + rrange(-1, 1) * (opts.spread ?? 20), y,
      vx: rrange(-6, 6), vy: -rrange(20, 60),
      size: rrange(3, 9) * (opts.scale ?? 1),
      max: rrange(0.6, 1.4),
      alpha: 0.7,
      color: opts.color ?? '#ffffff',
      wob: rrange(4, 12),
    });
  }

  /** ちぎれた糸のかけら */
  fleck(x, y, opts = {}) {
    this.spawn({
      kind: 'fleck',
      x, y,
      vx: rrange(-40, 40), vy: rrange(-30, 20),
      ay: 380,
      size: rrange(6, 16),
      max: rrange(0.5, 1.0),
      alpha: 0.9,
      rot: rand() * TAU, vr: rrange(-4, 4),
    });
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life += dt;
      if (p.life >= p.max) { l.splice(i, 1); continue; }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
      if (p.wob) p.x += Math.sin(p.life * 3 + p.phase) * p.wob * dt;
    }
  }

  draw(ctx) {
    const disc = softDisc();
    const star = starSprite();
    for (const p of this.list) {
      const u = p.life / p.max;
      let a = p.alpha;
      if (p.kind === 'steam') a *= Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.9) * 0.9;
      else if (p.kind === 'star') a *= Math.sin(u * Math.PI);
      else a *= 1 - u * u;
      a = clamp(a, 0, 1);
      if (a <= 0.01 || p.size <= 0) continue;
      ctx.globalAlpha = a;
      switch (p.kind) {
        case 'steam': {
          const s = p.size;
          ctx.drawImage(disc, p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case 'star': {
          const s = p.size;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.drawImage(star, -s, -s, s * 2, s * 2);
          ctx.restore();
          break;
        }
        case 'mist': {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          break;
        }
        case 'drop': {
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.65, p.size * 1.15, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'bubble': {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size * 0.22);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'fleck': {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 0.55, p.size * 0.16, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
}

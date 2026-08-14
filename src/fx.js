// 軽量パーティクル。水滴・しぶき・湯気・きらめき・風。
import { clamp, TAU } from './util.js';

export class Fx {
  constructor(max = 320) {
    this.p = [];
    this.max = max;
    this.ripples = [];
  }

  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 900, life: 0, max: 1,
      r: 6, kind: 'drop', rot: 0, vr: 0, seed: Math.random(),
    }, o));
  }

  // 枠のふちからにじみ出る水滴
  drop(x, y, vx = 0, vy = 0, r = 5) {
    this.spawn({ x, y, vx, vy, r, kind: 'drop', max: 0.9 + Math.random() * 0.5, g: 1400 });
  }

  splash(x, y, n = 6, power = 130, kind = 'goo') {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.5 + (Math.random() - 0.5) * 2.4;
      const s = power * (0.4 + Math.random() * 0.9);
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        r: 4 + Math.random() * 7, kind, max: 0.6 + Math.random() * 0.5, g: 1500,
      });
    }
  }

  steam(x, y) {
    this.spawn({
      x, y, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 50,
      r: 14 + Math.random() * 16, kind: 'steam', max: 1.1 + Math.random() * 0.6, g: -30,
    });
  }

  sparkle(x, y) {
    this.spawn({
      x, y, vx: (Math.random() - 0.5) * 130, vy: -50 - Math.random() * 130,
      r: 5 + Math.random() * 7, kind: 'spark', max: 0.7 + Math.random() * 0.6, g: 260,
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8,
    });
  }

  flake(x, y) {
    this.spawn({
      x, y, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 60,
      r: 3 + Math.random() * 5, kind: 'flake', max: 0.8 + Math.random() * 0.5, g: 420,
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10,
    });
  }

  ripple(x, y, r0 = 10, r1 = 120, life = 0.9) {
    this.ripples.push({ x, y, r0, r1, life: 0, max: life });
  }

  update(dt) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life += dt;
      if (q.life >= q.max) { this.p.splice(i, 1); continue; }
      q.vy += q.g * dt;
      if (q.kind === 'steam') q.vx += Math.sin(q.life * 3 + q.seed * 9) * 30 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life += dt;
      if (r.life >= r.max) this.ripples.splice(i, 1);
    }
  }

  draw(ctx) {
    for (const r of this.ripples) {
      const t = r.life / r.max;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r0 + (r.r1 - r.r0) * t, (r.r0 + (r.r1 - r.r0) * t) * 0.42, 0, 0, TAU);
      ctx.strokeStyle = `rgba(178,214,180,${0.34 * (1 - t)})`;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.stroke();
    }
    for (const q of this.p) {
      const t = q.life / q.max;
      const a = 1 - t * t;
      if (q.kind === 'drop') {
        const st = clamp(Math.hypot(q.vx, q.vy) / 700, 0, 1);
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(Math.atan2(q.vy, q.vx) - Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, q.r * (1 - 0.35 * st), q.r * (1 + 0.9 * st), 0, 0, TAU);
        ctx.fillStyle = `rgba(196,232,226,${0.62 * a})`;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-q.r * 0.25, -q.r * 0.2, q.r * 0.3, q.r * 0.4, 0, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.6 * a})`;
        ctx.fill();
        ctx.restore();
      } else if (q.kind === 'goo') {
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, q.r * (1 - t * 0.3), q.r * (1 - t * 0.3) * 0.85, 0, 0, TAU);
        ctx.fillStyle = `rgba(29,54,38,${0.9 * a})`;
        ctx.fill();
      } else if (q.kind === 'steam') {
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.r * (0.5 + t * 1.9), 0, TAU);
        ctx.fillStyle = `rgba(226,240,232,${0.055 * a * (1 - t * 0.5)})`;
        ctx.fill();
      } else if (q.kind === 'spark') {
        ctx.save();
        ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        const r = q.r * (1 - t * 0.4);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const A = (i / 4) * TAU;
          ctx.lineTo(Math.cos(A) * r, Math.sin(A) * r);
          ctx.lineTo(Math.cos(A + TAU / 8) * r * 0.34, Math.sin(A + TAU / 8) * r * 0.34);
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(255,238,170,${0.9 * a})`;
        ctx.fill();
        ctx.restore();
      } else if (q.kind === 'flake') {
        ctx.save();
        ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.fillStyle = `rgba(20,36,26,${0.85 * a})`;
        ctx.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r);
        ctx.restore();
      }
    }
  }

  clear() { this.p.length = 0; this.ripples.length = 0; }
}

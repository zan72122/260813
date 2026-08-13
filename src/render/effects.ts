/** きらきら・紙ふぶきなどの粒子演出 */

import { rgbaToCss, type RGB } from '../core/colors';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: RGB;
  spin: number;
  rot: number;
  kind: 'spark' | 'confetti';
  gravity: number;
}

const CONFETTI_COLORS: RGB[] = [
  [255, 138, 176],
  [255, 209, 102],
  [126, 217, 189],
  [130, 177, 255],
  [197, 156, 245],
  [255, 255, 255],
];

export class Particles {
  private items: Particle[] = [];
  reduced = false;

  get count(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }

  burst(x: number, y: number, color: RGB, amount = 14): void {
    const n = this.reduced ? Math.ceil(amount / 3) : amount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 80 + Math.random() * 190;
      this.items.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 3 + Math.random() * 6,
        color,
        spin: 0,
        rot: 0,
        kind: 'spark',
        gravity: 90,
      });
    }
  }

  confetti(w: number, h: number, amount = 60): void {
    const n = this.reduced ? Math.ceil(amount / 4) : amount;
    for (let i = 0; i < n; i++) {
      this.items.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.4,
        vx: (Math.random() - 0.5) * 90,
        vy: 130 + Math.random() * 190,
        life: 0,
        maxLife: 2.4 + Math.random() * 1.4,
        size: 7 + Math.random() * 9,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        spin: (Math.random() - 0.5) * 9,
        rot: Math.random() * Math.PI,
        kind: 'confetti',
        gravity: 60,
      });
    }
  }

  update(dt: number): void {
    const next: Particle[] = [];
    for (const p of this.items) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - 1.6 * dt;
      p.rot += p.spin * dt;
      next.push(p);
    }
    this.items = next;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.items.length) return;
    ctx.save();
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgbaToCss(p.color, alpha * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgbaToCss(p.color, alpha);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

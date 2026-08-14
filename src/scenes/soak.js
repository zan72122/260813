// 1. 導入：かたい豆に水を入れる → ふくらむ
// まだ何になるかは見せない。「さわると変わる」だけを教える工程。
import { Scene } from '../game.js';
import { TAU, clamp, lerp, rrange, easeOut } from '../util.js';
import { drawRoom, drawTable, drawBean, BEAN_LOOK, blendLook, glowSpot, drawHandHint } from '../art.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

export class SoakScene extends Scene {
  enter(f) {
    this.px = new Particles(120);
    this.fill = 0;          // 0..1 水位
    this.plump = 0;         // 0..1 豆のふくらみ
    this.pouring = false;
    this.pourT = 0;
    this.taps = 0;
    this.finishT = -1;
    this.beans = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const col = i % 4, row = (i / 4) | 0;
      this.beans.push({
        bx: (col - 1.5) * 0.32 + rrange(-0.05, 0.05),
        by: (row - 1.5) * 0.19 + rrange(-0.04, 0.04),
        rot: rrange(-0.6, 0.6),
        ph: rrange(0, TAU),
      });
    }
    this.layout(f);
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.bowl = { x: W * 0.5, y: H * 0.62, r: S * 0.33 };
      this.tap = { x: W * 0.5, y: H * 0.18, s: S * 0.13, side: 0 };
    } else {
      this.bowl = { x: W * 0.58, y: H * 0.62, r: S * 0.34 };
      this.tap = { x: W * 0.24, y: H * 0.24, s: S * 0.16, side: -1 };
    }
  }

  down(p) {
    if (this.fill >= 1) return;
    // 幼児向け補正：蛇口を外しても、画面のどこを触っても水は出る。
    // 1 回さわれば最後まで注がれ、連打すると勢いが増す。
    this.pouring = true;
    this.pourT = Math.min(3.4, this.pourT + 2.6);
    this.taps++;
    sfx.lever();
    sfx.water();
  }

  update(dt, f) {
    const S = f.S;
    if (this.pourT > 0) {
      this.pourT -= dt;
      this.fill = clamp(this.fill + dt * 0.42 * (1 + Math.min(this.taps - 1, 4) * 0.2), 0, 1);
      const surf = this.surfaceY();
      this.px.splash(this.bowl.x + rrange(-0.2, 0.2) * this.bowl.r, surf, { n: 2, speed: S * 0.5, scale: S * 0.006 });
      if (Math.random() < 0.5) this.px.bubble(this.bowl.x, surf + this.bowl.r * 0.2, { spread: this.bowl.r * 0.7, scale: S * 0.004 });
    } else {
      this.pouring = false;
    }
    // 水が入っている間だけ、豆はゆっくりふくらむ
    this.plump = clamp(this.plump + (this.fill > 0.15 ? dt * 0.5 : 0), 0, 1);

    if (this.fill >= 1 && this.plump >= 1 && this.finishT < 0) {
      this.finishT = 0;
      sfx.ding();
      for (let i = 0; i < 10; i++) {
        this.px.sparkle(this.bowl.x + rrange(-1, 1) * this.bowl.r * 0.8, this.bowl.y - this.bowl.r * 0.2, { n: 1, size: S * 0.03 });
      }
    }
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 1.3) this.next('steam');
    }
    this.px.update(dt);
  }

  surfaceY() {
    const b = this.bowl;
    return b.y + b.r * 0.42 - this.fill * b.r * 0.78;
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#e8f4ff', bottom: '#ffe6bd' });
    drawTable(ctx, W, H, H * 0.78, '#d9a86a');
    const b = this.bowl;
    glowSpot(ctx, b.x, b.y, b.r * 2, 'rgba(255,255,255,0.45)');

    // ---- 蛇口 ----
    this.drawTap(ctx, S);

    // ---- 水の流れ ----
    if (this.pouring) {
      const t = this.tap;
      const sx = t.x + (t.side === 0 ? 0 : t.s * 0.9);
      const sy = t.y + t.s * 0.62;
      const ey = this.surfaceY();
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = '#8fd8f2';
      ctx.lineWidth = S * 0.028;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const segs = 12;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const x = lerp(sx, b.x, easeOut(u)) + Math.sin(u * 9 + this.t * 16) * S * 0.008 * u;
        const y = lerp(sy, ey, u * u * 0.6 + u * 0.4);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = S * 0.008;
      ctx.stroke();
      ctx.restore();
    }

    // ---- ボウル（奥） ----
    ctx.fillStyle = 'rgba(120,80,30,0.2)';
    ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.56, b.r * 1.06, b.r * 0.28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b8794170';
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - b.r * 0.36, b.r, b.r * 0.9, 0, 0, TAU);
    ctx.clip();

    // 内側
    ctx.fillStyle = '#c58a4e';
    ctx.fillRect(b.x - b.r, b.y - b.r * 1.3, b.r * 2, b.r * 2.6);
    ctx.fillStyle = '#a9713c';
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + b.r * 0.42, b.r * 0.98, b.r * 0.34, 0, 0, TAU);
    ctx.fill();

    // 水
    if (this.fill > 0.01) {
      const surf = this.surfaceY();
      ctx.fillStyle = 'rgba(120,205,235,0.55)';
      ctx.fillRect(b.x - b.r, surf, b.r * 2, b.r * 1.4);
      ctx.fillStyle = 'rgba(190,240,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(b.x, surf + Math.sin(this.t * 4) * S * 0.004, b.r * 0.99, b.r * 0.14, 0, 0, TAU);
      ctx.fill();
    }

    // 豆
    const look = blendLook(BEAN_LOOK.dry, BEAN_LOOK.soaked, this.plump);
    const r0 = S * 0.036, r1 = S * 0.052;
    for (const bn of this.beans) {
      const rise = this.plump * b.r * 0.1;
      const bx = b.x + bn.bx * b.r * 0.92;
      const by = b.y + b.r * 0.3 + bn.by * b.r * 0.55 - rise
        + Math.sin(this.t * 2.2 + bn.ph) * S * 0.004 * this.fill;
      drawBean(ctx, bx, by, lerp(r0, r1, this.plump), bn.rot + Math.sin(this.t + bn.ph) * 0.08 * this.fill, look);
    }
    ctx.restore();

    // ボウルのふち
    ctx.strokeStyle = '#e6b177';
    ctx.lineWidth = S * 0.028;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - b.r * 0.36, b.r, b.r * 0.26, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = S * 0.009;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - b.r * 0.38, b.r * 0.97, b.r * 0.24, 0, 0, TAU);
    ctx.stroke();

    this.px.draw(ctx);

    // ヒント
    if (this.fill < 1) {
      const a = this.hint * (0.5 + Math.sin(this.t * 4) * 0.3) + (this.taps === 0 ? 0.35 : 0);
      drawHandHint(ctx, this.tap.x + this.tap.s * 0.5, this.tap.y + this.tap.s * 1.15 + Math.sin(this.t * 4) * S * 0.012,
        S * 0.062, clamp(a, 0, 1), 0.15);
    }
  }

  drawTap(ctx, S) {
    const t = this.tap;
    const shake = this.hint * Math.sin(this.t * 12) * S * 0.006;
    ctx.save();
    ctx.translate(t.x + shake, t.y);
    const w = t.s;
    // パイプ
    ctx.strokeStyle = '#9fb6c4';
    ctx.lineWidth = w * 0.34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (t.side === 0) {
      ctx.moveTo(0, -w * 1.6); ctx.lineTo(0, w * 0.1);
    } else {
      ctx.moveTo(-w * 1.1, -w * 0.9); ctx.lineTo(w * 0.6, -w * 0.9); ctx.lineTo(w * 0.9, w * 0.1);
    }
    ctx.stroke();
    ctx.strokeStyle = '#cfe0ea';
    ctx.lineWidth = w * 0.14;
    ctx.stroke();
    // 出口
    const ox = t.side === 0 ? 0 : w * 0.9;
    ctx.fillStyle = '#8fa7b6';
    ctx.beginPath();
    ctx.ellipse(ox, w * 0.42, w * 0.3, w * 0.22, 0, 0, TAU);
    ctx.fill();
    // ハンドル（触る所）
    const hx = t.side === 0 ? w * 0.72 : -w * 0.55;
    const hy = t.side === 0 ? -w * 0.9 : -w * 0.9;
    const spin = this.pouring ? this.t * 5 : 0;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(spin);
    ctx.fillStyle = '#ff9b6a';
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i * TAU) / 3);
      ctx.beginPath();
      ctx.ellipse(0, -w * 0.34, w * 0.16, w * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffd2a8';
    ctx.beginPath(); ctx.arc(0, 0, w * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}

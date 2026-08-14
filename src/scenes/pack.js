// 4. パックへ入れる：ぽとぽと落ちて、きちんと並ぶ気持ちよさ
import { Scene } from '../game.js';
import { TAU, clamp, lerp, rrange, easeOut, easeIn, roundRect } from '../util.js';
import { drawRoom, drawTable, drawBean, BEAN_LOOK, drawPack, glowSpot, drawHandHint } from '../art.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

export class PackScene extends Scene {
  enter(f) {
    this.px = new Particles(f.fast ? 60 : 140);
    this.released = 0;
    this.finishT = -1;
    this.shake = 0;
    this.build(f);
    this.layout(f);
  }

  build(f) {
    const portrait = f.portrait;
    this.cols = portrait ? 6 : 8;
    this.rows = portrait ? 4 : 3;
    this.beans = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.beans.push({
          col: c, row: r,
          state: 'wait',       // wait → fly → set
          t: 0, dur: 0.55,
          sx: 0, sy: 0,
          rot: rrange(-0.5, 0.5),
          land: 0,
          ph: rrange(0, TAU),
        });
      }
    }
    // 落ちる順番をばらけさせすぎない（整列感を出すため行優先）
    this.order = this.beans.slice();
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.pk = { x: W * 0.5, y: H * 0.64, w: S * 0.74, h: S * 0.48 };
      this.hop = { x: W * 0.5, y: H * 0.25, s: S * 0.16 };
      this.lever = { x: W * 0.5 + S * 0.28, y: H * 0.29, s: S * 0.075 };
    } else {
      this.pk = { x: W * 0.54, y: H * 0.63, w: S * 1.05, h: S * 0.44 };
      this.hop = { x: W * 0.38, y: H * 0.17, s: S * 0.17 };
      this.lever = { x: W * 0.66, y: H * 0.2, s: S * 0.085 };
    }
    if (this.cols !== (f.portrait ? 6 : 8)) this.build(f);
  }

  slotPos(b) {
    const p = this.pk;
    const iw = p.w * 0.82, ih = p.h * 0.72;
    const x = p.x + ((b.col - (this.cols - 1) / 2) / this.cols) * iw * 1.02;
    const y = p.y + ((b.row - (this.rows - 1) / 2) / this.rows) * ih * 1.02;
    return { x, y };
  }

  down() {
    if (this.finishT >= 0) return;
    const batch = Math.ceil(this.beans.length / 3);
    let n = 0;
    for (const b of this.order) {
      if (b.state !== 'wait') continue;
      b.state = 'fly';
      b.t = -n * 0.055;
      b.sx = this.hop.x + rrange(-0.2, 0.2) * this.hop.s;
      b.sy = this.hop.y + this.hop.s * 0.75;
      b.dur = rrange(0.5, 0.68);
      n++;
      if (n >= batch) break;
    }
    if (n > 0) { sfx.lever(); this.shake = 1; }
  }

  update(dt, f) {
    this.shake = Math.max(0, this.shake - dt * 3);
    let allSet = true;
    for (const b of this.beans) {
      if (b.state === 'wait') { allSet = false; continue; }
      if (b.state === 'fly') {
        allSet = false;
        b.t += dt;
        if (b.t >= b.dur) {
          b.state = 'set'; b.land = 1;
          sfx.drop((b.col + b.row * 3) | 0);
          const s = this.slotPos(b);
          this.px.sparkle(s.x, s.y, { n: 1, size: f.S * 0.018, life: 0.5 });
        }
      } else {
        b.land = Math.max(0, b.land - dt * 3.2);
      }
    }
    if (allSet && this.finishT < 0) {
      this.finishT = 0;
      sfx.ding();
      const p = this.pk;
      for (let i = 0; i < 12; i++) {
        this.px.sparkle(p.x + rrange(-0.5, 0.5) * p.w, p.y + rrange(-0.4, 0.4) * p.h, { size: f.S * 0.026 });
      }
    }
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 1.2) this.next('ferment');
    }
    this.px.update(dt);
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#fdf0d5', bottom: '#f4cf9b' });
    drawTable(ctx, W, H, H * 0.86, '#cf9a5c');
    const p = this.pk;
    glowSpot(ctx, p.x, p.y, p.w * 0.85, 'rgba(255,255,255,0.5)');

    // ---- ホッパー ----
    this.drawHopper(ctx, S);

    // ---- パック ----
    const slide = this.finishT >= 0 ? easeOut(clamp(this.finishT / 1.2, 0, 1)) * 0 : 0;
    ctx.save();
    ctx.translate(slide, 0);
    drawPack(ctx, p.x, p.y, p.w, p.h);

    // 仕切りのくぼみ（整列感を強調）
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#c9d6de';
    ctx.lineWidth = Math.max(1, S * 0.004);
    for (const b of this.beans) {
      const s = this.slotPos(b);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + S * 0.006, S * 0.032, S * 0.022, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 収まった豆
    for (const b of this.beans) {
      if (b.state !== 'set') continue;
      const s = this.slotPos(b);
      const sq = 1 + b.land * 0.28;
      drawBean(ctx, s.x, s.y + b.land * S * 0.004, S * 0.043, b.rot, BEAN_LOOK.steamed, { squash: sq });
    }
    ctx.restore();

    // 落下中の豆
    for (const b of this.beans) {
      if (b.state !== 'fly' || b.t < 0) continue;
      const u = clamp(b.t / b.dur, 0, 1);
      const s = this.slotPos(b);
      const x = lerp(b.sx, s.x, easeOut(u));
      const y = lerp(b.sy, s.y, easeIn(u) * 0.85 + u * 0.15);
      drawBean(ctx, x, y, S * 0.043, b.rot + u * 5, BEAN_LOOK.steamed);
    }

    this.px.draw(ctx);
    this.drawLever(ctx, S);

    if (this.finishT < 0) {
      const a = clamp(this.hint * 0.9 + (this.beans.some(b => b.state !== 'wait') ? 0.15 : 0.45), 0, 1);
      drawHandHint(ctx, this.lever.x + this.lever.s * 0.7,
        this.lever.y + this.lever.s * 1.5 + Math.sin(this.t * 4) * S * 0.012, S * 0.06, a, 0.15);
    }
  }

  drawHopper(ctx, S) {
    const h = this.hop;
    const sh = this.shake * Math.sin(this.t * 40) * S * 0.005;
    ctx.save();
    ctx.translate(h.x + sh, h.y);
    // ろうと
    const g = ctx.createLinearGradient(-h.s, 0, h.s, 0);
    g.addColorStop(0, '#8fa7b6');
    g.addColorStop(0.45, '#dceaf2');
    g.addColorStop(1, '#8fa7b6');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-h.s * 1.5, -h.s * 0.9);
    ctx.lineTo(h.s * 1.5, -h.s * 0.9);
    ctx.lineTo(h.s * 0.32, h.s * 0.7);
    ctx.lineTo(-h.s * 0.32, h.s * 0.7);
    ctx.closePath();
    ctx.fill();
    // 中の豆（残量）
    const left = this.beans.filter(b => b.state === 'wait').length / this.beans.length;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-h.s * 1.42, -h.s * 0.82);
    ctx.lineTo(h.s * 1.42, -h.s * 0.82);
    ctx.lineTo(h.s * 0.3, h.s * 0.62);
    ctx.lineTo(-h.s * 0.3, h.s * 0.62);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#4a626e';
    ctx.fillRect(-h.s * 1.5, -h.s * 0.9, h.s * 3, h.s * 1.6);
    // 減ったぶんだけ豆の山が下がる（ろうとの形でクリップされる）
    const top = lerp(-h.s * 0.6, h.s * 0.55, 1 - left);
    for (let i = 0; i < 12; i++) {
      const col = i % 4, row = (i / 4) | 0;
      const x = (col - 1.5) * h.s * 0.62 + (row % 2) * h.s * 0.3;
      drawBean(ctx, x, top + row * h.s * 0.42, S * 0.038, i * 0.7, BEAN_LOOK.steamed);
    }
    ctx.restore();
    // ふち
    ctx.strokeStyle = '#b9d3df';
    ctx.lineWidth = S * 0.016;
    ctx.beginPath();
    ctx.moveTo(-h.s * 1.55, -h.s * 0.9);
    ctx.lineTo(h.s * 1.55, -h.s * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  drawLever(ctx, S) {
    const l = this.lever;
    const press = this.shake;
    ctx.save();
    ctx.translate(l.x, l.y + press * S * 0.01);
    ctx.fillStyle = '#b98352';
    roundRect(ctx, -l.s * 0.75, l.s * 0.5, l.s * 1.5, l.s * 0.6, l.s * 0.2);
    ctx.fill();
    ctx.strokeStyle = '#7f8f99';
    ctx.lineWidth = l.s * 0.34;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, l.s * 0.5); ctx.lineTo(0, -l.s * 0.6); ctx.stroke();
    const wob = this.hint * Math.sin(this.t * 13) * l.s * 0.12;
    ctx.fillStyle = '#ff7f5c';
    ctx.beginPath(); ctx.arc(wob, -l.s * 0.85, l.s * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(wob - l.s * 0.18, -l.s * 1.0, l.s * 0.18, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// タイトル：完成品名もパッケージも見せない。乾いた豆と「さわってね」だけ。
import { Scene } from '../game.js';
import { TAU, rrange } from '../util.js';
import { drawRoom, drawTable, glowSpot, drawHandHint, drawRoundButton } from '../art.js';
import { drawBeanAuto, BEAN_ATLAS } from '../natto.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

export class TitleScene extends Scene {
  enter(f) {
    this.px = new Particles(60);
    this.beans = [];
    // 器の底いっぱいに散らす（4x4 のグリッドを少し崩す）
    for (let i = 0; i < 14; i++) {
      const col = i % 5, row = (i / 5) | 0;
      this.beans.push({
        v: (i * 5) % BEAN_ATLAS.variants,
        ax: (col - 2) * 0.42 + (row % 2) * 0.2 + rrange(-0.06, 0.06),
        ay: (row - 1) * 0.55 + rrange(-0.1, 0.1),
        rot: rrange(0, TAU), ph: rrange(0, TAU),
      });
    }
    this.layout(f);
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    this.bowl = {
      x: W / 2,
      y: portrait ? H * 0.42 : H * 0.42,
      r: S * (portrait ? 0.36 : 0.3),
    };
    this.btn = {
      x: W / 2,
      y: portrait ? H * 0.74 : H * 0.8,
      r: S * (portrait ? 0.11 : 0.12),
    };
    this.tableY = this.bowl.y + this.bowl.r * 0.55;
  }

  update(dt, f) {
    if (this.t % 0.5 < dt) {
      this.px.sparkle(this.bowl.x + rrange(-1, 1) * this.bowl.r, this.bowl.y - this.bowl.r * 0.5,
        { n: 1, size: f.S * 0.02, life: 1.1 });
    }
    this.px.update(dt);
  }

  down() {
    sfx.pop(1.2);
    this.next('soak');
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#ffeecb', bottom: '#f7d9a6' });
    drawTable(ctx, W, H, this.tableY);
    glowSpot(ctx, this.bowl.x, this.bowl.y, this.bowl.r * 2.2, 'rgba(255,255,255,0.5)');

    const bob = Math.sin(this.t * 1.6) * S * 0.008;
    const b = this.bowl;
    ctx.save();
    ctx.translate(b.x, b.y + bob);

    // 木のボウル
    ctx.fillStyle = 'rgba(120,80,30,0.2)';
    ctx.beginPath(); ctx.ellipse(0, b.r * 0.52, b.r * 1.05, b.r * 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c58a4e';
    ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.62, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#e6b177';
    ctx.beginPath(); ctx.ellipse(0, 0, b.r, b.r * 0.36, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a9713c';
    ctx.beginPath(); ctx.ellipse(0, b.r * 0.03, b.r * 0.9, b.r * 0.3, 0, 0, TAU); ctx.fill();

    // 乾いた豆
    for (const bn of this.beans) {
      const yy = bn.ay * 0.45;
      const y = yy * b.r + Math.sin(this.t * 2 + bn.ph) * S * 0.002;
      // 上下の列ほど内側に寄せる（器の丸みに沿わせる）
      drawBeanAuto(ctx, 'dry', bn.v, bn.ax * b.r * 0.7 * (1 - Math.abs(yy) * 0.6), y, S * 0.042);
    }
    ctx.restore();

    this.px.draw(ctx);

    // さわってねボタン（△）
    const pulse = 1 + Math.sin(this.t * 3) * 0.06;
    drawRoundButton(ctx, this.btn.x, this.btn.y, this.btn.r * pulse, (c, r) => {
      c.fillStyle = '#fffaf0';
      c.beginPath();
      c.moveTo(-r * 0.28, -r * 0.42);
      c.lineTo(r * 0.46, 0);
      c.lineTo(-r * 0.28, r * 0.42);
      c.closePath();
      c.fill();
    });
    const ha = 0.55 + Math.sin(this.t * 3) * 0.25;
    drawHandHint(ctx, this.btn.x + this.btn.r * 0.75, this.btn.y + this.btn.r * 1.0 + Math.sin(this.t * 3) * S * 0.012, S * 0.06, ha, 0.15);
  }
}

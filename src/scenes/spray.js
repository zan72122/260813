// 3. しゅっ：何かをかけると、豆がきらっとする（説明はしない）
import { Scene } from '../game.js';
import { TAU, clamp, rrange, roundRect } from '../util.js';
import { drawRoom, drawTable, drawBean, BEAN_LOOK, blendLook, glowSpot, drawHandHint } from '../art.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

const NEED = 3;

export class SprayScene extends Scene {
  enter(f) {
    this.px = new Particles(f.fast ? 90 : 200);
    this.dust = 0;
    this.sprays = 0;
    this.cool = 0;
    this.squeeze = 0;
    this.finishT = -1;
    this.beans = [];
    const cols = 6, rows = 3;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.beans.push({
          bx: (c - (cols - 1) / 2) / ((cols - 1) / 2),
          by: (r - (rows - 1) / 2) / ((rows - 1) / 2),
          rot: rrange(-0.7, 0.7), ph: rrange(0, TAU),
        });
      }
    }
    this.layout(f);
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.tray = { x: W * 0.52, y: H * 0.62, w: S * 0.82, h: S * 0.34 };
      this.bottle = { x: W * 0.25, y: H * 0.33, s: S * 0.15 };
    } else {
      this.tray = { x: W * 0.6, y: H * 0.64, w: S * 1.0, h: S * 0.34 };
      this.bottle = { x: W * 0.22, y: H * 0.32, s: S * 0.16 };
    }
    this.tableY = this.tray.y + this.tray.h * 0.42;
    // ノズルはいつもバットの中心を向く。ボトル本体は立てたまま少しだけ傾ける。
    const b = this.bottle;
    b.dir = Math.atan2(this.tray.y - b.y, this.tray.x - b.x);
    b.tilt = clamp(b.dir - 1.0, -0.35, 0.35);
  }

  down() { this.fire(); }

  fire() {
    if (this.finishT >= 0 || this.cool > 0) return;
    this.cool = 0.42;
    this.squeeze = 1;
    this.sprays++;
    this.dust = clamp(this.sprays / NEED, 0, 1);
    sfx.spray();
    const b = this.bottle;
    // ノズル先端のワールド座標（本体を tilt、口をさらに dir-tilt だけ回して描いている）
    const na = b.dir - b.tilt;
    const px = Math.cos(na) * b.s * 1.0;
    const py = Math.sin(na) * b.s * 1.0 - b.s * 1.5 * 0.34;
    const nx = b.x + px * Math.cos(b.tilt) - py * Math.sin(b.tilt);
    const ny = b.y + px * Math.sin(b.tilt) + py * Math.cos(b.tilt);
    const S = this.game.S;
    this.px.mist(nx, ny, b.dir, { n: 26, cone: 0.34, speed: S * 1.15, scale: S * 0.0022 });
    // ふりかかった粒がきらっと着地する
    for (let i = 0; i < 12; i++) {
      const t = this.tray;
      this.px.sparkle(t.x + rrange(-0.45, 0.45) * t.w, t.y + rrange(-0.25, 0.25) * t.h, {
        n: 1, size: S * 0.024, life: 0.9, rise: S * 0.02, gravity: 30,
      });
    }
  }

  update(dt, f) {
    this.cool = Math.max(0, this.cool - dt);
    this.squeeze = Math.max(0, this.squeeze - dt * 3.2);
    // 押しっぱなしでも「しゅっしゅっ」と続く
    if (this.game.pointer.down && this.cool <= 0 && this.finishT < 0) this.fire();

    if (this.sprays >= NEED && this.finishT < 0) {
      this.finishT = 0;
      sfx.ding();
      const t = this.tray;
      for (let i = 0; i < 14; i++) {
        this.px.sparkle(t.x + rrange(-0.5, 0.5) * t.w, t.y + rrange(-0.3, 0.3) * t.h, { size: f.S * 0.03 });
      }
    }
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 1.2) this.next('pack');
    }
    this.px.update(dt);
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#eaf6ff', bottom: '#ffe3b6' });
    drawTable(ctx, W, H, this.tableY, '#cf9a5c');
    const t = this.tray;
    glowSpot(ctx, t.x, t.y, t.w * 0.95, 'rgba(255,255,255,0.5)');

    // ---- バット（トレー） ----
    ctx.fillStyle = 'rgba(110,70,25,0.2)';
    roundRect(ctx, t.x - t.w / 2 + S * 0.01, t.y - t.h / 2 + S * 0.022, t.w, t.h, t.h * 0.28);
    ctx.fill();
    const g = ctx.createLinearGradient(0, t.y - t.h / 2, 0, t.y + t.h / 2);
    g.addColorStop(0, '#eef4f8');
    g.addColorStop(1, '#c9d6de');
    ctx.fillStyle = g;
    roundRect(ctx, t.x - t.w / 2, t.y - t.h / 2, t.w, t.h, t.h * 0.28);
    ctx.fill();
    ctx.fillStyle = '#dde7ee';
    roundRect(ctx, t.x - t.w * 0.45, t.y - t.h * 0.4, t.w * 0.9, t.h * 0.8, t.h * 0.22);
    ctx.fill();

    // ---- 豆 ----
    const look = blendLook(BEAN_LOOK.steamed, BEAN_LOOK.steamed, 0);
    for (const b of this.beans) {
      const x = t.x + b.bx * t.w * 0.39;
      const y = t.y + b.by * t.h * 0.26 + Math.sin(this.t * 2 + b.ph) * S * 0.002;
      drawBean(ctx, x, y, S * 0.046, b.rot, look);
      // 菌の粒（きらっ）
      if (this.dust > 0.01) {
        const k = clamp(this.dust, 0, 1);
        ctx.globalAlpha = k * (0.55 + Math.sin(this.t * 5 + b.ph * 3) * 0.45);
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 2; i++) {
          const a = b.ph + i * 2.3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * S * 0.02, y + Math.sin(a) * S * 0.012, S * 0.0055, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // うっすら湯気（まだあたたかい）
    if (Math.random() < 0.25) {
      this.px.steam(t.x + rrange(-0.4, 0.4) * t.w, t.y - t.h * 0.3,
        { n: 1, size: S * 0.035, grow: S * 0.04, life: 1.4, alpha: 0.28 });
    }

    this.px.draw(ctx);
    this.drawBottle(ctx, S);

    if (this.finishT < 0) {
      const b = this.bottle;
      const a = clamp(this.hint * 0.9 + (this.sprays === 0 ? 0.45 : 0.12), 0, 1);
      drawHandHint(ctx, b.x - b.s * 0.75, b.y - b.s * 0.1 + Math.sin(this.t * 4) * S * 0.012, S * 0.06, a, -0.35);
    }
  }

  drawBottle(ctx, S) {
    const b = this.bottle;
    const wob = this.hint * Math.sin(this.t * 12) * S * 0.005;
    const sq = this.squeeze;
    ctx.save();
    ctx.translate(b.x + wob, b.y - sq * S * 0.004);
    ctx.rotate(b.tilt);

    // ボトル
    const w = b.s * 1.05, h = b.s * 1.5;
    ctx.fillStyle = 'rgba(110,70,25,0.18)';
    roundRect(ctx, -w / 2 + S * 0.006, -h * 0.1 + S * 0.012, w, h, w * 0.3);
    ctx.fill();
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#9fd9c9');
    g.addColorStop(0.45, '#e4fbf4');
    g.addColorStop(1, '#79c4b1');
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h * 0.1, w, h, w * 0.3);
    ctx.fill();
    // 中身の残量
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    roundRect(ctx, -w * 0.32, h * 0.35, w * 0.64, h * 0.45 * (1 - this.dust * 0.45), w * 0.2);
    ctx.fill();

    // 首とノズル
    ctx.fillStyle = '#f0f7f5';
    roundRect(ctx, -w * 0.22, -h * 0.3, w * 0.44, h * 0.25, w * 0.1);
    ctx.fill();
    ctx.save();
    ctx.translate(0, -h * 0.34);
    ctx.rotate(b.dir - b.tilt);           // 口だけバットを向ける
    ctx.fillStyle = '#ff9b6a';
    roundRect(ctx, -b.s * 0.1, -b.s * 0.26, b.s * 1.0, b.s * 0.5, b.s * 0.2);
    ctx.fill();
    ctx.fillStyle = '#ffd2a8';
    roundRect(ctx, b.s * 0.55, -b.s * 0.16, b.s * 0.42, b.s * 0.32, b.s * 0.14);
    ctx.fill();
    ctx.restore();

    // レバー（押すとへこむ）
    ctx.fillStyle = '#ff7f5c';
    ctx.save();
    ctx.translate(-w * 0.3, -h * 0.2 + sq * S * 0.012);
    roundRect(ctx, -w * 0.3, -b.s * 0.12, w * 0.55, b.s * 0.26, b.s * 0.12);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}

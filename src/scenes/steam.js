// 2. むす：豆を釜に入れて、レバーを下ろすと もくもく
import { Scene } from '../game.js';
import { TAU, clamp, lerp, rrange, easeOut, easeOutBack, roundRect } from '../util.js';
import { drawRoom, drawTable, glowSpot, drawHandHint } from '../art.js';
import { drawBeanBlend, drawBeanAuto, BEAN_ATLAS } from '../natto.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

export class SteamScene extends Scene {
  enter(f) {
    this.px = new Particles(f.fast ? 90 : 200);
    this.phase = 'pour';
    this.pt = 0;
    this.lid = 0;          // 0=開 1=閉
    this.gauge = 0;
    this.boost = 0;
    this.taps = 0;
    this.cook = 0;         // 豆の蒸され具合
    this.beans = [];
    for (let i = 0; i < 18; i++) {
      this.beans.push({
        v: (i * 5) % BEAN_ATLAS.variants,
        bx: rrange(-0.78, 0.78), by: rrange(-0.3, 0.3),
        rot: rrange(0, TAU), ph: rrange(0, TAU),
        dropDelay: i * 0.045,
      });
    }
    this.layout(f);
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.pot = { x: W * 0.5, y: H * 0.55, r: S * 0.31 };
      this.lever = { x: W * 0.83, y: H * 0.72, s: S * 0.1 };
    } else {
      this.pot = { x: W * 0.42, y: H * 0.56, r: S * 0.33 };
      this.lever = { x: W * 0.78, y: H * 0.55, s: S * 0.13 };
    }
    this.tableY = this.pot.y + this.pot.r * 1.06;
  }

  down(p, f) {
    if (this.phase === 'pour') { this.queued = true; return; }  // 豆が落ちている間に触っても取りこぼさない
    if (this.phase === 'idle') {
      const d = Math.hypot(p.x - this.lever.x, p.y - this.lever.y);
      const onPot = Math.hypot(p.x - this.pot.x, p.y - this.pot.y) < this.pot.r * 1.4;
      if (d < this.lever.s * 2.6 || onPot || true) {   // どこを触っても進む（幼児補正）
        this.phase = 'steam';
        this.pt = 0;
        sfx.lever();
        sfx.steamOn();
      }
    } else if (this.phase === 'steam') {
      // 連打すると蒸気が増える手応え
      this.boost = Math.min(1.6, this.boost + 0.5);
      this.taps++;
      sfx.steamPuff();
      this.px.steam(this.pot.x + rrange(-0.4, 0.4) * this.pot.r, this.pot.y - this.pot.r * 0.7, {
        n: f.fast ? 3 : 6, size: f.S * 0.05, grow: f.S * 0.07, life: 1.5, spread: f.S * 0.03,
      });
    }
  }

  update(dt, f) {
    const S = f.S;
    this.pt += dt;
    this.boost = Math.max(0, this.boost - dt * 0.6);

    if (this.phase === 'pour') {
      if (this.pt > 1.15) {
        this.phase = 'idle'; this.pt = 0;
        if (this.queued) { this.queued = false; this.down({ x: this.lever.x, y: this.lever.y }, f); }
      }
      if (this.pt < 0.9 && Math.random() < 0.35) sfx.drop((Math.random() * 7) | 0);
    } else if (this.phase === 'steam') {
      this.lid = clamp(this.lid + dt * 3.5, 0, 1);
      const rate = 0.26 + this.boost * 0.22;
      this.gauge = clamp(this.gauge + dt * rate, 0, 1);
      this.cook = this.gauge;
      const n = (f.fast ? 1 : 2) + (this.boost > 0.2 ? 2 : 0);
      const p = this.pot;
      this.px.steam(p.x + rrange(-0.5, 0.5) * p.r, p.y - p.r * 0.62, {
        n, size: S * 0.045 * (1 + this.boost * 0.3), grow: S * 0.06,
        life: 1.7, spread: S * 0.05, rise: S * 0.18,
      });
      if (this.gauge >= 1) {
        this.phase = 'open'; this.pt = 0;
        sfx.steamOff(); sfx.ding();
        this.px.steam(p.x, p.y - p.r * 0.6, { n: f.fast ? 10 : 26, size: S * 0.07, grow: S * 0.1, life: 2.2, spread: S * 0.16, rise: S * 0.3 });
        for (let i = 0; i < 8; i++) this.px.sparkle(p.x + rrange(-1, 1) * p.r, p.y - p.r * 0.5, { size: S * 0.03 });
      }
    } else if (this.phase === 'open') {
      this.lid = clamp(this.lid - dt * 2.2, 0, 1);
      if (this.pt > 1.5) this.next('spray');
      if (Math.random() < 0.5) {
        this.px.steam(this.pot.x + rrange(-0.6, 0.6) * this.pot.r, this.pot.y - this.pot.r * 0.3,
          { n: 1, size: S * 0.04, grow: S * 0.05, life: 1.6 });
      }
    }
    this.px.update(dt);
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#ffe9c9', bottom: '#f3c98f' });
    drawTable(ctx, W, H, this.tableY, '#cf9a5c');
    const p = this.pot;
    glowSpot(ctx, p.x, p.y, p.r * 2.1, 'rgba(255,240,200,0.55)');

    // ---- コンロと火（釜の横からのぞく） ----
    const fire = this.phase === 'steam' ? 1 : this.phase === 'open' ? 0.45 : 0;
    ctx.fillStyle = '#8a6a52';
    roundRect(ctx, p.x - p.r * 1.15, p.y + p.r * 0.78, p.r * 2.3, p.r * 0.3, p.r * 0.1);
    ctx.fill();
    if (fire > 0) {
      glowSpot(ctx, p.x, p.y + p.r * 0.7, p.r * 1.4, `rgba(255,170,60,${0.35 * fire})`);
      for (let i = -5; i <= 5; i++) {
        if (Math.abs(i) < 3) continue;                    // 釜に隠れる分は描かない
        const fx = p.x + i * p.r * 0.21;
        const h = (0.55 + Math.abs(Math.sin(this.t * 9 + i)) * 0.65) * p.r * 0.42 * fire * (1 + this.boost * 0.3);
        ctx.fillStyle = i % 2 ? 'rgba(255,150,60,0.9)' : 'rgba(255,205,90,0.95)';
        ctx.beginPath();
        ctx.moveTo(fx - p.r * 0.1, p.y + p.r * 0.8);
        ctx.quadraticCurveTo(fx, p.y + p.r * 0.8 - h * 1.7, fx + p.r * 0.1, p.y + p.r * 0.8);
        ctx.fill();
      }
    }

    // ---- 釜の本体 ----
    ctx.fillStyle = 'rgba(110,70,25,0.22)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + p.r * 0.78, p.r * 1.1, p.r * 0.22, 0, 0, TAU); ctx.fill();

    const rattle = this.phase === 'steam' ? Math.sin(this.t * 26) * S * 0.004 * (0.6 + this.boost) : 0;
    ctx.save();
    ctx.translate(rattle, 0);

    // 胴
    const g = ctx.createLinearGradient(p.x - p.r, 0, p.x + p.r, 0);
    g.addColorStop(0, '#5f7c8c');
    g.addColorStop(0.35, '#9fbecd');
    g.addColorStop(0.6, '#cfe3ec');
    g.addColorStop(1, '#69889a');
    ctx.fillStyle = g;
    roundRect(ctx, p.x - p.r, p.y - p.r * 0.45, p.r * 2, p.r * 1.15, p.r * 0.3);
    ctx.fill();

    // 中身（豆）— ふたが開いている時だけ見える
    const openness = 1 - this.lid;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - p.r * 0.42, p.r * 0.9, p.r * 0.28, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#3d5764';
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    const br = lerp(S * 0.05, S * 0.056, this.cook);
    for (let i = 0; i < this.beans.length; i++) {
      const b = this.beans[i];
      let by = p.y - p.r * 0.42 + b.by * p.r * 0.34;
      let bx = p.x + b.bx * p.r * 0.8;
      if (this.phase === 'pour') {
        const u = clamp((this.pt - b.dropDelay) / 0.5, 0, 1);
        if (u <= 0) continue;
        by = lerp(p.y - p.r * 2.2, by, easeOutBack(u) * 0.98 + u * 0.02);
      }
      by += Math.sin(this.t * 6 + b.ph) * S * 0.003 * (this.phase === 'steam' ? 1 : 0.2);
      drawBeanBlend(ctx, 'soaked', 'steamed', this.cook, b.v, bx, by, br);
    }
    ctx.restore();

    // 落下中の豆（ふちより上）
    if (this.phase === 'pour') {
      for (const b of this.beans) {
        const u = clamp((this.pt - b.dropDelay) / 0.5, 0, 1);
        if (u <= 0 || u >= 1) continue;
        const by = lerp(p.y - p.r * 2.2, p.y - p.r * 0.42 + b.by * p.r * 0.34, easeOut(u));
        if (by < p.y - p.r * 0.6) {
          drawBeanAuto(ctx, 'soaked', b.v, p.x + b.bx * p.r * 0.8, by, S * 0.05);
        }
      }
    }

    // ふち
    ctx.strokeStyle = '#b9d3df';
    ctx.lineWidth = S * 0.022;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - p.r * 0.44, p.r * 0.92, p.r * 0.29, 0, 0, TAU);
    ctx.stroke();

    // ふた
    const lidY = p.y - p.r * (0.48 + openness * 0.55);
    const lidTilt = openness * 0.22;
    ctx.save();
    ctx.translate(p.x, lidY);
    ctx.rotate(-lidTilt);
    const lg = ctx.createLinearGradient(-p.r, 0, p.r, 0);
    lg.addColorStop(0, '#78929f');
    lg.addColorStop(0.4, '#d8ebf3');
    lg.addColorStop(1, '#7d97a4');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.r * 1.0, p.r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff9b6a';
    ctx.beginPath(); ctx.arc(0, -p.r * 0.16, p.r * 0.12, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-p.r * 0.3, -p.r * 0.06, p.r * 0.26, p.r * 0.07, -0.15, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();

    this.px.draw(ctx);

    // ---- 蒸気ゲージ（湯気の玉が増えていく） ----
    if (this.phase === 'steam' || this.phase === 'open') {
      // 上に余白がない画面（横向き）では、ゲージを画面内に押し込む
      const gy = Math.max(S * 0.14, p.y - p.r * 1.55);
      this.drawGauge(ctx, p.x, gy, p.r * 0.95, this.gauge, S);
    }

    // ---- レバー ----
    this.drawLever(ctx, S);

    if (this.phase === 'idle') {
      const a = clamp(this.hint * 0.9 + 0.4, 0, 1);
      drawHandHint(ctx, this.lever.x + this.lever.s * 0.5,
        this.lever.y + this.lever.s * 1.2 + Math.sin(this.t * 4) * S * 0.012, S * 0.062, a, 0.15);
    }
  }

  drawGauge(ctx, x, y, r, p, S) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const on = p >= (i + 0.5) / n;
      const cx = x + (u - 0.5) * r * 2;
      const cy = y - Math.sin(u * Math.PI) * r * 0.22;
      ctx.globalAlpha = on ? 0.95 : 0.3;
      ctx.fillStyle = on ? '#ffffff' : '#e7d4b4';
      const s = S * (on ? 0.028 : 0.02) * (on ? 1 + Math.sin(this.t * 6 + i) * 0.08 : 1);
      ctx.beginPath();
      ctx.arc(cx - s * 0.5, cy, s * 0.7, 0, TAU);
      ctx.arc(cx + s * 0.4, cy - s * 0.2, s * 0.85, 0, TAU);
      ctx.arc(cx + s * 0.1, cy + s * 0.35, s * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawLever(ctx, S) {
    const l = this.lever;
    const ang = lerp(-0.85, 0.55, clamp(this.lid, 0, 1));
    const shake = this.phase === 'idle' ? this.hint * Math.sin(this.t * 13) * 0.09 : 0;
    ctx.save();
    ctx.translate(l.x, l.y);
    // 台座
    ctx.fillStyle = '#b98352';
    roundRect(ctx, -l.s * 0.62, -l.s * 0.1, l.s * 1.24, l.s * 1.15, l.s * 0.25);
    ctx.fill();
    ctx.fillStyle = '#8c5f38';
    roundRect(ctx, -l.s * 0.62, l.s * 0.72, l.s * 1.24, l.s * 0.35, l.s * 0.16);
    ctx.fill();
    // 棒
    ctx.rotate(ang + shake);
    ctx.strokeStyle = '#7f8f99';
    ctx.lineWidth = l.s * 0.28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(0, -l.s * 1.35);
    ctx.stroke();
    ctx.fillStyle = '#ff7f5c';
    ctx.beginPath(); ctx.arc(0, -l.s * 1.45, l.s * 0.44, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(-l.s * 0.14, -l.s * 1.58, l.s * 0.15, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

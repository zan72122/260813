// 5. 発酵室：あったかダイヤルをぐるぐる回すと、時間が進む
// 「待つ」ではなく「回すと進む」＝子どもの操作で時間が動く。
import { Scene } from '../game.js';
import { TAU, clamp, lerp, rrange, easeOut, angleDelta, roundRect, mixHex } from '../util.js';
import { drawRoom, drawTable, drawPack, glowSpot, drawHandHint } from '../art.js';
import { drawBeanAuto, BEAN_ATLAS } from '../natto.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

export class FermentScene extends Scene {
  enter(f) {
    this.px = new Particles(f.fast ? 90 : 200);
    this.phase = 'in';       // in → turn → out
    this.pt = 0;
    this.prog = 0;
    this.spin = 0;           // ダイヤルの見た目の角度
    this.spinVel = 0;
    this.lastAng = null;
    this.turned = 0;
    this.clock = 0;
    this.tickAcc = 0;
    this.layout(f);
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.box = { x: W * 0.5, y: H * 0.38, w: S * 0.82, h: S * 0.62 };
      this.dial = { x: W * 0.5, y: H * 0.78, r: S * 0.16 };
    } else {
      this.box = { x: W * 0.33, y: H * 0.5, w: S * 1.02, h: S * 0.76 };
      this.dial = { x: W * 0.76, y: H * 0.53, r: S * 0.2 };
    }
  }

  down(p) {
    if (this.phase !== 'turn') return;
    this.lastAng = Math.atan2(p.y - this.dial.y, p.x - this.dial.x);
    // タップだけでも少し進む（回せない子への補正）
    this.addProgress(0.05);
    this.spinVel += 3.5;
    sfx.dial(this.prog);
  }

  move(p, f) {
    if (this.phase !== 'turn') return;
    const a = Math.atan2(p.y - this.dial.y, p.x - this.dial.x);
    let d = 0;
    if (this.lastAng !== null) d = angleDelta(this.lastAng, a);
    this.lastAng = a;
    const r = Math.hypot(p.x - this.dial.x, p.y - this.dial.y);
    // ダイヤルから離れていても、動かした量そのものを少し拾う（操作ズレ補正）
    const byAngle = Math.min(Math.abs(d), 0.4) * (r > this.dial.r * 0.25 ? 1 : 0.3);
    const byMove = Math.hypot(p.dx, p.dy) / (f.S * 9);
    this.addProgress(byAngle / (TAU * 2.2) + byMove * 0.35);
    this.spin += d;
    this.spinVel = lerp(this.spinVel, d * 20, 0.4);
  }

  up() { this.lastAng = null; }

  addProgress(v) {
    if (v <= 0) return;
    const before = this.prog;
    this.prog = clamp(this.prog + v, 0, 1);
    this.turned += v;
    this.clock += v * TAU * 6;
    this.tickAcc += v;
    if (this.tickAcc > 0.055) {
      this.tickAcc = 0;
      sfx.dial(this.prog);
      const b = this.box;
      this.px.sparkle(b.x + rrange(-0.4, 0.4) * b.w, b.y + rrange(-0.3, 0.3) * b.h,
        { n: 1, size: this.game.S * 0.026, life: 0.8, rise: this.game.S * 0.12, gravity: -10 });
    }
    if (before < 0.34 && this.prog >= 0.34) sfx.warm();
    if (before < 0.7 && this.prog >= 0.7) sfx.warm();
  }

  update(dt, f) {
    this.pt += dt;
    this.spinVel *= Math.exp(-4 * dt);
    this.spin += this.spinVel * dt;

    if (this.phase === 'in') {
      if (this.pt > 1.1) { this.phase = 'turn'; this.pt = 0; sfx.open(); }
    } else if (this.phase === 'turn') {
      if (this.prog > 0.02) {
        // あたたかい空気のゆらぎ
        if (Math.random() < 0.3 + this.prog * 0.5) {
          const b = this.box;
          this.px.steam(b.x + rrange(-0.35, 0.35) * b.w, b.y - b.h * 0.42, {
            n: 1, size: f.S * 0.03, grow: f.S * 0.035, life: 1.4, alpha: 0.22 + this.prog * 0.2,
          });
        }
      }
      if (this.prog >= 1) {
        this.phase = 'out'; this.pt = 0;
        sfx.ding(); sfx.yay();
        const b = this.box;
        for (let i = 0; i < 18; i++) {
          this.px.sparkle(b.x + rrange(-0.5, 0.5) * b.w, b.y + rrange(-0.4, 0.4) * b.h, { size: f.S * 0.032 });
        }
      }
    } else if (this.phase === 'out') {
      if (this.pt > 1.7) this.next('finale');
    }
    this.px.update(dt);
  }

  /** 空の色：昼→夕→夜→朝 を prog に沿って 2 周させる */
  skyColor() {
    const u = (this.prog * 2) % 1;
    const stops = [
      [0.0, '#9fd8f5'], [0.3, '#ffd08a'], [0.5, '#f28a6a'],
      [0.68, '#2c3a72'], [0.86, '#4a5da8'], [1.0, '#9fd8f5'],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      if (u >= a && u <= b) return mixHex(ca, cb, (u - a) / (b - a));
    }
    return '#9fd8f5';
  }
  isNight() {
    const u = (this.prog * 2) % 1;
    return u > 0.55 && u < 0.88;
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    const warm = this.prog;
    drawRoom(ctx, W, H, {
      top: mixHex('#f3e6ff', '#ffd9a8', warm),
      bottom: mixHex('#e7d6c0', '#f0a95f', warm),
    });
    drawTable(ctx, W, H, H * 0.9, '#c78f52');

    const b = this.box;
    glowSpot(ctx, b.x, b.y, b.w * (0.7 + warm * 0.5), `rgba(255,${Math.round(200 - warm * 40)},120,${0.15 + warm * 0.4})`);

    // ---- 発酵室（あたたかい箱） ----
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(110,70,25,0.22)';
    roundRect(ctx, -b.w / 2 + S * 0.012, -b.h / 2 + S * 0.02, b.w, b.h, b.w * 0.09);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
    g.addColorStop(0, mixHex('#f7e2c6', '#ffcf94', warm));
    g.addColorStop(1, mixHex('#dcc0a0', '#e79a53', warm));
    ctx.fillStyle = g;
    roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, b.w * 0.09);
    ctx.fill();
    // 中の光
    ctx.fillStyle = `rgba(255,${Math.round(210 - warm * 60)},140,${0.25 + warm * 0.45})`;
    roundRect(ctx, -b.w * 0.42, -b.h * 0.16, b.w * 0.84, b.h * 0.44, b.w * 0.06);
    ctx.fill();

    // 中のパック
    const inU = clamp(this.pt / 1.1, 0, 1);
    const outU = this.phase === 'out' ? clamp(this.pt / 1.2, 0, 1) : 0;
    let py = 0;
    if (this.phase === 'in') py = lerp(-b.h * 1.4, b.h * 0.06, easeOut(inU));
    else if (this.phase === 'out') py = lerp(b.h * 0.06, -b.h * 0.3, easeOut(outU));
    else py = b.h * 0.06;
    const pw = b.w * 0.58, ph = b.h * 0.26;
    ctx.save();
    ctx.translate(0, py);
    ctx.scale(1 + outU * 0.12, 1 + outU * 0.12);
    drawPack(ctx, 0, 0, pw, ph);
    // 中身はうっすらしか見えない（正体はまだ伏せる）
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 10; i++) {
      const x = ((i % 5) - 2) * pw * 0.17;
      const y = (((i / 5) | 0) - 0.5) * ph * 0.3;
      drawBeanAuto(ctx, warm > 0.5 ? 'fermented' : 'steamed', i % BEAN_ATLAS.variants, x, y, S * 0.026);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ---- 窓（昼夜が流れる） ----
    const winR = b.w * 0.115;
    const wx = -b.w * 0.26, wy = -b.h * 0.34;
    ctx.save();
    ctx.beginPath(); ctx.arc(wx, wy, winR, 0, TAU); ctx.clip();
    ctx.fillStyle = this.skyColor();
    ctx.fillRect(wx - winR, wy - winR, winR * 2, winR * 2);
    // 太陽 / 月
    const u = (this.prog * 2) % 1;
    const sunA = u * TAU - Math.PI / 2;
    const night = this.isNight();
    ctx.fillStyle = night ? '#fff6cf' : '#fff08a';
    const sx = wx + Math.cos(sunA) * winR * 0.55;
    const sy = wy + Math.sin(sunA) * winR * 0.55;
    ctx.beginPath(); ctx.arc(sx, sy, winR * 0.22, 0, TAU); ctx.fill();
    if (night) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(wx + Math.cos(i * 1.7) * winR * 0.6, wy + Math.sin(i * 2.3) * winR * 0.6, winR * 0.05, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = '#b98352';
    ctx.lineWidth = S * 0.014;
    ctx.beginPath(); ctx.arc(wx, wy, winR, 0, TAU); ctx.stroke();

    // ---- 時計 ----
    const cx = b.w * 0.26, cy = -b.h * 0.34, cr = b.w * 0.105;
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#b98352';
    ctx.lineWidth = S * 0.012;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#7a5330';
    ctx.lineCap = 'round';
    ctx.lineWidth = S * 0.011;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(this.clock - Math.PI / 2) * cr * 0.6, cy + Math.sin(this.clock - Math.PI / 2) * cr * 0.6);
    ctx.stroke();
    ctx.lineWidth = S * 0.014;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(this.clock / 12 - Math.PI / 2) * cr * 0.4, cy + Math.sin(this.clock / 12 - Math.PI / 2) * cr * 0.4);
    ctx.stroke();

    // ---- 進み具合のバー ----
    const bw = b.w * 0.76, bh = b.h * 0.075;
    const by = b.h * 0.36;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    roundRect(ctx, -bw / 2, by - bh / 2, bw, bh, bh / 2); ctx.fill();
    const bg = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    bg.addColorStop(0, '#ffd36e');
    bg.addColorStop(1, '#ff8a5c');
    ctx.fillStyle = bg;
    roundRect(ctx, -bw / 2, by - bh / 2, Math.max(bh, bw * this.prog), bh, bh / 2); ctx.fill();
    ctx.restore();

    this.px.draw(ctx);

    // ---- ダイヤル ----
    this.drawDial(ctx, S);

    if (this.phase === 'turn') {
      const a = clamp(this.hint * 0.9 + (this.turned < 0.03 ? 0.5 : 0.1), 0, 1);
      const d = this.dial;
      const ang = this.t * 2.2;
      drawHandHint(ctx, d.x + Math.cos(ang) * d.r * 0.85, d.y + Math.sin(ang) * d.r * 0.85, S * 0.062, a, ang + 1.2);
      // ぐるぐるの矢印
      if (a > 0.05) {
        ctx.save();
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = S * 0.012;
        ctx.setLineDash([S * 0.03, S * 0.03]);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 0.85, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  drawDial(ctx, S) {
    const d = this.dial;
    ctx.save();
    ctx.translate(d.x, d.y);
    // 台座
    ctx.fillStyle = 'rgba(110,70,25,0.2)';
    ctx.beginPath(); ctx.arc(0, S * 0.012, d.r * 1.12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f6e3c6';
    ctx.beginPath(); ctx.arc(0, 0, d.r * 1.12, 0, TAU); ctx.fill();

    // 進捗リング
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = d.r * 0.18;
    ctx.beginPath(); ctx.arc(0, 0, d.r * 1.0, 0, TAU); ctx.stroke();
    const g = ctx.createLinearGradient(-d.r, 0, d.r, 0);
    g.addColorStop(0, '#ffd36e');
    g.addColorStop(1, '#ff7f5c');
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, d.r * 1.0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.prog, 0.001, 1));
    ctx.stroke();

    // つまみ
    ctx.rotate(this.spin);
    const kg = ctx.createLinearGradient(0, -d.r, 0, d.r);
    kg.addColorStop(0, '#ffb877');
    kg.addColorStop(1, '#e08344');
    ctx.fillStyle = kg;
    ctx.beginPath(); ctx.arc(0, 0, d.r * 0.82, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * TAU) / 8);
      roundRect(ctx, -d.r * 0.06, -d.r * 0.82, d.r * 0.12, d.r * 0.2, d.r * 0.05);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath(); ctx.arc(0, 0, d.r * 0.45, 0, TAU); ctx.fill();
    // 指標
    ctx.fillStyle = '#ff7f5c';
    roundRect(ctx, -d.r * 0.07, -d.r * 0.62, d.r * 0.14, d.r * 0.34, d.r * 0.06);
    ctx.fill();
    ctx.restore();
  }
}

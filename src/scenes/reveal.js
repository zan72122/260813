// 7. ごほうび：ごはんにのせて、たれ・からしを入れて完成（短く）
import { Scene } from '../game.js';
import { TAU, clamp, lerp, rrange, rand, easeOut, easeIn, roundRect } from '../util.js';
import {
  drawRoom, drawTable, drawPack,
  glowSpot, drawHandHint, drawRoundButton,
} from '../art.js';
import {
  drawBeanAuto, drawStickyMass, drawStickyGlaze, drawContactShadows,
  drawWetRim, drawThread, drawRice, BEAN_ATLAS,
} from '../natto.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

export class RevealScene extends Scene {
  enter(f) {
    this.px = new Particles(f.fast ? 90 : 200);
    this.phase = 'pour';    // pour → tare → karashi → toss → done
    this.pt = 0;
    this.tip = 0;           // パックの傾き
    this.tare = 0;
    this.karashi = 0;
    this.toss = 0;
    this.jingled = false;
    this.beans = [];
    for (let i = 0; i < 22; i++) {
      const a = rand() * TAU, r = Math.sqrt(rand());
      this.beans.push({
        v: (i * 5) % BEAN_ATLAS.variants,
        sc: rrange(0.86, 1.14),
        bx: Math.cos(a) * r, by: Math.sin(a) * r * 0.55,
        rot: rrange(-0.7, 0.7), ph: rrange(0, TAU), delay: rand() * 0.5,
      });
    }
    this.webs = [];
    for (let i = 0; i < 18; i++) {
      this.webs.push({ a: (rand() * 22) | 0, b: (rand() * 22) | 0, ph: rand() * TAU, w: rrange(0.7, 1.4) });
    }
    this.layout(f);
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.bowl = { x: W * 0.5, y: H * 0.56, r: S * 0.38 };
      this.pack = { x: W * 0.5, y: H * 0.2, w: S * 0.42, h: S * 0.26 };
      this.tareP = { x: W * 0.2, y: H * 0.78, s: S * 0.09 };
      this.karaP = { x: W * 0.8, y: H * 0.78, s: S * 0.09 };
    } else {
      this.bowl = { x: W * 0.4, y: H * 0.56, r: S * 0.4 };
      this.pack = { x: W * 0.4, y: H * 0.16, w: S * 0.4, h: S * 0.22 };
      this.tareP = { x: W * 0.75, y: H * 0.62, s: S * 0.1 };
      this.karaP = { x: W * 0.89, y: H * 0.62, s: S * 0.1 };
    }
    this.tableY = this.bowl.y + this.bowl.r * 0.44;
    const r = S * 0.085;
    this.btnA = { x: W * 0.5 - r * 1.7, y: H - r * 1.5, r };
    this.btnB = { x: W * 0.5 + r * 1.7, y: H - r * 1.5, r };
    if (!portrait) {
      // 右下すみは「はじめから」ボタンの場所なので空けておく
      this.btnA = { x: W * 0.76 - r * 1.7, y: H - r * 1.6, r };
      this.btnB = { x: W * 0.76 + r * 1.7, y: H - r * 1.6, r };
    }
  }

  down(p, f) {
    if (this.phase === 'pour') {
      this.phase = 'tare'; this.pt = 0;
      sfx.pop(0.9);
    } else if (this.phase === 'tare') {
      this.phase = 'karashi'; this.pt = 0;
      sfx.water();
    } else if (this.phase === 'karashi') {
      this.phase = 'toss'; this.pt = 0;
      sfx.pop(1.4);
    } else if (this.phase === 'done') {
      if (Math.hypot(p.x - this.btnA.x, p.y - this.btnA.y) < this.btnA.r * 1.3) {
        sfx.pop(1.2); this.next('finale');
      } else if (Math.hypot(p.x - this.btnB.x, p.y - this.btnB.y) < this.btnB.r * 1.3) {
        sfx.pop(0.8); this.next('title');
      }
    }
  }

  update(dt, f) {
    const S = f.S;
    this.pt += dt;
    if (this.phase === 'tare') this.tip = clamp(this.tip + dt * 1.6, 0, 1);
    if (this.phase === 'karashi') this.tare = clamp(this.tare + dt * 1.4, 0, 1);
    if (this.phase === 'toss') {
      this.karashi = clamp(this.karashi + dt * 2.2, 0, 1);
      this.toss = clamp(this.toss + dt * 0.9, 0, 1);
      if (this.toss > 0.25 && rand() < 0.4) {
        this.px.sparkle(this.bowl.x + rrange(-0.6, 0.6) * this.bowl.r, this.bowl.y - this.bowl.r * 0.35,
          { n: 1, size: S * 0.028, life: 0.9 });
      }
      if (this.toss >= 1) {
        this.phase = 'done'; this.pt = 0;
        if (!this.jingled) { this.jingled = true; sfx.jingle(); }
      }
    }
    if (this.phase === 'done' || this.phase === 'toss') {
      if (rand() < 0.25) {
        this.px.steam(this.bowl.x + rrange(-0.4, 0.4) * this.bowl.r, this.bowl.y - this.bowl.r * 0.5,
          { n: 1, size: S * 0.035, grow: S * 0.04, life: 1.6, alpha: 0.3 });
      }
    }
    this.px.update(dt);
  }

  beanPos(i, f) {
    const b = this.beans[i];
    const bl = this.bowl;
    const drop = clamp((this.tip - b.delay * 0.5) * 2.2, 0, 1);
    const onRice = { x: bl.x + b.bx * bl.r * 0.58, y: bl.y - bl.r * 0.63 + b.by * bl.r * 0.24 };
    const inPack = { x: this.pack.x + b.bx * this.pack.w * 0.3, y: this.pack.y + b.by * this.pack.h * 0.3 };
    return {
      x: lerp(inPack.x, onRice.x, easeOut(drop)),
      y: lerp(inPack.y, onRice.y, easeIn(drop) * 0.8 + drop * 0.2),
      drop,
    };
  }

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#fff4dc', bottom: '#ffd9a0' });
    drawTable(ctx, W, H, this.tableY, '#c78f52');
    const bl = this.bowl;
    glowSpot(ctx, bl.x, bl.y - bl.r * 0.2, bl.r * 2, 'rgba(255,255,255,0.5)');

    // ---- パック（傾いて中身を落とす） ----
    if (this.tip < 1) {
      ctx.save();
      ctx.translate(this.pack.x, this.pack.y);
      ctx.rotate(this.tip * 1.0);
      drawPack(ctx, 0, 0, this.pack.w, this.pack.h);
      ctx.restore();
    }

    // ---- ごはん茶碗 ----
    ctx.fillStyle = 'rgba(110,70,25,0.22)';
    ctx.beginPath(); ctx.ellipse(bl.x, bl.y + bl.r * 0.5, bl.r * 0.8, bl.r * 0.12, 0, 0, TAU); ctx.fill();

    // ごはんの山（茶碗のふちより高く盛る）
    const riceY = bl.y - bl.r * 0.32;
    ctx.fillStyle = '#ddd6c4';
    ctx.beginPath();
    ctx.ellipse(bl.x, riceY, bl.r * 0.9, bl.r * 0.52, 0, Math.PI, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bl.x, riceY, bl.r * 0.9, bl.r * 0.18, 0, 0, TAU);
    ctx.fill();
    // 米粒（焼き込みスプライト）。
    // ごはんは「白い山＋点々」ではなく、粒が積み重なってできた面にする。
    // ここがベタ塗りのままだと、隣の納豆まで嘘に見えてしまう。
    const grain = S * 0.05;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(bl.x, riceY, bl.r * 0.92, bl.r * 0.54, 0, Math.PI, TAU);
    ctx.ellipse(bl.x, riceY, bl.r * 0.92, bl.r * 0.19, 0, 0, TAU);
    ctx.clip();
    const grains = f.fast ? 150 : 280;
    const list = [];
    for (let i = 0; i < grains; i++) {
      // 黄金角のらせんで単位円に散らし、それを「見えている山の面」へ写す
      const a = i * 2.39996;
      const rad = Math.sqrt((i + 0.5) / grains);
      const dx = Math.cos(a) * rad, dy = Math.sin(a) * rad;
      const edge = Math.sqrt(Math.max(0, 1 - dx * dx));
      list.push({
        x: bl.x + dx * bl.r * 0.9,
        y: lerp(riceY - bl.r * 0.54 * edge, riceY + bl.r * 0.18 * edge, (dy + 1) / 2),
        i, shade: 1 - (dy + 1) / 2,
      });
    }
    list.sort((p, q) => p.y - q.y);          // 奥から手前へ
    for (const g2 of list) {
      ctx.globalAlpha = 0.85 + g2.shade * 0.15;
      drawRice(ctx, g2.i, g2.x, g2.y, grain * (0.86 + ((g2.i * 13) % 7) * 0.045),
        Math.sin(g2.i * 2.1) * 0.3);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    const jitter = this.toss > 0 ? Math.sin(this.t * 22) * S * 0.006 * (1 - this.toss) : 0;

    // たれ（豆の下に敷いて、つやを出す）
    if (this.tare > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.tare * 0.5;
      ctx.fillStyle = '#7a4a1c';
      ctx.beginPath();
      ctx.ellipse(bl.x, bl.y - bl.r * 0.55, bl.r * 0.52 * this.tare, bl.r * 0.2 * this.tare, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // ---- 納豆（ごはんの上）----
    const br = S * 0.042;
    const landed = [];
    for (let i = 0; i < this.beans.length; i++) {
      const q = this.beanPos(i, f);
      landed.push({ x: q.x + jitter, y: q.y, b: this.beans[i], drop: q.drop });
    }
    landed.sort((a, b) => a.y - b.y);
    const onRice = landed.filter((q) => q.drop > 0.3);
    if (onRice.length) {
      drawContactShadows(ctx, onRice, br, 0.24);
      drawStickyMass(ctx, onRice, br, 0.95, { scale: 0.75 });
    }
    for (const q of landed) {
      drawBeanAuto(ctx, 'mixed', q.b.v, q.x, q.y, br * q.b.sc);
    }
    if (onRice.length) {
      drawWetRim(ctx, onRice, br, 0.95);
      drawStickyGlaze(ctx, 0.95, { foam: 22, foamR: br * 0.1 });
    }
    // 糸は豆の上に重ねる（ここが「見たことある！」の決め手）
    for (const w of this.webs) {
      const A = this.beanPos(w.a, f), B = this.beanPos(w.b, f);
      if (A.drop < 0.3 || B.drop < 0.3) continue;
      const ex = B.x - A.x, ey = B.y - A.y;
      const d = Math.hypot(ex, ey) || 1;
      drawThread(ctx, A.x + ex * 0.24 + jitter, A.y + ey * 0.24 - br * 0.2,
        B.x - ex * 0.24 - jitter, B.y - ey * 0.24 - br * 0.2, {
          width: S * 0.009 * w.w * w.w,
          sag: d * 0.15 + br * 0.04,
          wobble: S * 0.004,
          phase: w.ph + this.t * 2,
          alpha: 0.8, curl: 0.4,
          beads: w.w > 1.2 ? 1 : 0,
          segs: f.fast ? 12 : 18,
        });
    }
    // 宙に立つ糸
    if (this.tip > 0.6) {
      for (let i = 0; i < 10; i++) {
        const q = onRice[(i * 3) % Math.max(1, onRice.length)];
        if (!q) break;
        const up = br * (1.2 + ((i * 7) % 5) * 0.5);
        drawThread(ctx, q.x, q.y - br * 0.5, q.x + ((i % 3) - 1) * br * 0.9, q.y - br * 0.5 - up, {
          width: S * 0.0045, sag: -up * 0.12, wobble: br * 0.12,
          phase: i * 1.7 + this.t, alpha: 0.65, tension: 0.35,
          segs: 14, curl: 0.9, halo: false,
        });
      }
    }
    // たれのてかり
    if (this.tare > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.tare * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(bl.x - bl.r * 0.16, bl.y - bl.r * 0.64, bl.r * 0.16 * this.tare, bl.r * 0.05 * this.tare, -0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // からし
    if (this.karashi > 0.01) {
      ctx.save();
      ctx.globalAlpha = clamp(this.karashi, 0, 1);
      ctx.fillStyle = '#ffd83b';
      ctx.beginPath();
      ctx.ellipse(bl.x + bl.r * 0.3, bl.y - bl.r * 0.72, S * 0.028 * this.karashi, S * 0.02 * this.karashi, 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(bl.x + bl.r * 0.26, bl.y - bl.r * 0.75, S * 0.01 * this.karashi, S * 0.005 * this.karashi, 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 茶碗（手前）
    const g = ctx.createLinearGradient(bl.x - bl.r, 0, bl.x + bl.r, 0);
    g.addColorStop(0, '#4f7fa8');
    g.addColorStop(0.4, '#a9d4ec');
    g.addColorStop(1, '#5b87ae');
    // 高台（これがないと浮いて見える）
    ctx.fillStyle = '#4d7ba3';
    roundRect(ctx, bl.x - bl.r * 0.3, bl.y + bl.r * 0.26, bl.r * 0.6, bl.r * 0.22, bl.r * 0.06);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bl.x - bl.r, bl.y - bl.r * 0.3);
    ctx.quadraticCurveTo(bl.x, bl.y + bl.r * 1.2, bl.x + bl.r, bl.y - bl.r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(bl.x - bl.r * 0.45, bl.y + bl.r * 0.05, bl.r * 0.12, bl.r * 0.3, 0.35, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#e9f4fb';
    ctx.lineWidth = S * 0.02;
    ctx.beginPath();
    ctx.ellipse(bl.x, bl.y - bl.r * 0.3, bl.r, bl.r * 0.24, 0, 0, TAU);
    ctx.stroke();

    this.px.draw(ctx);

    // ---- たれ / からし の小袋 ----
    if (this.phase === 'tare' || this.phase === 'pour') this.drawSachet(ctx, f, this.tareP, '#8a5a2b', this.phase === 'tare');
    if (this.phase === 'karashi' || this.phase === 'tare' || this.phase === 'pour') {
      this.drawSachet(ctx, f, this.karaP, '#ffd83b', this.phase === 'karashi');
    }

    // ---- ヒント ----
    if (this.phase !== 'done') {
      let target = null;
      if (this.phase === 'pour') target = { x: this.pack.x, y: this.pack.y + this.pack.h * 0.7 };
      else if (this.phase === 'tare') target = { x: this.tareP.x, y: this.tareP.y + this.tareP.s };
      else if (this.phase === 'karashi') target = { x: this.karaP.x, y: this.karaP.y + this.karaP.s };
      if (target) {
        const a = clamp(this.hint * 0.9 + 0.45, 0, 1);
        drawHandHint(ctx, target.x + S * 0.05, target.y + Math.sin(this.t * 4) * S * 0.012, S * 0.06, a, 0.15);
      }
    } else {
      this.drawEndButtons(ctx, f);
    }
  }

  drawSachet(ctx, f, p, color, active) {
    const { S } = f;
    const wob = active ? Math.sin(this.t * 9) * 0.12 * (0.4 + this.hint) : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(wob);
    ctx.globalAlpha = active ? 1 : 0.55;
    ctx.fillStyle = 'rgba(110,70,25,0.2)';
    roundRect(ctx, -p.s * 0.7 + S * 0.006, -p.s * 0.5 + S * 0.01, p.s * 1.4, p.s, p.s * 0.16); ctx.fill();
    ctx.fillStyle = '#f7f2e6';
    roundRect(ctx, -p.s * 0.7, -p.s * 0.5, p.s * 1.4, p.s, p.s * 0.16); ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -p.s * 0.5, -p.s * 0.28, p.s * 1.0, p.s * 0.56, p.s * 0.12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    roundRect(ctx, -p.s * 0.45, -p.s * 0.22, p.s * 0.9, p.s * 0.14, p.s * 0.06); ctx.fill();
    // ギザギザ
    ctx.strokeStyle = '#d8ceba';
    ctx.lineWidth = S * 0.004;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = -p.s * 0.7 + (i / 8) * p.s * 1.4;
      ctx.lineTo(x, -p.s * 0.5 + (i % 2 ? S * 0.008 : 0));
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawEndButtons(ctx, f) {
    const pulse = 1 + Math.sin(this.t * 3) * 0.05;
    // もういちど びよーん（糸のアイコン）
    drawRoundButton(ctx, this.btnA.x, this.btnA.y, this.btnA.r * pulse, (c, r) => {
      c.strokeStyle = '#fffdf5';
      c.lineWidth = r * 0.13;
      c.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(i * r * 0.28, -r * 0.55);
        c.quadraticCurveTo(i * r * 0.5, 0, i * r * 0.2, r * 0.55);
        c.stroke();
      }
      c.fillStyle = '#e8c98a';
      c.beginPath(); c.ellipse(0, r * 0.6, r * 0.3, r * 0.2, 0, 0, TAU); c.fill();
    }, { top: '#b9e7ff', bottom: '#5fb6ef' });

    // さいしょから
    drawRoundButton(ctx, this.btnB.x, this.btnB.y, this.btnB.r * pulse, (c, r) => {
      c.strokeStyle = '#fffdf5';
      c.lineWidth = r * 0.17;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, r * 0.45, Math.PI * 0.4, Math.PI * 1.9);
      c.stroke();
      c.fillStyle = '#fffdf5';
      c.beginPath();
      c.moveTo(r * 0.44, -r * 0.4);
      c.lineTo(r * 0.8, -r * 0.02);
      c.lineTo(r * 0.14, r * 0.02);
      c.closePath(); c.fill();
    });
  }
}

// 6. パックを開ける → 混ぜる → びよーん
// このゲームの心臓部。カメラを切らずに「混ぜる→糸が増える→持ち上げる」を
// ひと続きで見せる。開けた直後はまだ「ただの豆」に見えるようにしてある。
import { Scene } from '../game.js';
import { TAU, clamp, lerp, rrange, rand, easeOut, easeOutBack, angleDelta, roundRect, damp } from '../util.js';
import {
  drawRoom, drawTableRect, drawBean, BEAN_LOOK, blendLook, drawPack,
  drawStrand, drawStick, glowSpot, drawHandHint, drawRoundButton,
} from '../art.js';
import { Particles } from '../fx.js';
import { sfx } from '../audio.js';

const MAX_WEB = 26;
const MIX_ZOOM = 1.2;    // 混ぜている間は接写
const LIFT_ZOOM = 0.84;  // 持ち上げたら引いて、糸の長さを見せる

export class FinaleScene extends Scene {
  enter(f) {
    this.px = new Particles(f.fast ? 90 : 220);
    this.phase = 'open';       // open → drop → mix（lift は mix の中の連続状態）
    this.pt = 0;
    this.openAmt = 0;
    this.sticky = 0;
    this.stirAng = null;
    this.stirTotal = 0;
    this.stirSound = 0;
    this.webs = [];
    this.tipThreads = [];
    this.lift = 0;             // 0..1.4 パックのふちからの持ち上げ量
    this.liftPeak = 0;
    this.lastStretchStep = 0;
    this.wowCount = 0;
    this.wowFlash = 0;
    this.holding = false;
    this.held = [];
    this.zoom = 1;
    this.showNext = false;
    this.nextPulse = 0;

    // 24 粒。縦画面は 6x4、横画面は 8x3 に組み替える（向きに合わせた再構図）
    this.beans = [];
    for (let i = 0; i < 24; i++) {
      this.beans.push({
        idx: i,
        jitX: rrange(-0.05, 0.05), jitY: rrange(-0.07, 0.07),
        rot: rrange(-0.7, 0.7),
        ph: rrange(0, TAU),
        held: false, ox: 0, oy: 0,
        jx: 0, jy: 0,
      });
    }
    this.layout(f);
    this.zoom = MIX_ZOOM;
    this.tip = { x: this.pk.x, y: this.pk.y - this.pk.h * 0.2 };
    this.tipV = { x: 0, y: 0 };
    this.stickAng = 0.15;
  }

  layout(f) {
    const { W, H, S, portrait } = f;
    if (portrait) {
      this.pk = { x: W * 0.5, y: H * 0.72, w: S * 0.7, h: S * 0.44 };
      this.stickLen = S * 0.4;
      this.liftSpan = S * 0.55;
    } else {
      // 横画面は縦の余白が少ないので、パックを薄く低く置いて上を空ける
      this.pk = { x: W * 0.5, y: H * 0.8, w: S * 1.25, h: S * 0.3 };
      this.stickLen = S * 0.3;
      this.liftSpan = S * 0.34;
    }
    this.rimY = this.pk.y - this.pk.h * 0.42;
    this.anchorY = H * 0.5;
    // 画面が回っても構図が飛ばないよう、カメラを新しいパック位置に置き直す
    this.focusY = this.pk.y;
    this.rawY = (this.rimY - this.pk.y) * MIX_ZOOM + this.anchorY;
  }

  /* 画面座標 → ゲーム内座標（カメラの逆変換）。
     カメラのズームは「指の画面上の高さ」だけで決めているので、
     指→棒→カメラ→指 のフィードバックは起きない。 */
  toWorld(p, f) {
    const z = this.zoom;
    return {
      x: (p.x - f.W / 2) / z + this.pk.x,
      y: (p.y - this.anchorY) / z + this.focusY,
    };
  }

  /* ------------------------- 入力 ------------------------- */

  down(p, f) {
    if (this.phase === 'open') {
      this.openDrag = p.y;
      return;
    }
    if (this.showNext && this.hitNext(p)) {
      sfx.pop(1.3);
      this.next('reveal');
      return;
    }
    if (this.phase === 'mix') {
      this.holding = true;
      this.rawY = p.y;
      const w = this.toWorld(p, f);
      this.stirAng = Math.atan2(w.y - this.pk.y, w.x - this.pk.x);
      this.target = w;
    }
  }

  move(p, f) {
    if (this.phase === 'open') {
      const dy = -(p.dy || 0);
      if (dy > 0) this.openAmt = clamp(this.openAmt + dy / (f.S * 0.28), 0, 1);
      return;
    }
    if (this.phase !== 'mix' || !this.holding) return;
    this.rawY = p.y;
    const w = this.toWorld(p, f);
    this.target = w;

    // 混ぜ量：円運動を主に、直線的な動きも少しだけ拾う（幼児の操作ズレ補正）
    const a = Math.atan2(w.y - this.pk.y, w.x - this.pk.x);
    let d = 0;
    if (this.stirAng !== null) d = angleDelta(this.stirAng, a);
    this.stirAng = a;
    const inPack = w.y > this.rimY - f.S * 0.06;
    if (inPack) {
      const byAngle = Math.min(Math.abs(d), 0.5);
      const byMove = Math.hypot(p.dx || 0, p.dy || 0) / (f.S * 12);
      this.addStir(byAngle / (TAU * 5.5) + byMove * 0.18, f);
    }
  }

  up(p, f) {
    if (this.phase === 'open') {
      // タップだけでも開く
      if ((p.moved || 0) < f.S * 0.03) this.openAmt = clamp(this.openAmt + 0.45, 0, 1);
      return;
    }
    this.holding = false;
    this.stirAng = null;
    this.releaseHeld();
  }

  hitNext(p) {
    const b = this.nextBtn;
    return b && Math.hypot(p.x - b.x, p.y - b.y) < b.r * 1.35;
  }

  addStir(v, f) {
    if (v <= 0) return;
    const before = this.sticky;
    this.sticky = clamp(this.sticky + v, 0, 1);
    this.stirTotal += v;
    this.stirSound += v;
    if (this.stirSound > 0.045) {
      this.stirSound = 0;
      sfx.stir(this.sticky);
    }
    // 混ぜた分だけ糸が増える（因果を目で見せる）
    const target = Math.floor(this.sticky * MAX_WEB);
    while (this.webs.length < target) this.spawnWeb(f);
    // ときどき泡
    if (rand() < v * 14) {
      this.px.bubble(this.tip.x + rrange(-1, 1) * f.S * 0.06, this.tip.y + rrange(-1, 1) * f.S * 0.03,
        { scale: f.S * 0.0035, spread: f.S * 0.04 });
    }
    if (before < 0.5 && this.sticky >= 0.5) sfx.sparkle(2);
  }

  spawnWeb(f) {
    // 近くの豆どうしを結ぶ（長いリボンではなく、短い糸がたくさん出るように）
    const a = (rand() * this.beans.length) | 0;
    const A = this.beanSlot(this.beans[a], f);
    const near = this.beans
      .map((bn, i) => ({ i, d: Math.hypot(this.beanSlot(bn, f).x - A.x, this.beanSlot(bn, f).y - A.y) }))
      .filter((o) => o.i !== a)
      .sort((p, q) => p.d - q.d)
      .slice(0, 5);
    const b = near[(rand() * near.length) | 0].i;
    this.webs.push({
      a, b,
      phase: rand() * TAU,
      w: rrange(0.7, 1.5),
      rest: rrange(0.7, 1.25),
      over: rand() < 0.45,     // 一部は豆の手前に張って、糸が増えたのを見せる
    });
  }

  /* ------------------------- 更新 ------------------------- */

  update(dt, f) {
    const S = f.S;
    this.pt += dt;
    this.wowFlash = Math.max(0, this.wowFlash - dt * 1.6);
    this.nextPulse += dt;

    if (this.phase === 'open') {
      if (this.openAmt >= 1) {
        this.phase = 'drop'; this.pt = 0;
        sfx.open();
        for (let i = 0; i < 6; i++) this.px.sparkle(this.pk.x + rrange(-0.4, 0.4) * this.pk.w, this.rimY, { size: S * 0.022 });
      }
      return;
    }

    if (this.phase === 'drop') {
      if (this.pt > 0.75) { this.phase = 'mix'; this.pt = 0; sfx.pop(0.8); }
      const u = clamp(this.pt / 0.75, 0, 1);
      this.tip.x = this.pk.x;
      this.tip.y = lerp(this.pk.y - S * 0.9, this.pk.y - this.pk.h * 0.1, easeOutBack(u));
      return;
    }

    /* ---- カメラ：混ぜる＝接写、持ち上げる＝すこし引く ----
       基準は「静止時にパックのふちが見える画面位置」。カメラの現在値を
       使わないので、指→カメラ→指 のフィードバックが起きない。
       パックの中で混ぜている間はここが不感帯になり、絵が動かない。 */
    const rimAtRest = (this.rimY - this.pk.y) * MIX_ZOOM + this.anchorY;
    const liftScreen = clamp((rimAtRest - this.rawY) / (f.H * 0.34), 0, 1);
    const zTarget = lerp(MIX_ZOOM, LIFT_ZOOM, liftScreen);
    this.zoom = damp(this.zoom, zTarget, 4.5, dt);
    this.focusY = damp(this.focusY, this.pk.y - liftScreen * S * 0.34, 4.5, dt);
    if (!this.holding) this.rawY = damp(this.rawY, rimAtRest, 3, dt);

    /* ---- 混ぜる／持ち上げる（カメラを切らない連続した状態） ---- */
    let tx = this.tip.x, ty = this.tip.y;
    if (this.holding && this.target) {
      tx = this.target.x;
      ty = this.target.y;
      // 横はパックの中に寄せる（棒がすっ飛んでいかない）
      const lim = this.pk.w * 0.46;
      tx = clamp(tx, this.pk.x - lim, this.pk.x + lim);
      // 棒の頭が画面から出ないように、上限を切る
      const minScreenY = this.stickLen * this.zoom + S * 0.13;
      const minWorldY = (minScreenY - this.anchorY) / this.zoom + this.focusY;
      ty = Math.max(ty, minWorldY);
      // 糸が張るほど棒は指に少し遅れてついてくる＝手応え
      const resist = this.held.length ? clamp(this.lift, 0, 1.2) * this.sticky : 0;
      const lambda = lerp(22, 6, clamp(resist, 0, 1));
      tx = damp(this.tip.x, tx, lambda, dt);
      ty = damp(this.tip.y, ty, lambda, dt);
    } else {
      // 手を離すと、ゆっくりパックへ戻る
      tx = damp(this.tip.x, this.pk.x, 3.2, dt);
      ty = damp(this.tip.y, this.pk.y - this.pk.h * 0.1, 3.4, dt);
    }
    const nvx = (tx - this.tip.x) / Math.max(dt, 1e-3);
    const nvy = (ty - this.tip.y) / Math.max(dt, 1e-3);
    this.tipV.x = damp(this.tipV.x, nvx, 12, dt);
    this.tipV.y = damp(this.tipV.y, nvy, 12, dt);
    this.tip.x = tx; this.tip.y = ty;
    this.stickAng = damp(this.stickAng, clamp(this.tipV.x / (S * 6), -0.5, 0.5), 8, dt);

    // 持ち上げ量
    const rawLift = clamp((this.rimY - this.tip.y) / this.liftSpan, 0, 1.5);
    const rising = rawLift > this.lift;
    this.lift = rawLift;

    if (this.lift > 0.04 && this.held.length === 0 && this.holding) this.grabClump(f);
    if (this.lift <= 0.02 && this.held.length && !this.holding) this.releaseHeld();

    // 糸が張る音（伸ばすほど高く）
    if (this.held.length) {
      const step = Math.floor(this.lift / 0.16);
      if (rising && step > this.lastStretchStep) {
        this.lastStretchStep = step;
        sfx.stretch(clamp(this.lift / 1.2, 0, 1) * (0.4 + this.sticky * 0.6));
      }
      if (!rising) this.lastStretchStep = Math.min(this.lastStretchStep, step);
    }

    // 糸が切れる（粘りが弱いほどよく切れる＝「もっと混ぜよう」が伝わる）
    const keep = 2 + Math.round(this.sticky * 8);
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const w = this.webs[i];
      const A = this.beanPos(w.a, f), B = this.beanPos(w.b, f);
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      // よく混ぜてあるほど、糸は切れずに長く伸びる
      const limit = S * (0.12 + this.sticky * 1.3) * w.rest;
      if (d > limit * 1.35 && this.webs.length > keep) {
        this.webs.splice(i, 1);
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
        for (let k = 0; k < 2; k++) this.px.fleck(mx, my);
        sfx.snap();
      }
    }

    // 「あっ！」の瞬間
    if (this.lift > this.liftPeak) this.liftPeak = this.lift;
    if (this.lift > 0.62 && this.sticky > 0.5 && this.wowFlash <= 0 && this.held.length && this.webs.length >= 5) {
      const first = this.wowCount === 0;
      this.wowCount++;
      this.wowFlash = 1;
      sfx.yay();
      for (let i = 0; i < 18; i++) {
        this.px.sparkle(this.tip.x + rrange(-1, 1) * S * 0.18, this.tip.y + rrange(-0.2, 1.2) * S * 0.22,
          { size: S * 0.035, life: 1.1 });
      }
      if (first) this.showNext = true;
    }

    // 糸に引かれて、パックの中の豆もすこし持ち上がる
    for (const b of this.beans) { b.pullX = 0; b.pullY = 0; }
    if (this.held.length) {
      for (const w of this.webs) {
        const ha = this.beans[w.a].held, hb = this.beans[w.b].held;
        if (ha === hb) continue;
        const b = ha ? this.beans[w.b] : this.beans[w.a];
        const q = this.beanSlot(b, f);
        const dx = this.tip.x - q.x, dy = this.tip.y - q.y;
        const len = Math.hypot(dx, dy) || 1;
        const pull = clamp(this.lift, 0, 1) * S * 0.012;
        b.pullX += (dx / len) * pull;
        b.pullY += (dy / len) * pull;
      }
    }

    // 豆のゆらぎ
    for (const b of this.beans) {
      const slot = this.beanSlot(b, f);
      const stirNear = this.holding
        ? clamp(1 - Math.hypot(slot.x - this.tip.x, slot.y - this.tip.y) / (S * 0.2), 0, 1) : 0;
      const wx = Math.sin(this.t * 3 + b.ph) * S * 0.008 * (0.3 + this.sticky) + stirNear * this.tipV.x * 0.02;
      const wy = Math.cos(this.t * 2.6 + b.ph) * S * 0.005 * (0.3 + this.sticky);
      b.jx = damp(b.jx, wx + (b.pullX || 0), 6, dt);
      b.jy = damp(b.jy, wy + (b.pullY || 0), 6, dt);
    }

    this.px.update(dt);
  }

  grabClump(f) {
    // 棒の近くの豆が、ねばりでくっついて持ち上がる
    const n = 2 + Math.round(this.sticky * 6);
    const arr = this.beans
      .map((b, i) => ({ i, d: Math.hypot(this.beanSlot(b, f).x - this.tip.x, this.beanSlot(b, f).y - this.tip.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, n);
    for (const { i } of arr) {
      const b = this.beans[i];
      b.held = true;
      b.ox = rrange(-1, 1) * f.S * 0.07;
      b.oy = rrange(-0.05, 0.75) * f.S * 0.11;
      this.held.push(i);
    }
    // 棒そのものにも糸を垂らす（混ぜたぶんだけ本数が増える）
    this.tipThreads = [];
    const tn = 5 + Math.round(this.sticky * 13);
    for (let i = 0; i < tn; i++) {
      const bi = (rand() * this.beans.length) | 0;
      if (this.beans[bi].held) continue;
      this.tipThreads.push({
        a: bi, phase: rand() * TAU,
        ox: rrange(-1, 1) * f.S * 0.075,
        oy: rrange(-0.1, 0.9) * f.S * 0.09,
        w: rrange(0.6, 1.5),
      });
    }
  }

  releaseHeld() {
    if (!this.held.length) return;
    for (const i of this.held) this.beans[i].held = false;
    this.held.length = 0;
    this.tipThreads.length = 0;
    this.lastStretchStep = 0;
    sfx.pop(0.7);
  }

  beanSlot(b, f) {
    const p = this.pk;
    const portrait = f ? f.portrait : this.game.portrait;
    const cols = portrait ? 6 : 8;
    const rows = 24 / cols;
    const c = b.idx % cols, r = (b.idx / cols) | 0;
    const bx = ((c - (cols - 1) / 2) / ((cols - 1) / 2)) * 0.9 + b.jitX;
    const by = ((r - (rows - 1) / 2) / ((rows - 1) / 2)) * 0.84 + b.jitY;
    return {
      x: p.x + bx * p.w * 0.42 + b.jx,
      y: p.y + by * p.h * 0.3 + b.jy,
    };
  }

  beanPos(i, f) {
    const b = this.beans[i];
    if (b.held) {
      const sway = Math.sin(this.t * 3.2 + b.ph) * (f.S * 0.008) * clamp(this.lift, 0, 1);
      return { x: this.tip.x + b.ox + sway, y: this.tip.y + b.oy };
    }
    return this.beanSlot(b, f);
  }

  /* ------------------------- 描画 ------------------------- */

  draw(f) {
    const { ctx, W, H, S } = f;
    drawRoom(ctx, W, H, { top: '#fff2d8', bottom: '#f0d2a2' });

    ctx.save();
    // 混ぜている間は接写、持ち上げるほど引く（カットは割らない）
    ctx.translate(W / 2, this.anchorY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.pk.x, -this.focusY);

    // 台もカメラの中で描く（寄り引きしても接地がずれない）
    const z = this.zoom;
    drawTableRect(ctx,
      this.pk.x - (W / 2) / z, this.pk.x + (W / 2) / z,
      this.pk.y + this.pk.h * 0.68,
      this.focusY + (H - this.anchorY) / z, '#c78f52');

    glowSpot(ctx, this.pk.x, this.pk.y - this.pk.h * 0.1, this.pk.w * 0.8, 'rgba(255,255,255,0.5)');

    const p = this.pk;
    drawPack(ctx, p.x, p.y, p.w, p.h);

    // ---- パックの中の豆 ----
    const look = blendLook(BEAN_LOOK.fermented, BEAN_LOOK.mixed, this.sticky);
    const br = S * 0.044;

    // 糸（豆どうし）は豆の下に敷く
    if (this.phase !== 'open') this.drawWebs(ctx, f, false);

    for (let i = 0; i < this.beans.length; i++) {
      const b = this.beans[i];
      if (b.held) continue;
      const q = this.beanSlot(b, f);
      drawBean(ctx, q.x, q.y, br, b.rot + b.jx * 0.02, look);
    }

    // ねばりの膜（表面全体のぬめり）
    if (this.sticky > 0.15) {
      ctx.save();
      ctx.globalAlpha = (this.sticky - 0.15) * 0.42;
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.w * 0.44, p.h * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = (this.sticky - 0.15) * 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = S * 0.006;
      for (let i = 0; i < 5; i++) {
        const a = this.t * 0.6 + i * 1.3;
        ctx.beginPath();
        ctx.ellipse(p.x + Math.cos(a) * p.w * 0.16, p.y + Math.sin(a) * p.h * 0.1,
          p.w * 0.12, p.h * 0.07, a, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (this.phase !== 'open') {
      // 手前の糸（持ち上げた分がここで伸びる＝主役）
      this.drawWebs(ctx, f, true);
      this.drawTipThreads(ctx, f);

      // 持ち上がっている豆
      for (const i of this.held) {
        const b = this.beans[i];
        const q = this.beanPos(i, f);
        drawBean(ctx, q.x, q.y, br, b.rot, look);
      }

      // 棒
      drawStick(ctx, this.tip.x, this.tip.y, this.stickLen, this.stickAng, S * 0.03);
    }

    // ---- ふた（開ける前） ----
    if (this.phase === 'open') this.drawLid(ctx, f);

    this.px.draw(ctx);
    this.drawHints(ctx, f);   // ヒントもカメラの中（＝物の隣）に置く
    ctx.restore();

    // ---- きらっと光る「あっ！」 ----
    if (this.wowFlash > 0) {
      ctx.globalAlpha = this.wowFlash * 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    if (this.showNext) this.drawNextButton(ctx, f);
  }

  drawWebs(ctx, f, front) {
    const S = f.S;
    for (const w of this.webs) {
      const ba = this.beans[w.a], bb = this.beans[w.b];
      const isFront = ba.held || bb.held || w.over;
      if (isFront !== front) continue;
      const A = this.beanPos(w.a, f), B = this.beanPos(w.b, f);
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      const rest = S * (0.1 + this.sticky * 0.85) * w.rest;
      const tension = clamp((d - rest * 0.5) / (rest * 1.1), 0, 1);
      // たるみは糸の長さ自体で頭打ちにする（近い豆どうしが大きく垂れないように）
      const sag = Math.min(d * 0.24, S * 0.05) * (1 - tension) + S * 0.004;
      drawStrand(ctx, A.x, A.y, B.x, B.y, {
        width: S * 0.0085 * w.w * (0.6 + this.sticky * 0.6),
        sag,
        wobble: S * 0.008 * (1 - tension) * (0.5 + this.sticky),
        phase: w.phase + this.t * 2.2,
        alpha: 0.55 + this.sticky * 0.4,
        tension,
        segs: f.fast ? 8 : 14,
      });
    }
  }

  drawTipThreads(ctx, f) {
    const S = f.S;
    for (const th of this.tipThreads) {
      const A = this.beanPos(th.a, f);
      const B = { x: this.tip.x + th.ox, y: this.tip.y + th.oy };
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      const rest = S * (0.12 + this.sticky * 0.9);
      const tension = clamp((d - rest * 0.5) / (rest * 1.2), 0, 1);
      const sag = Math.min(d * 0.28, rest * 0.2) * (1 - tension) + S * 0.006 * (1 - tension * 0.7);
      drawStrand(ctx, A.x, A.y, B.x, B.y, {
        width: S * 0.012 * th.w * (0.6 + this.sticky * 0.7),
        sag,
        wobble: S * 0.01 * (1 - tension * 0.6),
        phase: th.phase + this.t * 2.6,
        alpha: 0.6 + this.sticky * 0.38,
        tension,
        curl: 0.5,
        segs: f.fast ? 8 : 16,
      });
    }
  }

  drawLid(ctx, f) {
    const { S } = f;
    const p = this.pk;
    const u = easeOut(this.openAmt);
    ctx.save();
    ctx.translate(p.x, p.y - p.h * 0.5 - u * S * 0.1);
    ctx.rotate(-u * 0.55);
    ctx.translate(0, p.h * 0.5);
    const w = p.w * 1.02, h = p.h * 0.92;
    ctx.fillStyle = 'rgba(110,70,25,0.18)';
    roundRect(ctx, -w / 2 + S * 0.008, -h / 2 + S * 0.012, w, h, w * 0.1); ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, 'rgba(252,254,255,0.96)');
    g.addColorStop(1, 'rgba(226,236,243,0.96)');
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.1); ctx.fill();
    // つまみ
    ctx.fillStyle = '#ff9b6a';
    const wob = this.hint * Math.sin(this.t * 12) * S * 0.006;
    roundRect(ctx, -w * 0.13 + wob, -h / 2 - S * 0.03, w * 0.26, S * 0.05, S * 0.024);
    ctx.fill();
    // 光沢
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -w * 0.42, -h * 0.36, w * 0.84, h * 0.22, h * 0.1); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawHints(ctx, f) {
    const { S } = f;
    const p = this.pk;
    if (this.phase === 'open') {
      const a = clamp(this.hint * 0.9 + 0.45, 0, 1);
      const y = p.y - p.h * 0.62 + Math.sin(this.t * 3) * S * 0.02;
      drawHandHint(ctx, p.x + S * 0.06, y, S * 0.07, a, 0.1);
      // 上向き矢印
      ctx.save();
      ctx.globalAlpha = a * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(p.x, y - S * 0.14);
      ctx.lineTo(p.x + S * 0.05, y - S * 0.07);
      ctx.lineTo(p.x - S * 0.05, y - S * 0.07);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    if (this.phase !== 'mix') return;

    if (this.sticky < 0.55) {
      // ぐるぐるして、のヒント
      const a = clamp(this.hint * 0.95 + (this.stirTotal < 0.02 ? 0.5 : 0.05), 0, 1);
      if (a > 0.03) {
        const ang = this.t * 2.4;
        const rx = p.w * 0.22, ry = p.h * 0.16;
        ctx.save();
        ctx.globalAlpha = a * 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = S * 0.012;
        ctx.setLineDash([S * 0.03, S * 0.028]);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
        drawHandHint(ctx, p.x + Math.cos(ang) * rx, p.y + Math.sin(ang) * ry, S * 0.06, a, ang + 1.4);
      }
    } else if (this.lift < 0.1) {
      // じゅうぶん粘ったら「上へ」
      const a = clamp(this.hint * 0.95 + 0.35, 0, 1);
      const y = this.rimY - S * 0.12 - Math.sin(this.t * 3) * S * 0.03;
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        const yy = y - i * S * 0.06;
        ctx.globalAlpha = a * 0.5 * (1 - i * 0.25);
        ctx.beginPath();
        ctx.moveTo(p.x, yy - S * 0.045);
        ctx.lineTo(p.x + S * 0.042, yy);
        ctx.lineTo(p.x - S * 0.042, yy);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      drawHandHint(ctx, p.x + S * 0.07, y + S * 0.05, S * 0.062, a, 0.1);
    }
  }

  drawNextButton(ctx, f) {
    const { W, H, S, portrait } = f;
    const r = S * 0.085;
    this.nextBtn = portrait
      ? { x: W - r * 1.6, y: H * 0.32, r }
      : { x: W - r * 1.6, y: H * 0.3, r };
    const b = this.nextBtn;
    const pulse = 1 + Math.sin(this.nextPulse * 3) * 0.06;
    drawRoundButton(ctx, b.x, b.y, r * pulse, (c, rr) => {
      // ごはん茶碗のアイコン
      c.fillStyle = '#fffdf6';
      c.beginPath();
      c.ellipse(0, -rr * 0.12, rr * 0.6, rr * 0.3, 0, Math.PI, TAU);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(0, -rr * 0.18, rr * 0.42, Math.PI, TAU);
      c.fill();
      c.fillStyle = '#e0862f';
      c.beginPath();
      c.moveTo(-rr * 0.62, -rr * 0.1);
      c.quadraticCurveTo(0, rr * 0.72, rr * 0.62, -rr * 0.1);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.ellipse(-rr * 0.2, rr * 0.1, rr * 0.14, rr * 0.08, -0.4, 0, TAU);
      c.fill();
    }, { top: '#b7f0c8', bottom: '#5fcf8e' });
  }
}

// ゲーム本体。工程のステートマシン、カメラ、入力、誘導。
// 文字は一切出さない。すべて形・動き・音で伝える。
import { clamp, lerp, inv, smooth, approach, TAU, roundRect, dist } from './util.js';
import { computeLayout, fitScale, revealLayout } from './layout.js';
import { Sheet } from './sheet.js';
import { Fx } from './fx.js';
import { sfx } from './audio.js';
import * as S from './scene.js';

export const ORDER = ['mix', 'pour', 'spread', 'press', 'dry', 'peel', 'reveal'];

const STAGE_LOOK = {
  mix: { cam: 'mix', persp: 0.86, tilt: 0.80 },
  pour: { cam: 'pour', persp: 0.87, tilt: 0.83 },
  spread: { cam: 'spread', persp: 0.93, tilt: 0.95 },
  press: { cam: 'press', persp: 0.95, tilt: 0.99 },
  dry: { cam: 'dry', persp: 0.90, tilt: 0.91 },
  peel: { cam: 'peel', persp: 0.96, tilt: 1.00 },
  reveal: { cam: 'reveal', persp: 0.90, tilt: 0.88 },
};

const TARGET = { mix: 1500, pour: 0.42, spread: 0.93, press: 0.88, dry: 1, peel: 1 };

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sheet = new Sheet();
    this.fx = new Fx();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.sw = 1; this.sh = 1;
    this.layout = computeLayout(1, 1);
    this.cam = { x: 0, y: 0, scale: 1 };
    this.camReady = false;
    this.time = 0;
    this.made = 0;
    this.persp = 0.86;
    this.tilt = 0.8;
    this.pointer = { down: false, x: 0, y: 0, px: 0, py: 0, sx: 0, sy: 0, id: null, moved: 0 };
    this.reset(true);
    this.resize();
  }

  reset(full) {
    this.stage = 'mix';
    this.p = 0;
    this.stageTime = 0;
    this.idle = 0;
    this.beat = 0;
    this.introT = 0;
    this.swirl = 0;
    this.swirlV = 0;
    this.mixDrag = 0;
    this.mixed = 0;
    this.frameIn = 0;
    this.ladle = { x: 0, y: 0, tx: 0, ty: 0, tilt: 0, grab: false, load: 1, on: 0 };
    this.sponge = { x: 0, y: 0, tx: 0, ty: 0, squash: 0, on: 0 };
    this.lever = { pull: 0, spin: 0, grab: false, on: 0 };
    this.peel = { len: 0, pull: 0, t: 0, grab: false, fx: 0, fy: 0, gx: 0, gy: 0, base: 0, speed: 0, free: 0, done: 0 };
    this.rt = 0;
    this.revealDone = false;
    this._chimed = null;   // これを消さないと2周目でごほうびの音が鳴らない
    this.sheet.reset();
    this.fx.clear();
    sfx.stopAllLoops();
    if (full) this.made = 0;
  }

  // ---- 画面 -----------------------------------------------------------
  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    // 画素数に上限を設ける。iPad の大画面 x2 は塗り面積が大きすぎるため、
    // このやわらかい絵柄では見た目をほぼ損なわずに描画量を減らせる。
    const MAX_PX = 2.6e6;
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > MAX_PX) dpr = Math.max(1, Math.sqrt(MAX_PX / (w * h)));
    this.dpr = dpr;
    this.sw = w; this.sh = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const prev = this.layout;
    this.layout = computeLayout(w, h);
    this.hud = Math.max(11, Math.min(w, h) * 0.028);
    // 向きが変わったら、掴んでいない道具は新しい定位置へ移す
    if (prev && prev.mode !== this.layout.mode) {
      if (!this.ladle.grab) {
        this.ladle.x = this.ladle.tx = this.layout.ladleHome.x;
        this.ladle.y = this.ladle.ty = this.layout.ladleHome.y;
      }
      if (!this.pointer.down) {
        this.sponge.x = this.sponge.tx = this.layout.press.x;
        this.sponge.y = this.sponge.ty = this.layout.press.y;
      }
    }
    if (!this.camReady) { this.snapCamera(); this.camReady = true; }
  }

  camRect() {
    const L = this.layout;
    const key = (this.stage === 'mix' && this.introT < 1.15) ? 'title' : STAGE_LOOK[this.stage].cam;
    return L.cam[key];
  }

  snapCamera() {
    const r = this.camRect();
    this.cam.x = r.x; this.cam.y = r.y;
    this.cam.scale = fitScale(r, this.sw, this.sh);
  }

  toWorld(sx, sy) {
    return {
      x: (sx - this.sw / 2) / this.cam.scale + this.cam.x,
      y: (sy - this.sh / 2) / this.cam.scale + this.cam.y,
    };
  }

  toScreen(x, y) {
    return {
      x: (x - this.cam.x) * this.cam.scale + this.sw / 2,
      y: (y - this.cam.y) * this.cam.scale + this.sh / 2,
    };
  }

  view() {
    const hw = this.sw / 2 / this.cam.scale, hh = this.sh / 2 / this.cam.scale;
    return { x0: this.cam.x - hw, y0: this.cam.y - hh, x1: this.cam.x + hw, y1: this.cam.y + hh };
  }

  // 枠の投影（u,vは範囲外でも線形に外挿できる）
  frameQ(u, v, shrink = 0) {
    const f = this.layout.frame;
    const k = 1 - shrink;
    const uu = 0.5 + (u - 0.5) * k, vv = 0.5 + (v - 0.5) * k;
    const h = f.h * this.tilt;
    const drop = (1 - smooth(this.frameIn)) * 260;
    return {
      x: f.x + (uu - 0.5) * lerp(f.w * this.persp, f.w, vv),
      y: f.y - h / 2 + vv * h - drop,
    };
  }

  sheetQ(u, v) { return this.frameQ(u, v, this.sheet.shrink * 1.8); }

  // ワールド座標 → 枠内 (u,v)
  frameUV(x, y) {
    const f = this.layout.frame;
    const h = f.h * this.tilt;
    const drop = (1 - smooth(this.frameIn)) * 260;
    const v = ((y + drop) - (f.y - h / 2)) / h;
    const w = lerp(f.w * this.persp, f.w, clamp(v, 0, 1));
    const u = (x - f.x) / w + 0.5;
    return { u, v };
  }

  get frameCenter() { return this.frameQ(0.5, 0.5); }

  // ---- 入力 -----------------------------------------------------------
  onDown(sx, sy) {
    sfx.unlock();
    const w = this.toWorld(sx, sy);
    this.pointer.down = true;
    this.pointer.x = this.pointer.px = w.x;
    this.pointer.y = this.pointer.py = w.y;
    this.pointer.sx = sx; this.pointer.sy = sy;
    this.pointer.moved = 0;
    this.idle = 0;
    if (this.beat > 0) return;

    switch (this.stage) {
      case 'mix': {
        const v = this.layout.vat;
        this.fx.ripple(w.x, clamp(w.y, v.y - v.ry, v.y + v.ry), 16, 150, 0.8);
        sfx.squish(0.7);
        break;
      }
      case 'pour':
        this.ladle.grab = true;
        break;
      case 'press':
        this.sponge.on = 1;
        sfx.press(0.8);
        break;
      case 'dry':
        this.lever.grab = true;
        break;
      case 'peel': {
        this.peel.grab = true;
        this.peel.fx = w.x; this.peel.fy = w.y;
        // つまんだ場所から「指が動いた分」だけ剥がれる。
        // 剥離線が遠ざかることで勝手に加速しないようにする。
        this.peel.gx = w.x; this.peel.gy = w.y;
        this.peel.base = this.peel.pull;
        sfx.crackle(0.4);
        break;
      }
      case 'reveal':
        if (this.revealDone) {
          const b = this.replayButton();
          if (dist(sx, sy, b.x, b.y) < b.r * 1.5) { this.restart(); }
        } else {
          this.rt = Math.max(this.rt, 5.0); // 早送り
        }
        break;
    }
  }

  onMove(sx, sy) {
    const w = this.toWorld(sx, sy);
    this.pointer.px = this.pointer.x; this.pointer.py = this.pointer.y;
    this.pointer.x = w.x; this.pointer.y = w.y;
    this.pointer.sx = sx; this.pointer.sy = sy;
    if (this.pointer.down) {
      this.pointer.moved += dist(w.x, w.y, this.pointer.px, this.pointer.py);
      this.idle = 0;
    }
  }

  onUp() {
    this.pointer.down = false;
    this.ladle.grab = false;
    this.sponge.on = 0;
    this.lever.grab = false;
    if (this.stage === 'peel') this.peel.grab = false;
    sfx.stopAllLoops();
  }

  restart() {
    const made = this.made;
    this.reset(false);
    this.made = made;
    this.snapCamera();
    sfx.pop();
  }

  replayButton() {
    const r = Math.max(38, Math.min(this.sw, this.sh) * 0.105);
    return { x: this.sw / 2, y: this.sh - r * 1.55 - Math.min(this.sw, this.sh) * 0.04, r };
  }

  // ---- 更新 -----------------------------------------------------------
  update(dt) {
    this.time += dt;
    this.stageTime += dt;
    this.introT += dt;
    if (!this.pointer.down) this.idle += dt; else this.idle = 0;

    const look = STAGE_LOOK[this.stage];
    this.persp = approach(this.persp, look.persp, 2.6, dt);
    this.tilt = approach(this.tilt, look.tilt, 2.6, dt);

    // カメラ（常に連続移動。カットしない）
    const r = this.camRect();
    const rate = 2.6;
    this.cam.x = approach(this.cam.x, r.x, rate, dt);
    this.cam.y = approach(this.cam.y, r.y, rate, dt);
    this.cam.scale = approach(this.cam.scale, fitScale(r, this.sw, this.sh), rate, dt);

    if (this.beat > 0) {
      this.beat -= dt;
      if (this.beat <= 0) this.next();
    } else {
      this[`up_${this.stage}`](dt);
    }

    // 枠の登場
    const wantFrame = ORDER.indexOf(this.stage) >= 1 ? 1 : 0;
    this.frameIn = approach(this.frameIn, wantFrame, 2.4, dt);

    this.swirl += this.swirlV * dt;
    this.swirlV = approach(this.swirlV, 0, 0.7, dt);
    this.lever.spin += (0.6 + this.lever.pull * 26) * dt;
    this.fx.update(dt);
    this.sheet.buildTexture();
  }

  complete() {
    if (this.beat > 0) return;
    this.p = 1;
    this.beat = 0.75;
    // 工程が終わった瞬間に、四角がきれいに整う（達成感）
    if (this.stage === 'spread') this.sheet.settle(0.9);
    if (this.stage === 'press') this.sheet.settle(0.5);
    sfx.chime(ORDER.indexOf(this.stage));
    const c = this.frameCenter;
    for (let i = 0; i < 10; i++) this.fx.sparkle(c.x + (Math.random() - 0.5) * 300, c.y + (Math.random() - 0.5) * 200);
  }

  next() {
    const i = ORDER.indexOf(this.stage);
    if (i < ORDER.length - 1) this.setStage(ORDER[i + 1]);
  }

  setStage(s) {
    this.stage = s;
    this.p = 0;
    this.stageTime = 0;
    this.idle = 0;
    this.beat = 0;
    sfx.stopAllLoops();
    if (s === 'pour') {
      const home = this.layout.ladleHome;
      this.ladle.x = this.ladle.tx = home.x;
      this.ladle.y = this.ladle.ty = home.y;
      sfx.whoosh();
    }
    if (s === 'press') {
      const c = this.layout.press;
      this.sponge.x = this.sponge.tx = c.x;
      this.sponge.y = this.sponge.ty = c.y;
      sfx.whoosh();
    }
    if (s === 'dry') sfx.whoosh();
    if (s === 'reveal') { this.rt = 0; this.made++; }
  }

  // 1. まぜる
  up_mix(dt) {
    const v = this.layout.vat;
    if (this.pointer.down && this.pointer.moved > 0) {
      const d = dist(this.pointer.x, this.pointer.y, this.pointer.px, this.pointer.py);
      const near = clamp(1.35 - dist(this.pointer.x, this.pointer.y, v.x, v.y) / (v.rx * 1.7), 0.3, 1);
      this.mixDrag += d * near;
      // 指の動きの向きで渦を回す
      const ang = Math.atan2(this.pointer.y - v.y, (this.pointer.x - v.x));
      const mvx = this.pointer.x - this.pointer.px, mvy = this.pointer.y - this.pointer.py;
      const tang = -Math.sin(ang) * mvx + Math.cos(ang) * mvy;
      this.swirlV = clamp(this.swirlV + tang * 0.012, -7, 7);
      if (d > 2) {
        this.mixed = clamp(this.mixed + d * 0.0009, 0, 1);
        if (Math.random() < d * 0.05) {
          this.fx.splash(this.pointer.x, this.pointer.y + v.ry * 0.1, 1, 90, 'goo');
        }
        if (Math.random() < 0.06) this.fx.ripple(this.pointer.x, this.pointer.y, 10, 110, 0.7);
      }
      sfx.loop('mix', true, { f: 260 + Math.abs(this.swirlV) * 40, q: 0.8, gain: clamp(d * 0.02, 0, 0.11), type: 'lowpass' });
      if (Math.random() < d * 0.02) sfx.squish(clamp(d * 0.06, 0.2, 0.9));
    } else {
      sfx.loop('mix', false);
    }
    this.p = clamp(this.mixDrag / TARGET.mix, 0, 1);
    if (this.p >= 1) this.complete();
  }

  // 2. 枠へ流す
  up_pour(dt) {
    const L = this.ladle;
    if (L.grab) { L.tx = this.pointer.x; L.ty = this.pointer.y - 60; }
    else { L.tx = this.layout.ladleHome.x; L.ty = this.layout.ladleHome.y; }
    L.x = approach(L.x, L.tx, 9, dt);
    L.y = approach(L.y, L.ty, 9, dt);

    const mouth = { x: L.x + 40, y: L.y + 50 };
    const { u, v } = this.frameUV(mouth.x, mouth.y);
    const over = u > -0.2 && u < 1.2 && v > -0.35 && v < 1.2;
    const pouring = L.grab && over;
    L.tilt = approach(L.tilt, pouring ? 0.7 : 0, 8, dt);
    L.on = approach(L.on, pouring ? 1 : 0, 8, dt);

    if (pouring) {
      this.sheet.pour(clamp(u, 0.04, 0.96), clamp(v, 0.04, 0.96), dt, 3.4, 0.125);
      if (Math.random() < 0.75) {
        this.fx.spawn({
          x: mouth.x + (Math.random() - 0.5) * 34, y: mouth.y,
          vx: (Math.random() - 0.5) * 40, vy: 260 + Math.random() * 160,
          r: 7 + Math.random() * 9, kind: 'goo', max: 0.34, g: 900,
        });
      }
      sfx.loop('pour', true, { f: 420, q: 0.7, gain: 0.075, type: 'lowpass' });
    } else {
      sfx.loop('pour', false);
    }
    this.sheet.relax(dt, 2.4);
    const cov = this.sheet.coverage();
    L.load = clamp(1 - cov / TARGET.pour, 0.08, 1);
    this.p = clamp(cov / TARGET.pour, 0, 1);
    if (this.p >= 1) this.complete();
  }

  // 3. ならす
  up_spread(dt) {
    if (this.pointer.down) {
      const d = dist(this.pointer.x, this.pointer.y, this.pointer.px, this.pointer.py);
      const { u, v } = this.frameUV(this.pointer.x, this.pointer.y);
      if (u > -0.25 && u < 1.25 && v > -0.25 && v < 1.25) {
        this.sheet.spread(clamp(u, 0, 1), clamp(v, 0, 1), 0, 0, clamp(d * 0.05 + 0.012, 0, 0.35));
        if (d > 1.5) {
          sfx.loop('spread', true, { f: 320 + d * 8, q: 0.9, gain: clamp(d * 0.012, 0, 0.08), type: 'lowpass' });
          if (Math.random() < d * 0.03) sfx.squish(0.35);
        }
        // 網の下へ水が落ちる
        if (Math.random() < 0.4 + d * 0.02) {
          const b = this.sheetQ(Math.random(), 1);
          this.fx.drop(b.x + (Math.random() - 0.5) * 60, b.y + 6, (Math.random() - 0.5) * 30, 40, 3 + Math.random() * 3);
          if (Math.random() < 0.12) sfx.drip();
        }
      }
    } else sfx.loop('spread', false);
    this.sheet.relax(dt, 1.1);
    this.p = clamp(inv(0.25, TARGET.spread, this.sheet.evenness()), 0, 1);
    if (this.sheet.evenness() >= TARGET.spread) this.complete();
  }

  // 4. 水を抜く
  up_press(dt) {
    const S2 = this.sponge;
    if (this.pointer.down) { S2.tx = this.pointer.x; S2.ty = this.pointer.y - 40; }
    S2.x = approach(S2.x, S2.tx, 13, dt);
    S2.y = approach(S2.y, S2.ty, 13, dt);
    const want = this.pointer.down ? 1 : 0;
    S2.squash = approach(S2.squash, want, 12, dt);

    if (this.pointer.down) {
      const { u, v } = this.frameUV(S2.x, S2.y + 46);
      if (u > -0.25 && u < 1.25 && v > -0.25 && v < 1.25) {
        const sq = this.sheet.pressAt(clamp(u, 0, 1), clamp(v, 0, 1), 1.5 * dt, 0.3);
        if (sq > 0.0006) {
          // 端からにじみ出る水
          if (Math.random() < 0.9) {
            const side = Math.random() < 0.5 ? 0 : 1;
            const b = this.sheetQ(side ? 1.02 : -0.02, clamp(v + (Math.random() - 0.5) * 0.3, 0.05, 0.98));
            this.fx.drop(b.x, b.y, (side ? 1 : -1) * (40 + Math.random() * 90), -30 - Math.random() * 60, 4 + Math.random() * 4);
          }
          const bb = this.sheetQ(clamp(u, 0.05, 0.95), 1.01);
          if (Math.random() < 0.5) this.fx.drop(bb.x, bb.y, (Math.random() - 0.5) * 40, 30, 4);
          if (Math.random() < 0.09) sfx.drip();
        }
        sfx.loop('press', true, { f: 300, q: 0.8, gain: 0.06, type: 'lowpass' });
      }
    } else sfx.loop('press', false);

    this.p = clamp(inv(0.06, TARGET.press, 1 - this.sheet.avgWet()), 0, 1);
    if (1 - this.sheet.avgWet() >= TARGET.press) this.complete();
  }

  // 5. 乾かす
  up_dry(dt) {
    const lv = this.layout.lever;
    let pull = 0;
    if (this.pointer.down) {
      // 少しずれても吸着する: 画面のどこを触っていてもレバーは反応する
      const d = dist(this.pointer.x, this.pointer.y, lv.x, lv.y - 120);
      const near = clamp(1.25 - d / 620, 0.35, 1);
      pull = clamp((this.pointer.y - (lv.y - 150)) / 260, 0, 1) * near + 0.25 * near;
      pull = clamp(pull, 0, 1);
    }
    this.lever.pull = approach(this.lever.pull, pull, 9, dt);
    const power = this.lever.pull;
    if (power > 0.08) {
      this.sheet.dryStep(power * 0.19 * dt);
      // 湯気はシート面から立ちのぼる程度に。主役は色が濃くなる変化。
      if (Math.random() < power * 0.75) {
        const e = this.sheetQ(Math.random(), 0.15 + Math.random() * 0.7);
        this.fx.steam(e.x, e.y);
      }
      sfx.loop('fan', true, { f: 500 + power * 700, q: 0.6, gain: 0.02 + power * 0.075, type: 'bandpass' });
    } else sfx.loop('fan', false);
    this.p = this.sheet.dry;
    if (this.sheet.dry >= 0.999) this.complete();
  }

  // 6. ぺりっと剥がす（主役）
  up_peel(dt) {
    const P = this.peel;
    const fh = Math.abs(this.sheetQ(0, 1).y - this.sheetQ(0, 0).y);
    // 横画面は画面が低いので、必要なドラッグ量はシート高そのものより短くする。
    // 縦横どちらでも「画面のだいたい 1/5 を引く」で剥がし切れる。
    const need = fh * 0.62;
    if (P.grab) {
      P.fx = this.pointer.x; P.fy = this.pointer.y;
      const d = (P.base || 0) + dist(P.fx, P.fy, P.gx || P.fx, P.gy || P.fy);
      const stick = need * 0.05;   // 少し粘ってから、ぺりっと一段はがれる
      if (d > P.pull + stick) {
        const rate = need * 0.75;  // 一気に引いても最短 1.3 秒はかかる
        const step = Math.min(d - P.pull, rate * dt);
        P.pull += step;
        P.speed = clamp(step / dt / rate, 0, 1);
        sfx.crackle(P.speed);
        if (Math.random() < P.speed * 0.7) {
          const e = this.sheetQ(Math.random(), 1 - P.t);
          this.fx.flake(e.x, e.y);
        }
      } else {
        P.speed = approach(P.speed, 0, 6, dt);
      }
    } else {
      P.speed = approach(P.speed, 0, 6, dt);
    }
    P.t = clamp(P.pull / need, 0, 1);
    P.len = P.t * fh;   // 描画用の「剥がれた材料の長さ」
    this.p = P.t;
    if (P.t >= 0.995 && !P.done) {
      P.done = 1;
      sfx.peelPop();
      const c = this.frameCenter;
      for (let i = 0; i < 16; i++) this.fx.sparkle(c.x + (Math.random() - 0.5) * 340, c.y + (Math.random() - 0.5) * 220);
      this.beat = 0.5;
    }
    if (P.done) P.free = clamp(P.free + dt * 1.6, 0, 1);
  }

  // 7. これ知ってる！
  up_reveal(dt) {
    this.rt += dt;
    const t = this.rt;
    if (!this._chimed) this._chimed = {};
    const chimeOnce = (k, step) => { if (!this._chimed[k]) { this._chimed[k] = 1; sfx.chime(step); } };
    if (t > 1.9) chimeOnce('stack', 2);
    if (t > 3.6) chimeOnce('wrap', 4);
    if (t > 4.6) {
      chimeOnce('done', 5);
      const R = revealLayout(this.layout);
      if (Math.random() < 0.5) this.fx.sparkle(R.onigiri.x + (Math.random() - 0.5) * 300, R.onigiri.y + (Math.random() - 0.5) * 260);
    }
    if (t > 5.2) this.revealDone = true;
  }

  // 開発・検証用: 任意の工程の見た目をすぐ確認する
  debugJump(stage) {
    const made = this.made;
    this.reset(false);
    this.made = made;
    const sh = this.sheet;
    const put = (fn) => {
      for (let y = 0; y < 42; y++) for (let x = 0; x < 56; x++) fn(y * 56 + x, x / 56, y / 42);
    };
    const i = ORDER.indexOf(stage);
    if (i >= 2) put((k, u, v) => { sh.fill[k] = 0.55 + sh.mottle[k] * 0.9; });
    if (i >= 3) { put((k) => { sh.fill[k] = 1; }); }
    if (i >= 4) { put((k) => { sh.wet[k] = 0.08; sh.press[k] = 0.8; }); }
    if (i >= 5) { sh.dryStep(1); }
    this.stage = stage;
    this.frameIn = i >= 1 ? 1 : 0;
    this.introT = 99;
    this.persp = STAGE_LOOK[stage].persp;
    this.tilt = STAGE_LOOK[stage].tilt;
    if (stage === 'pour') { this.ladle.x = this.ladle.tx = this.layout.ladleHome.x; this.ladle.y = this.ladle.ty = this.layout.ladleHome.y; }
    if (stage === 'press') { this.sponge.x = this.sponge.tx = this.layout.press.x; this.sponge.y = this.sponge.ty = this.layout.press.y; }
    if (stage === 'reveal') { this.made++; this.rt = 0; }
    sh.buildTexture();
    this.snapCamera();
  }

  hintTarget() {
    const L = this.layout;
    switch (this.stage) {
      case 'mix': return { x: L.vat.x, y: L.vat.y, r: L.vat.rx * 0.55 };
      case 'pour': return { x: this.ladle.x, y: this.ladle.y, r: 110 };
      case 'spread': { const c = this.frameCenter; return { x: c.x, y: c.y, r: L.frame.w * 0.3 }; }
      case 'press': return { x: this.sponge.x, y: this.sponge.y, r: 130 };
      case 'dry': return { x: L.lever.x, y: L.lever.y - 150, r: 74 };
      case 'peel': { const c = this.sheetQ(0.5, 1.02); return { x: c.x, y: c.y, r: L.frame.w * 0.16 }; }
      default: return null;
    }
  }

  get hinting() { return this.idle > 2.2 && this.beat <= 0 && this.stage !== 'reveal'; }
  get wig() { return this.hinting ? Math.sin(this.time * 9) * smooth(inv(2.2, 2.9, this.idle)) : 0; }

  // 工房の背景をワールド座標で焼いたキャッシュ。向きが変わったときだけ作り直す。
  bgCache() {
    if (this._bg && this._bgKey === this.layout.mode) return this._bg;
    const X = -1400, Y = -1400, W = 2700, H = 2400, S_ = 0.5;
    const c = document.createElement('canvas');
    c.width = Math.round(W * S_); c.height = Math.round(H * S_);
    const x = c.getContext('2d');
    x.setTransform(S_, 0, 0, S_, -X * S_, -Y * S_);
    S.drawWorkshop(x, { x0: X, y0: Y, x1: X + W, y1: Y + H }, 0,
      this.layout.horizon, this.layout.props, true);
    this._bgKey = this.layout.mode;
    this._bg = { canvas: c, x: X, y: Y, w: W, h: H };
    return this._bg;
  }

  vignette() {
    if (this._vig) return this._vig;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 22, 64, 64, 82);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    this._vig = c;
    return c;
  }

  // ---- 描画 -----------------------------------------------------------
  render() {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b100e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.cam.scale * d, 0, 0, this.cam.scale * d,
      (this.sw / 2 - this.cam.x * this.cam.scale) * d,
      (this.sh / 2 - this.cam.y * this.cam.scale) * d);

    const view = this.view();
    // 背景は動かないので、ワールド空間に一度だけ焼いて毎フレーム貼るだけにする
    const bg = this.bgCache();
    ctx.drawImage(bg.canvas, bg.x, bg.y, bg.w, bg.h);
    // 周辺減光は小さな画像を引き伸ばして貼る（毎フレームのグラデ生成を避ける）
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.drawImage(this.vignette(), 0, 0, this.sw, this.sh);
    ctx.restore();

    const idx = ORDER.indexOf(this.stage);
    const wig = this.wig;

    // 桶
    if (idx <= 1) {
      const level = 1 - clamp(this.sheet.coverage() / TARGET.pour, 0, 1) * 0.28;
      ctx.save();
      if (this.stage === 'mix' && this.hinting) {
        ctx.translate(this.layout.vat.x, this.layout.vat.y);
        ctx.rotate(wig * 0.012);
        ctx.translate(-this.layout.vat.x, -this.layout.vat.y);
      }
      S.drawVat(ctx, this.layout.vat, this.time, this.swirl, level, this.mixed);
      ctx.restore();
    }

    // 抄き枠 + シート（リビールでは切り替えずに、枠が静かに消えていく）
    const revealFade = this.stage === 'reveal' ? smooth(inv(0.2, 1.4, this.rt)) : 0;
    if (this.frameIn > 0.01 && revealFade < 0.995) {
      const geo = { q: (u, v) => this.frameQ(u, v), w: this.layout.frame.w, h: this.layout.frame.h };
      ctx.save();
      if ((this.stage === 'spread' || this.stage === 'pour') && this.hinting) {
        const c = this.frameCenter;
        ctx.translate(c.x, c.y); ctx.rotate(wig * 0.008); ctx.scale(1 + wig * 0.006, 1 + wig * 0.006); ctx.translate(-c.x, -c.y);
      }
      ctx.globalAlpha = clamp(this.frameIn * 1.4, 0, 1) * (1 - revealFade);
      S.drawFrameBase(ctx, geo, this.time);
      if (this.stage !== 'reveal') this.drawSheet(ctx);
      S.drawFrameFront(ctx, geo);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // 道具
    if (this.stage === 'pour') {
      ctx.save();
      if (this.hinting) { ctx.translate(this.ladle.x, this.ladle.y); ctx.rotate(wig * 0.05); ctx.translate(-this.ladle.x, -this.ladle.y); }
      S.drawLadle(ctx, this.ladle.x, this.ladle.y, this.ladle.tilt, this.ladle.load);
      ctx.restore();
    }
    if (this.stage === 'press') {
      ctx.save();
      if (this.hinting) { ctx.translate(this.sponge.x, this.sponge.y); ctx.rotate(wig * 0.04); ctx.translate(-this.sponge.x, -this.sponge.y); }
      S.drawSponge(ctx, this.sponge.x, this.sponge.y, this.sponge.squash);
      ctx.restore();
    }
    if (this.stage === 'dry') {
      const lv = { x: this.layout.lever.x, y: this.layout.lever.y };
      ctx.save();
      if (this.hinting) { ctx.translate(lv.x, lv.y); ctx.rotate(wig * 0.03); ctx.translate(-lv.x, -lv.y); }
      S.drawFanAndLever(ctx, lv, this.layout.fan, this.lever.pull, this.lever.spin, this.lever.pull);
      ctx.restore();
      this.drawWind(ctx);
    }

    if (this.stage === 'reveal') this.drawReveal(ctx);

    this.fx.draw(ctx);
    if (this.hinting) this.drawHint(ctx);

    // HUD（スクリーン座標）
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.drawHud(ctx);
  }

  drawSheet(ctx) {
    const P = this.peel;
    const q = (u, v) => this.sheetQ(u, v);
    if (this.stage !== 'peel' || P.t <= 0.001) {
      this.sheet.drawFlat(ctx, q, 0, 1);
      if (this.stage === 'peel') this.drawTab(ctx);
      return;
    }
    const vf = 1 - P.t;
    if (vf > 0.002) this.sheet.drawFlat(ctx, q, 0, vf);

    // 剥離線のふち
    if (vf > 0.002 && P.t < 0.999) {
      const a = q(0, vf), b = q(1, vf);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(214,236,206,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const H = q(0.5, vf);
    // シートは伸びない: 自由端は「剥がれた長さ」までしか指について来ない
    const fdx = P.fx - H.x, fdy = P.fy - H.y;
    const fd = Math.max(1e-3, Math.hypot(fdx, fdy));
    const len = Math.max(P.len, 1);
    const reach = Math.min(fd, len * 0.9);   // 常に少したるませる = しなり
    // 指の向きを「真下」とみなす回転。行はこの空間の中では常に水平 = 割れない。
    const lean = Math.atan2(-fdx, fdy);
    const nearW = Math.abs(q(1, 1).x - q(0, 1).x);
    const curve = this.peelArc(reach, len, nearW);
    ctx.save();
    // 影は浮くほど大きくずれる = 高さの手がかり
    ctx.translate(H.x + 10 + 30 * P.t, H.y + 16 + 34 * P.t);
    ctx.rotate(lean);
    this.sheet.drawRibbon(ctx, vf, 1, curve, true);
    ctx.restore();
    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(lean);
    this.sheet.drawRibbon(ctx, vf, 1, curve, false);
    ctx.restore();
  }

  // つまむ場所を示す、少しめくれた角
  drawTab(ctx) {
    const a = this.sheetQ(0.28, 1), b = this.sheetQ(0.72, 1);
    const lift = 16 + this.wig * 6 + Math.sin(this.time * 2.4) * 4;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + 2);
    ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 24 - lift * 1.6, b.x, b.y + 2);
    ctx.quadraticCurveTo((a.x + b.x) / 2, a.y + 6 - lift * 0.4, a.x, a.y + 2);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, a.y - lift, 0, a.y + 20);
    g.addColorStop(0, '#3c4c38');
    g.addColorStop(1, '#16261b');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,206,170,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 剥がれた部分の形。
  // ヒンジを原点・指の方向を真下とするローカル空間で、円弧としてめくれを解く。
  // 長さ matLen の材料が弦 chord に収まるときの曲率半径 R を求め、
  //   y = R*sin(弧長/R),  面の向き = cos(弧長/R)
  // とする。たるむほど巻き込み、θが90°を超えると裏返って見える。
  peelArc(chord, matLen, widthNear) {
    const L = Math.max(1, matLen);
    const d = clamp(chord, 0, L * 0.999);
    // R*sin(L/R) = d を二分法で解く
    let lo = L / Math.PI * 1.0001, hi = Math.max(L * 40, d * 40 + L);
    for (let i = 0; i < 26; i++) {
      const mid = (lo + hi) / 2;
      if (mid * Math.sin(L / mid) < d) lo = mid; else hi = mid;
    }
    const R = (lo + hi) / 2;
    return (s) => {
      const th = (s * L) / R;
      return { x: 0, y: R * Math.sin(th), ang: 0, w: widthNear * (1 - 0.045 * s), face: Math.cos(th) };
    };
  }

  drawWind(ctx) {
    const power = this.lever.pull;
    if (power < 0.05) return;
    const f = this.layout.frame, fan = this.layout.fan;
    ctx.save();
    ctx.strokeStyle = `rgba(212,232,220,${0.10 + power * 0.16})`;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const dir = Math.sign(f.x - fan.x) || -1;
    for (let i = 0; i < 9; i++) {
      const ph = (this.time * (1.3 + power * 2.4) + i * 0.37) % 1;
      const y = fan.y - 130 + i * 32;
      const x0 = fan.x + dir * (60 + ph * 420);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * (0.4 + power * 0.6);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + dir * 90, y + Math.sin(ph * 8 + i) * 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawReveal(ctx) {
    const R = revealLayout(this.layout);
    const t = this.rt;
    // 手に持った海苔 → 重ねる
    const fly = smooth(inv(0.9, 2.0, t));
    const held = { x: lerp(R.hold.x, R.stack.x, fly), y: lerp(R.hold.y, R.stack.y - (this.made - 1) * 14, fly) };
    const scale = lerp(1, 0.52, fly);

    // 重ねた海苔
    // 置かれている感じを出す影
    ctx.beginPath();
    ctx.ellipse(R.stack.x, R.stack.y + R.sheetH * 0.58, R.sheetW * 0.56, R.sheetH * 0.1, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fill();
    // 工房に元からある数枚 + 自分が作った分
    const base = 2;
    for (let i = 0; i < base; i++) {
      S.drawNoriSheetIcon(ctx, R.stack.x - 10 + i * 9, R.stack.y + (base - i) * 15,
        R.sheetW, R.sheetH, (i % 2 ? 0.03 : -0.026), 1, 0.5);
    }
    const n = Math.max(0, Math.min(6, this.made - (fly < 1 ? 1 : 0)));
    for (let i = 0; i < n; i++) {
      const sx = R.stack.x + (i % 2) * 8 - 3, sy = R.stack.y - i * 14;
      const rot = (i % 2 ? 0.02 : -0.015);
      if (i === n - 1 && fly >= 1) {
        // 一番上は、いま自分が作った海苔そのもの
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(rot); ctx.translate(-sx, -sy);
        this.sheet.drawFlat(ctx, (u, v) => ({
          x: sx + (u - 0.5) * R.sheetW, y: sy + (v - 0.5) * R.sheetH,
        }), 0, 1);
        ctx.restore();
      } else {
        S.drawNoriSheetIcon(ctx, sx, sy, R.sheetW, R.sheetH, rot, 1, 0.5);
      }
    }

    // 今作った一枚（実物のテクスチャで）
    if (t < 2.05) {
      const w = R.sheetW * 1.5 * scale, h = R.sheetH * 1.5 * scale;
      const wob = Math.sin(t * 3) * (1 - fly) * 0.05;
      const q = (u, v) => ({
        x: held.x + (u - 0.5) * w + Math.sin(v * 3 + t * 2.4) * 8 * (1 - fly),
        y: held.y + (v - 0.5) * h + Math.sin(u * 3.2 + t * 2) * 7 * (1 - fly) + wob * 20,
      });
      this.sheet.drawFlat(ctx, q, 0, 1);
    }

    // おにぎり
    const rise = smooth(inv(2.2, 3.1, t));
    if (rise > 0) {
      const wrap = smooth(inv(3.1, 4.3, t));
      ctx.save();
      ctx.globalAlpha = rise;
      S.drawOnigiri(ctx, R.onigiri.x, R.onigiri.y + (1 - rise) * 220, R.onigiriS, wrap);
      ctx.restore();
      // 巻きに向かって飛ぶ海苔
      if (t > 3.0 && t < 3.5) {
        const k = inv(3.0, 3.5, t);
        S.drawNoriSheetIcon(ctx, lerp(R.stack.x, R.onigiri.x, k), lerp(R.stack.y, R.onigiri.y, k),
          R.sheetW * lerp(1, 0.8, k), R.sheetH * lerp(1, 0.8, k), lerp(0, 0.4, k), 1, 1);
      }
    }
    // お弁当
    const bento = smooth(inv(4.3, 5.2, t));
    if (bento > 0) S.drawBento(ctx, R.bento.x, R.bento.y, R.bentoS, bento);
  }

  drawHint(ctx) {
    const h = this.hintTarget();
    if (!h) return;
    const k = smooth(inv(2.2, 3.0, this.idle));
    const ph = (this.time * 0.9) % 1;
    ctx.save();
    ctx.globalAlpha = k * (1 - ph) * 0.85;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r * (0.55 + ph * 0.8), 0, TAU);
    ctx.strokeStyle = 'rgba(255,240,190,0.95)';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();

    // 指のアイコン
    ctx.save();
    ctx.globalAlpha = k * 0.9;
    const bob = Math.sin(this.time * 3.2) * h.r * 0.14;
    ctx.translate(h.x + h.r * 0.35, h.y + h.r * 0.5 + bob);
    const s = h.r * 0.02;
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,244,214,0.95)';
    ctx.strokeStyle = 'rgba(90,70,40,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.quadraticCurveTo(11, -46, 11, -30);
    ctx.lineTo(11, -6);
    ctx.quadraticCurveTo(30, -6, 30, 12);
    ctx.quadraticCurveTo(30, 46, 4, 46);
    ctx.quadraticCurveTo(-18, 46, -18, 18);
    ctx.lineTo(-18, -2);
    ctx.quadraticCurveTo(-11, -8, -11, 4);
    ctx.lineTo(-11, -30);
    ctx.quadraticCurveTo(-11, -46, 0, -46);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawHud(ctx) {
    const pad = Math.min(this.sw, this.sh) * 0.055 + 8;
    const r = this.hud * 0.42;
    const n = 6;
    const gap = r * 3.6;
    const cx = this.sw / 2, cy = pad;
    const cur = Math.min(ORDER.indexOf(this.stage), n - 1);
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * gap;
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, TAU);
      ctx.fillStyle = i < cur ? 'rgba(198,226,178,0.85)' : 'rgba(255,255,255,0.16)';
      ctx.fill();
      if (i === cur && this.stage !== 'reveal') {
        ctx.beginPath();
        ctx.arc(x, cy, r * 1.85, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.p, 0, 1));
        ctx.strokeStyle = 'rgba(255,232,168,0.95)';
        ctx.lineWidth = r * 0.7;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, TAU);
        ctx.fillStyle = 'rgba(255,232,168,0.95)';
        ctx.fill();
      }
      if (this.stage === 'reveal') {
        ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU);
        ctx.fillStyle = 'rgba(198,226,178,0.85)'; ctx.fill();
      }
    }

    if (this.stage === 'reveal' && this.revealDone) {
      const b = this.replayButton();
      const pulse = 1 + Math.sin(this.time * 3) * 0.045;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, TAU);
      const g = ctx.createLinearGradient(0, -b.r, 0, b.r);
      g.addColorStop(0, '#9fd67f');
      g.addColorStop(1, '#4f9d43');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = b.r * 0.09;
      ctx.stroke();
      // ぐるっと矢印
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 0.48, Math.PI * 0.72, Math.PI * 2.35);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = b.r * 0.16;
      ctx.lineCap = 'round';
      ctx.stroke();
      const a = Math.PI * 2.35;
      const ax = Math.cos(a) * b.r * 0.48, ay = Math.sin(a) * b.r * 0.48;
      ctx.beginPath();
      ctx.moveTo(ax + b.r * 0.02, ay - b.r * 0.2);
      ctx.lineTo(ax + b.r * 0.22, ay + b.r * 0.02);
      ctx.lineTo(ax - b.r * 0.14, ay + b.r * 0.14);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
  }
}

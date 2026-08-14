// The play loop, one stage at a time.
//
// Design rules that every stage obeys:
//   * one finger, nothing else
//   * no text, no timer, no fail state
//   * generous snapping — "close enough" always succeeds
//   * if the child hesitates, the next thing to touch wiggles
//   * the camera is never the child's problem; each stage requests a view

import {
  TAU, clamp, clamp01, lerp, invLerp, damp, easeOut, easeInOut, dist, rr,
} from './util.js';
import {
  W, RACK_HALF, BOARD_HALF, GUIDE, resetWorld, setMood, setStrandCount,
  relayout, morphTo, gust, askHint, clearHint,
} from './world.js';
import { camera, pointer } from './scene.js';
import { emit, ring, clearFx, clearRings } from './fx.js';
import { sfx, stretchStart, stretchUpdate, stretchStop } from './audio.js';

const HINT_AFTER = 2.4;   // seconds of hesitation before we nudge

let stages = [];
let index = 0;
let cur = null;
let t = 0;             // seconds inside the current stage
let advanceIn = -1;    // >0: counting down to the next stage
let listeners = [];

export function onStageChange(fn) { listeners.push(fn); }

function next(delay = 1.0, silent = false) {
  if (advanceIn >= 0) return;
  advanceIn = delay;
  if (!silent) sfx.stageClear();
  clearHint();
}

export function goTo(i) {
  index = clamp(i, 0, stages.length - 1);
  cur = stages[index];
  t = 0;
  advanceIn = -1;
  stretchStop();
  clearHint();
  cur.enter();
  listeners.forEach((fn) => fn(cur.id, index));
}

export function restart() {
  resetWorld();
  clearFx();
  clearRings();
  goTo(0);
}

export function currentStage() { return cur ? cur.id : ''; }
export function currentIndex() { return index; }
export function stageIds() { return stages.map((s) => s.id); }
export function stageTime() { return t; }

export function updateStages(dt) {
  if (!cur) return;
  t += dt;
  cur.update(dt);
  if (cur.view) cur.view();
  if (advanceIn >= 0) {
    advanceIn -= dt;
    if (advanceIn <= 0) {
      advanceIn = -1;
      if (index < stages.length - 1) goTo(index + 1);
    }
  }
}

export function pointerEvent(type) {
  if (cur && cur.pointer) cur.pointer(type);
}

/** Shown to the automated playthrough; also documents each stage's goal. */
export function autoPlan() {
  if (!cur || advanceIn >= 0) return null;
  return cur.plan ? cur.plan() : null;
}

// helper: soft "magnet" — a handle that eases toward the finger instead of
// snapping to it, so a stray touch never teleports anything.
function follow(objX, objY, tx, ty, dt, speed = 12) {
  return [damp(objX, tx, speed, dt), damp(objY, ty, speed, dt)];
}

function idleHint(x, y, kind = 'tap', ang = 0) {
  if (pointer.idle > HINT_AFTER && !pointer.down && advanceIn < 0) askHint(x, y, kind, ang);
  else clearHint();
}

// =====================================================================
// 1. まとめる — gather the scattered white lumps into one
// =====================================================================

const gather = {
  id: 'gather',
  enter() {
    setMood('shop');
    W.shopAlpha = 1;
    W.floorAlpha = 1;
    W.boardAlpha = 1;
    W.ball = { x: 0, y: 40, r: 40, squash: 0, alpha: 1, wob: 0 };
    W.blobs.length = 0;
    const rng = W.rng;
    for (let i = 0; i < 6; i++) {
      const a = -0.6 + (i / 6) * TAU + rr(rng, -0.18, 0.18);
      const d = rr(rng, 215, 300);
      W.blobs.push({
        x: Math.cos(a) * d,
        y: 40 + Math.sin(a) * d * 0.6,
        r: rr(rng, 34, 48),
        alpha: 1, squash: 0, seed: rr(rng, 0, 10),
        state: 'idle', t: 0, sx: 0, sy: 0, cx: 0, cy: 0,
      });
    }
    camera.fit(0, 40, 820, 820, true);
    this.merged = 0;
    this.celebrate = -1;
  },
  view() { camera.fit(0, 40, 820, 820); },
  grab() {
    for (const b of W.blobs) {
      if (b.state !== 'idle') continue;
      if (dist(pointer.x, pointer.y, b.x, b.y) < b.r + 90) {
        b.state = 'fly';
        b.t = 0;
        b.sx = b.x; b.sy = b.y;
        // arc the lump towards the ball so it feels thrown, not dragged
        const mx = (b.x + W.ball.x) / 2, my = (b.y + W.ball.y) / 2;
        b.cx = mx + (b.y - W.ball.y) * 0.28;
        b.cy = my - Math.abs(b.x - W.ball.x) * 0.22 - 60;
        ring(b.x, b.y, { color: '#fff6dd', r1: 130 });
        sfx.note(1 + (this.merged % 4), 0.1, 0, 0.35);
      }
    }
  },
  pointer(type) {
    if (type === 'down' || type === 'move') this.grab();
  },
  update(dt) {
    const ball = W.ball;
    ball.squash = damp(ball.squash, 0, 9, dt);

    for (const b of W.blobs) {
      if (b.state === 'fly') {
        b.t += dt / 0.42;
        const k = easeOut(clamp01(b.t));
        const ik = 1 - k;
        b.x = ik * ik * b.sx + 2 * ik * k * b.cx + k * k * ball.x;
        b.y = ik * ik * b.sy + 2 * ik * k * b.cy + k * k * ball.y;
        b.squash = Math.sin(k * Math.PI) * 0.16;
        if (b.t >= 1) {
          b.state = 'gone';
          b.alpha = 0;
          this.merged++;
          // volume-ish growth so the ball never balloons
          ball.r = Math.min(98, Math.sqrt(ball.r * ball.r + b.r * b.r * 0.78));
          ball.squash = 0.22;
          sfx.pop(this.merged);
          emit('dust', ball.x, ball.y + ball.r * 0.4, { count: 10, color: '#fffaf0', size: 6, speed: 130, life: 0.7 });
          ring(ball.x, ball.y, { color: '#ffffff', r1: ball.r * 2.4 });
          camera.kick(4);
        }
      }
    }

    if (this.merged >= 6 && this.celebrate < 0) {
      this.celebrate = 0;
      ball.squash = -0.3;
      emit('spark', ball.x, ball.y, { count: 16, color: '#fff3c4', size: 7, speed: 210, life: 0.9 });
      sfx.sparkle(4);
      next(1.1);
    }

    const left = W.blobs.find((b) => b.state === 'idle');
    if (left) idleHint(left.x, left.y, 'tap');
    else clearHint();
  },
  plan() {
    const b = W.blobs.find((x) => x.state === 'idle');
    return b ? { type: 'tap', x: b.x, y: b.y } : null;
  },
};

// =====================================================================
// 2. のばす① — pull the ball out into a long thick rope
// =====================================================================

const stretch1 = {
  id: 'stretch1',
  enter() {
    const r = W.rope;
    r.ax = W.ball.x; r.ay = W.ball.y;
    r.hx = W.ball.x + W.ball.r * 0.8; r.hy = W.ball.y;
    r.len = 0; r.thick = 78; r.alpha = 0; r.grabbed = false; r.coil = 0;
    this.startR = W.ball.r;
    this.moveT = 0;
    this.speed = 0;
  },
  view() {
    const p = clamp01(W.rope.len / W.rope.maxLen);
    const w = lerp(840, 1380, p);
    camera.fit(lerp(0, 140, p), 50, w, w * 0.9);
  },
  update(dt) {
    const r = W.rope;
    // slide the dough aside and swap the round board for the long worktop,
    // so there is room to pull without anything running off the screen
    this.moveT = clamp01(this.moveT + dt / 0.7);
    const k = easeInOut(this.moveT);
    W.boardAlpha = damp(W.boardAlpha, 0, 3.2, dt);
    W.floorY = damp(W.floorY, 175, 2.6, dt);
    W.ball.x = lerp(0, -300, k);
    W.ball.y = W.floorY - W.ball.r * 0.5;
    r.ax = W.ball.x; r.ay = W.ball.y;
    if (this.moveT > 0.45) r.alpha = damp(r.alpha, 1, 6, dt);

    const p = clamp01(r.len / r.maxLen);
    W.ball.r = lerp(this.startR, 42, p);
    r.thick = lerp(78, 34, p);

    if (r.grabbed && pointer.down) {
      const tx = clamp(pointer.x, r.ax + 60, r.ax + r.maxLen + 120);
      const ty = clamp(pointer.y, r.ay - 230, r.ay + 260);
      const before = r.hx;
      [r.hx, r.hy] = follow(r.hx, r.hy, tx, ty, dt, 11);
      this.speed = damp(this.speed, Math.abs(r.hx - before) / Math.max(dt, 0.001) / 700, 8, dt);
      // length only ever grows: pulling can never be undone
      r.len = Math.max(r.len, r.hx - r.ax - 60);
      if (this.speed > 0.06 && Math.random() < 0.5) {
        emit('dust', r.hx, r.hy, { count: 1, color: '#fff6e2', size: 5, speed: 90, life: 0.6 });
      }
      stretchUpdate(clamp01(r.len / r.maxLen), this.speed);
    } else {
      this.speed = damp(this.speed, 0, 6, dt);
    }

    if (r.len >= r.maxLen && advanceIn < 0) {
      stretchStop();
      emit('spark', r.hx, r.hy, { count: 12, color: '#fff3c4', size: 6, speed: 200, life: 0.8 });
      sfx.sparkle(3);
      next(0.9);
    }

    idleHint(r.hx, r.hy, 'drag', 0);
  },
  pointer(type) {
    const r = W.rope;
    if (type === 'down' && r.alpha > 0.3) {
      // anywhere on screen counts as grabbing the tip: no aiming needed
      r.grabbed = true;
      stretchStart();
      ring(r.hx, r.hy, { color: '#ffffff', r1: 120 });
    } else if (type === 'up') {
      r.grabbed = false;
      stretchStop();
    }
  },
  plan() {
    const r = W.rope;
    return { type: 'drag', x0: r.hx, y0: r.hy, x1: Math.min(r.ax + r.maxLen + 110, r.hx + 320), y1: r.hy - 10, dur: 0.55 };
  },
};

// =====================================================================
// 3. 棒へかける — drape the rope over the rods
// =====================================================================

const HANG_X = 0, HANG_Y = -238;

const hang = {
  id: 'hang',
  enter() {
    W.rack.rodTopY = -300;
    W.rack.rodBotY = -180;
    W.baseThick = 30;
    this.phase = 'drag';
    this.windT = 0;
    this.spawned = 0;
    camera.fit(0, -140, 880, 880);
  },
  view() { camera.fit(0, -140, 880, 880); },
  update(dt) {
    W.rack.alpha = damp(W.rack.alpha, 1, 3.5, dt);
    W.boardAlpha = damp(W.boardAlpha, 0, 2.5, dt);
    W.floorY = damp(W.floorY, 720, 2.2, dt);
    const r = W.rope;

    if (this.phase === 'drag') {
      if (r.grabbed && pointer.down) {
        [r.hx, r.hy] = follow(r.hx, r.hy, pointer.x, pointer.y, dt, 13);
        r.len = Math.max(r.len, dist(r.ax, r.ay, r.hx, r.hy) - 60);
      }
      if (dist(r.hx, r.hy, HANG_X, HANG_Y) < 250) {
        this.phase = 'wind';
        r.grabbed = false;
        stretchStop();
        sfx.knock();
        camera.kick(9);
        ring(HANG_X, HANG_Y, { color: '#ffe9ae', r1: 220, width: 10 });
        emit('dust', HANG_X, HANG_Y, { count: 14, color: '#fff6e2', size: 6, speed: 180, life: 0.8 });
      }
      idleHint(HANG_X, HANG_Y, 'drag', Math.atan2(HANG_Y - r.hy, HANG_X - r.hx));
    } else if (this.phase === 'wind') {
      // the rope folds back and forth between the two rods
      this.windT += dt;
      r.coil = damp(r.coil, 1, 6, dt);
      const want = Math.min(10, Math.floor(this.windT / 0.13));
      while (this.spawned < want) {
        this.spawned++;
        setStrandCount(this.spawned);
        const s = W.strands[this.spawned - 1];
        s.thick = W.baseThick;
        sfx.note(1 + (this.spawned % 5), 0.09, 0, 0.45);
      }
      const k = this.spawned / 10;
      r.alpha = damp(r.alpha, 1 - k, 5, dt);
      W.ball.alpha = damp(W.ball.alpha, 1 - k, 5, dt);
      W.ball.r = damp(W.ball.r, 6, 3, dt);
      // the tip travels along the rods while it winds
      r.hx = lerp(r.hx, HANG_X + Math.sin(this.windT * 7) * 200, 1 - Math.exp(-8 * dt));
      r.hy = damp(r.hy, HANG_Y, 8, dt);
      if (this.spawned >= 10 && advanceIn < 0) {
        r.alpha = 0;
        W.ball.alpha = 0;
        next(0.8);
      }
      clearHint();
    }
  },
  pointer(type) {
    const r = W.rope;
    if (this.phase !== 'drag') return;
    if (type === 'down') {
      r.grabbed = true;
      stretchStart();
    } else if (type === 'up') {
      r.grabbed = false;
      stretchStop();
    }
  },
  plan() {
    if (this.phase !== 'drag') return null;
    const r = W.rope;
    return { type: 'drag', x0: r.hx, y0: r.hy, x1: HANG_X, y1: HANG_Y, dur: 0.8 };
  },
};

// =====================================================================
// 4. のばす② — pull the bottom rod down; thin, long, and many
// =====================================================================

const ROD_TOP = 40, ROD_MAX = 620;

const stretch2 = {
  id: 'stretch2',
  enter() {
    this.phase = 'intro';
    this.introT = 0;
    this.startY = W.rack.rodBotY;
    this.speed = 0;
    this.lastCount = W.strands.length;
  },
  view() {
    const p = W.stretch;
    camera.fit(0, lerp(-60, 175, p), lerp(950, 1400, p), lerp(950, 1400, p));
  },
  update(dt) {
    const rk = W.rack;

    if (this.phase === 'intro') {
      this.introT = clamp01(this.introT + dt / 1.0);
      rk.rodBotY = lerp(this.startY, ROD_TOP, easeInOut(this.introT));
      if (this.introT >= 1) this.phase = 'pull';
    } else {
      if (rk.grabbed && pointer.down) {
        const ty = clamp(pointer.y, ROD_TOP, ROD_MAX);
        const before = rk.rodBotY;
        rk.rodBotY = Math.max(rk.rodBotY, damp(rk.rodBotY, ty, 10, dt));
        this.speed = damp(this.speed, Math.abs(rk.rodBotY - before) / Math.max(dt, 0.001) / 600, 8, dt);
        if (this.speed > 0.05 && Math.random() < 0.6) {
          emit('dust', rr(W.rng, -RACK_HALF, RACK_HALF), rk.rodBotY - 20, {
            count: 1, color: '#fff8ec', size: 4, speed: 60, life: 0.9,
          });
        }
        stretchUpdate(W.stretch, this.speed);
      } else {
        this.speed = damp(this.speed, 0, 6, dt);
      }

      W.stretch = clamp01(invLerp(ROD_TOP, ROD_MAX, rk.rodBotY));
      W.baseThick = lerp(30, 6.5, W.stretch);
      W.backRacks = damp(W.backRacks, W.stretch > 0.3 ? 1 : 0, 2.2, dt);

      // more strands appear as the dough thins — the "wow, so many" beat
      const want = Math.round(lerp(10, 44, W.stretch));
      if (want > this.lastCount) {
        setStrandCount(want);
        relayout();
        for (const s of W.strands) if (s.birth < 0.02) s.thick = W.baseThick;
        sfx.note(2 + (want % 6), 0.06, 0, 0.4);
        this.lastCount = want;
      }

      if (W.stretch >= 0.999 && advanceIn < 0) {
        stretchStop();
        sfx.shara(7, 3, 0.05, 0.11);
        emit('spark', 0, rk.rodBotY - 60, { count: 20, color: '#fff6d0', size: 6, speed: 260, life: 1.0, spread: 320 });
        next(1.0);
      }

      idleHint(0, rk.rodBotY, 'drag', Math.PI / 2);
    }
  },
  pointer(type) {
    if (this.phase !== 'pull') return;
    const rk = W.rack;
    if (type === 'down') {
      // anywhere below the top rod counts — no aiming required
      if (pointer.y > rk.rodTopY + 60) {
        rk.grabbed = true;
        stretchStart();
        ring(0, rk.rodBotY, { color: '#ffffff', r1: 200, width: 8 });
      }
    } else if (type === 'up') {
      rk.grabbed = false;
      stretchStop();
    }
  },
  plan() {
    if (this.phase !== 'pull') return null;
    const y = W.rack.rodBotY;
    return { type: 'drag', x0: 0, y0: y, x1: 0, y1: Math.min(ROD_MAX + 30, y + 210), dur: 0.5 };
  },
};

// =====================================================================
// 5. 箸分け — run the stick through; the strands go "しゃらら"
// =====================================================================

const COMB_A = -RACK_HALF - 130;
const COMB_B = RACK_HALF + 110;

const align = {
  id: 'align',
  enter() {
    W.comb = COMB_A;
    this.max = COMB_A;
    this.grabbed = false;
    this.chime = 0;
    this.alignedCount = 0;
    camera.fit(0, 175, 1400, 1400);
  },
  view() { camera.fit(0, 175, 1400, 1400); },
  update(dt) {
    W.combAlpha = damp(W.combAlpha, 1, 4, dt);

    if (this.grabbed && pointer.down) {
      W.comb = damp(W.comb, clamp(pointer.x, COMB_A, COMB_B), 13, dt);
    }
    this.max = Math.max(this.max, W.comb);
    W.combDone = clamp01(invLerp(COMB_A, COMB_B - 40, this.max));

    this.chime -= dt;
    for (const s of W.strands) {
      if (!s.aligned && s.lat <= this.max) {
        s.aligned = true;
        this.alignedCount++;
        if (this.chime <= 0) {
          sfx.note(2 + (this.alignedCount % 7), 0.1, 0, 0.85);
          this.chime = 0.045;
        }
        emit('spark', s.lat, W.rack.rodTopY + (W.rack.rodBotY - W.rack.rodTopY) * 0.42, {
          count: 1, color: '#ffffff', size: 4, speed: 60, life: 0.5,
        });
      }
      if (s.aligned) {
        s.xTop = damp(s.xTop, s.lat, 7, dt);
        s.xBot = damp(s.xBot, s.lat, 6, dt);
        s.tangleAmp = damp(s.tangleAmp, 0, 6, dt);
      }
    }

    if (W.combDone >= 0.999 && advanceIn < 0) {
      sfx.shara(9, 2, 0.05, 0.12);
      emit('spark', 0, 190, { count: 26, color: '#ffffff', size: 5, speed: 300, life: 1.1, spread: 340 });
      gust(0.55, -RACK_HALF);
      next(1.3);
    }

    idleHint(W.comb, W.rack.rodTopY + (W.rack.rodBotY - W.rack.rodTopY) * 0.34 + 125, 'drag', 0);
  },
  pointer(type) {
    if (type === 'down') {
      this.grabbed = true;
      ring(W.comb, W.rack.rodTopY + 260, { color: '#ffffff', r1: 150 });
    } else if (type === 'up') {
      this.grabbed = false;
    }
  },
  plan() {
    const y = W.rack.rodTopY + (W.rack.rodBotY - W.rack.rodTopY) * 0.34 + 125;
    return { type: 'drag', x0: W.comb, y0: y, x1: COMB_B, y1: y, dur: 1.5 };
  },
};

// =====================================================================
// 6. 乾燥 — swipe up a breeze; the noodles turn bright white
// =====================================================================

const dry = {
  id: 'dry',
  enter() {
    setMood('outdoor');
    W.backRacks = 1;
    this.accum = 0;
    this.gusts = 0;
    this.cool = 0;
    camera.fit(0, 140, 1560, 1560);
  },
  view() { camera.fit(0, 140, 1560, 1560); },
  update(dt) {
    W.combAlpha = damp(W.combAlpha, 0, 3, dt);
    W.floorAlpha = damp(W.floorAlpha, 0, 2, dt);
    W.shopAlpha = damp(W.shopAlpha, 0, 2.4, dt);

    // One swipe = one gust. Without the cooldown a single long drag would
    // dry everything at once and the stage would be over before it started.
    this.cool = Math.max(0, this.cool - dt);
    if (pointer.down) {
      this.accum += Math.abs(pointer.dx) + Math.abs(pointer.dy) * 0.4;
      if (this.accum > 190 && this.cool <= 0) {
        this.accum = 0;
        this.cool = 0.7;
        this.blow();
      }
    }

    if (W.dryness >= 0.999 && advanceIn < 0) {
      sfx.sparkle(6);
      emit('spark', 0, 120, { count: 24, color: '#ffffff', size: 6, speed: 260, life: 1.1, spread: 400 });
      next(1.3);
    }

    idleHint(0, 240, 'drag', 0);
  },
  blow() {
    this.gusts++;
    const from = this.gusts % 2 ? -RACK_HALF - 200 : RACK_HALF + 200;
    gust(1, from);
    W.dryness = clamp01(W.dryness + 0.2);
    sfx.whoosh(1);
    sfx.shara(4, 4, 0.06, 0.07);
    emit('dust', rr(W.rng, -300, 300), rr(W.rng, 0, 300), {
      count: 6, color: '#ffffff', size: 5, speed: 260, life: 1.1, angle: this.gusts % 2 ? 0 : Math.PI, arc: 0.5,
    });
    camera.kick(3);
  },
  pointer(type) {
    if (type === 'up' && pointer.moved > 60 && this.accum > 40 && this.cool <= 0) {
      this.accum = 0;
      this.cool = 0.5;
      this.blow();
    }
  },
  plan() {
    const dir = (this.gusts || 0) % 2 ? -1 : 1;
    return { type: 'drag', x0: -520 * dir, y0: 240, x1: 520 * dir, y1: 210, dur: 0.35 };
  },
};

// =====================================================================
// 7. 切る — trim both ends so every noodle is the same length
// =====================================================================

const cut = {
  id: 'cut',
  enter() {
    this.phase = 'morph';
    setMood('table');
    morphTo('board', 1 / 1.3);
    for (const s of W.strands) { s.tangleAmp = 0; s.sway = 0; }
    camera.fit(0, 0, 1180, 1180);
  },
  view() { camera.fit(0, 0, 1180, 1180); },
  update(dt) {
    W.rack.alpha = damp(W.rack.alpha, 0, 3, dt);
    W.backRacks = damp(W.backRacks, 0, 3, dt);
    W.floorAlpha = damp(W.floorAlpha, 1, 2.4, dt);
    W.shopAlpha = damp(W.shopAlpha, 1, 2.4, dt);
    W.floorY = damp(W.floorY, 330, 2.4, dt);
    W.cutBoardAlpha = damp(W.cutBoardAlpha, 1, 3, dt);

    if (this.phase === 'morph') {
      if (W.layout.t >= 1) {
        this.phase = 'cut';
        sfx.note(4, 0.1);
      }
      return;
    }

    W.cut.guides = damp(W.cut.guides, W.cut.left && W.cut.right ? 0 : 1, 4, dt);

    if (pointer.down && pointer.moved > 40) {
      this.tryCut(pointer.x);
    }

    if (W.cut.left && W.cut.right && advanceIn < 0) {
      sfx.sparkle(3);
      next(1.1);
    }

    if (!W.cut.left) idleHint(-GUIDE, 0, 'drag', Math.PI / 2);
    else if (!W.cut.right) idleHint(GUIDE, 0, 'drag', Math.PI / 2);
    else clearHint();
  },
  tryCut(x) {
    if (!W.cut.left && Math.abs(x + GUIDE) < 235) this.doCut('left');
    else if (!W.cut.right && Math.abs(x - GUIDE) < 235) this.doCut('right');
  },
  doCut(side) {
    const left = side === 'left';
    W.cut[side] = true;
    W.cut[left ? 'flashL' : 'flashR'] = 1;
    sfx.cut();
    camera.kick(8);
    const gx = left ? -GUIDE : GUIDE;
    emit('crumb', gx, 0, { count: 14, color: '#fdf6e6', size: 5, speed: 240, life: 0.9, spread: 160 });
    ring(gx, 0, { color: '#ffffff', r1: 220, width: 9 });

    let maxExtra = 0;
    for (const s of W.strands) {
      const xa = -BOARD_HALF - s.extraL;
      const xb = BOARD_HALF + s.extraR;
      const u = clamp01(invLerp(xa, xb, gx));
      if (left) { s.visA = u; maxExtra = Math.max(maxExtra, -GUIDE - xa); }
      else { s.visB = u; maxExtra = Math.max(maxExtra, xb - GUIDE); }
    }
    W.offcuts.push({
      x: gx + (left ? -maxExtra / 2 : maxExtra / 2),
      y: 0,
      w: Math.max(24, maxExtra / 2),
      h: 168,
      rows: Math.max(4, Math.round(W.strands.length / 3)),
      thick: W.baseThick,
      vx: left ? -170 : 170,
      vy: -180,
      rot: 0,
      spin: left ? -1.9 : 1.9,
      t: 0,
    });
  },
  pointer(type) {
    if (type === 'up' && pointer.moved < 30) this.tryCut(pointer.x);
    if (type === 'down') this.tryCut(pointer.x);
  },
  plan() {
    if (this.phase !== 'cut') return null;
    const gx = !W.cut.left ? -GUIDE : GUIDE;
    return { type: 'drag', x0: gx, y0: -270, x1: gx, y1: 270, dur: 0.35 };
  },
};

// =====================================================================
// 8. 束ねる — wrap the band; the pile becomes a familiar bundle
// =====================================================================

const bundle = {
  id: 'bundle',
  enter() {
    morphTo('bundle', 1 / 0.9);
    W.band.x = 0; W.band.y = 330; W.band.on = false; W.band.t = 0; W.band.alpha = 0;
    this.grabbed = false;
    this.doneT = -1;
    camera.fit(0, 60, 950, 950);
  },
  view() { camera.fit(0, W.band.on ? 10 : 60, W.band.on ? 800 : 960, W.band.on ? 800 : 960); },
  update(dt) {
    W.cut.guides = damp(W.cut.guides, 0, 5, dt);
    W.band.alpha = damp(W.band.alpha, 1, 3.5, dt);

    if (!W.band.on) {
      if (this.grabbed && pointer.down) {
        W.band.x = damp(W.band.x, clamp(pointer.x, -460, 460), 13, dt);
        W.band.y = damp(W.band.y, clamp(pointer.y, -260, 420), 13, dt);
      }
      if (dist(W.band.x, W.band.y, 0, 0) < 210) {
        W.band.on = true;
        this.grabbed = false;
        sfx.cinch();
        camera.kick(7);
        ring(0, 0, { color: '#ffd9c8', r1: 260, width: 10 });
        emit('spark', 0, 0, { count: 14, color: '#fff0d8', size: 6, speed: 220, life: 0.9, spread: 120 });
      }
      idleHint(W.band.x, W.band.y, 'drag', -Math.PI / 2);
    } else {
      W.band.t = clamp01(W.band.t + dt / 0.75);
      W.bundle.rot = damp(W.bundle.rot, -0.08, 3, dt);
      clearHint();
      if (W.band.t >= 1 && this.doneT < 0) {
        this.doneT = 0;
        sfx.sparkle(5);
        emit('spark', 0, 0, { count: 18, color: '#ffffff', size: 6, speed: 250, life: 1.0, spread: 260 });
        next(1.4);
      }
    }
  },
  pointer(type) {
    if (W.band.on) return;
    if (type === 'down') this.grabbed = true;
    if (type === 'up') this.grabbed = false;
  },
  plan() {
    if (W.band.on) return null;
    return { type: 'drag', x0: W.band.x, y0: W.band.y, x1: 0, y1: 10, dur: 0.7 };
  },
};

// =====================================================================
// 9. リビール — "…so THAT's what it was!"
// =====================================================================

const reveal = {
  id: 'reveal',
  enter() {
    W.reveal.t = 0;
    W.replay = 0;
    this.bubbleT = 0;
    this.steamT = 0;
    this.fired = {};
    camera.fit(0, 0, 760, 760);
  },
  update(dt) {
    const R = W.reveal;
    R.t += dt;
    const T = R.t;
    clearHint();

    // --- beat 1: the finished bundle, alone in a warm spotlight
    if (T < 1.5) {
      W.spotlight = damp(W.spotlight, 0.55, 2.2, dt);
      W.glow = damp(W.glow, 1, 2, dt);
      camera.fit(0, 0, lerp(760, 640, clamp01(T / 1.5)), lerp(760, 640, clamp01(T / 1.5)));
      W.bundle.rot = damp(W.bundle.rot, -0.1 + Math.sin(T * 1.2) * 0.03, 3, dt);
    }

    // --- beat 2: it drops into the pot
    if (T >= 1.5) {
      once(this, 'drop', () => {
        setMood('dark');
        sfx.whoosh(1.2);
        camera.fit(0, 60, 1000, 1000);
      });
      const k = clamp01((T - 1.5) / 0.6);
      W.strandOffsetY = lerp(0, 620, easeIn3(k));
      W.strandAlpha = 1 - clamp01((T - 1.9) / 0.35);
      W.band.alpha = W.strandAlpha;
      W.glow = damp(W.glow, 0, 3, dt);
      W.cutBoardAlpha = damp(W.cutBoardAlpha, 0, 4, dt);
      // dim the workshop so only the pot is lit
      W.floorAlpha = damp(W.floorAlpha, 0, 2.5, dt);
      W.shopAlpha = damp(W.shopAlpha, 0, 2.5, dt);
    }
    if (T >= 1.75 && T < 4.7) {
      W.potA = damp(W.potA, 1, 4, dt);
      once(this, 'boil', () => { sfx.boil(); camera.kick(9); });
    }
    if (T >= 2.2 && T < 4.3) {
      W.boilA = damp(W.boilA, 1, 3, dt);
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) {
        this.bubbleT = 0.09;
        emit('bubble', rr(W.rng, -280, 280), 60, { count: 1, color: '#ffffff', size: 9, life: 0.8, speed: 20 });
        emit('steam', rr(W.rng, -240, 240), 20, { count: 1, color: '#ffffff', size: 16, life: 1.6, speed: 30 });
      }
    }

    // --- beat 3: steam swallows the screen
    if (T >= 3.9 && T < 4.7) {
      W.steamA = clamp01((T - 3.9) / 0.7);
    }
    if (T >= 3.9 && T < 5.0) {
      this.steamT -= dt;
      if (this.steamT <= 0) {
        this.steamT = 0.03;
        emit('steam', rr(W.rng, -420, 420), rr(W.rng, -80, 120), {
          count: 1, color: '#ffffff', size: 26, life: 1.8, speed: 60,
        });
      }
    }

    // --- beat 4: THE reveal
    if (T >= 4.7) {
      once(this, 'bowl', () => {
        setMood('summer');
        W.potA = 0; W.boilA = 0;
        W.flash = 0.95;
        camera.fit(0, 230, 900, 900, true);
        sfx.furin();
        sfx.fanfare();
        for (let i = 0; i < 3; i++) {
          emit('star', rr(W.rng, -400, 400), rr(W.rng, -200, 200), {
            count: 8, color: '#fff6c8', size: 8, speed: 180, life: 1.4, spread: 200,
          });
        }
      });
      W.spotlight = damp(W.spotlight, 0, 2.4, dt);
      W.steamA = damp(W.steamA, 0, 2.2, dt);
      W.bowlA = damp(W.bowlA, 1, 2.6, dt);
      W.beams = damp(W.beams, 1, 1.6, dt);
    }

    // --- beat 5: settle, sparkle, invite another go
    if (T >= 5.6) {
      camera.fit(0, 240, 1080, 1080);
      if (Math.random() < dt * 4) {
        emit('star', rr(W.rng, -520, 520), rr(W.rng, -300, 240), {
          count: 1, color: '#ffffff', size: 7, speed: 40, life: 1.4,
        });
      }
      once(this, 'chime2', () => sfx.sparkle(5), 6.4);
    }
    if (T >= 6.6) {
      W.replay = damp(W.replay, 1, 2.4, dt);
      W.done = true;
    }
  },
  pointer(type) {
    if (type === 'down' && W.replay > 0.6) {
      // handled by main (needs screen-space hit test)
    }
  },
  plan() { return null; },
};

function easeIn3(t) { return t * t * t; }
function once(obj, key, fn, at = 0) {
  if (!obj.fired) obj.fired = {};
  if (obj.fired[key]) return;
  if (W.reveal.t < at) return;
  obj.fired[key] = true;
  fn();
}

stages = [gather, stretch1, hang, stretch2, align, dry, cut, bundle, reveal];

export function initStages() {
  resetWorld();
  goTo(0);
}

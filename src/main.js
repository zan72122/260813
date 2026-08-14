// 「あまいひみつ」— 正体を最後まで隠すプリン工房
// 文字なし・タイマーなし・点数なし・ゲームオーバーなし。
import { TAU, clamp, lerp, smooth, damp } from './util.js';
import { View } from './view.js';
import { Input } from './input.js';
import * as A from './art.js';
import { STAGES, STAGE_INDEX } from './stages.js';
import { initAudio, sfx, stopAllLoops, setMuted, isMuted } from './audio.js';

const FAST = /[?&]fast=1/.test(location.search) || window.__E2E_FAST === true;

const canvas = document.getElementById('stage');
const view = new View(canvas);
const input = new Input(canvas);

// --- ゲーム状態 -------------------------------------------------------------
const g = {
  puffs: [],
  sparks: [],
  amber: 0,
  flame: 0,
  caramelInMold: 0,
  custardInMold: 0,
  mixed: 0,
  cold: 0,
  frost: 0,
  shake: 0,
  wobble: 0,
  phase: 0,
  squash: 0,
  caramelFlow: 0,
  moldRise: 0,
  stick: 0,
  recap: 0,
  pulse: 0,
};

const app = {
  mode: 'title', // 'title' | 'play'
  stage: 0,
  phase: 'play', // 'play' | 'outro'
  t: 0,
  outroT: 0,
  progress: 0,
  time: 0,
  buttons: [],
  fade: 0,
};

function safeInsets() {
  const el = document.getElementById('safe');
  if (!el) return { top: 0, bottom: 0 };
  const cs = getComputedStyle(el);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
  };
}

function resetGame() {
  Object.assign(g, {
    puffs: [],
    sparks: [],
    amber: 0,
    flame: 0,
    caramelInMold: 0,
    custardInMold: 0,
    mixed: 0,
    cold: 0,
    frost: 0,
    shake: 0,
    wobble: 0,
    phase: 0,
    squash: 0,
    caramelFlow: 0,
    moldRise: 0,
    stick: 0,
    recap: 0,
    released: false,
    cooked: 0,
    flip: 0,
    lift: 0,
  });
  stopAllLoops();
  app.stage = 0;
  app.phase = 'play';
  app.t = 0;
  app.outroT = 0;
  app.progress = 0;
  STAGES[0].enter(g, view);
  applyCamera(true);
}

function gotoStage(i, snapCam = false) {
  app.stage = i;
  app.phase = 'play';
  app.t = 0;
  app.outroT = 0;
  app.progress = 0;
  input.travel = 0;
  stopAllLoops(); // 前の工程の環境音を持ち越さない
  STAGES[i].enter(g, view);
  applyCamera(snapCam);
}

function applyCamera(snap = false) {
  const st = STAGES[app.stage];
  const target = st.cam(view);
  if (st.camDynamic) st.camDynamic(target, g);
  view.setTarget(target);
  if (snap) {
    view.snapToTarget();
    view.recompute();
  }
}

// --- リプレイ ---------------------------------------------------------------
function replayDemold() {
  sfx.tap();
  const i = STAGE_INDEX.demold;
  const keepFlow = g.caramelFlow;
  gotoStage(i);
  g.moldRise = 150;
  g.caramelFlow = keepFlow;
  g.recap = 1.0;
  g.wobble = 0;
  view.snapToTarget();
}

function restartAll() {
  sfx.tap();
  resetGame();
}

// --- 入力ハンドリング -------------------------------------------------------
function handleTap() {
  initAudio();
  for (const b of app.buttons) {
    if (Math.hypot(input.x - b.x, input.y - b.y) <= b.r * 1.35) {
      b.action();
      return true;
    }
  }
  if (app.mode === 'title') {
    sfx.chime();
    app.mode = 'play';
    resetGame();
    return true;
  }
  return false;
}

// --- ループ -----------------------------------------------------------------
let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 1 / 60;
  dt = Math.min(dt, 1 / 20); // タブ復帰などで飛ばない
  app.time += dt;
  view.time = app.time;

  if (view.resize(FAST)) {
    A.clearGradientCache();
    if (app.mode === 'play') applyCamera(true);
  }

  input.beginFrame(dt);
  if (input.tapped) handleTap();

  if (app.mode === 'title') {
    updateTitle(dt);
  } else {
    updatePlay(dt);
  }

  input.endFrame();
  requestAnimationFrame(frame);
}

function updateTitle(dt) {
  app.buttons.length = 0;
  view.setTarget({ x: 0, y: 46, w: 420, h: 160, k: 0.42, anchor: view.portrait ? 0.46 : 0.44 });
  view.update(dt);
  A.background(view.ctx, view, 0);
  const ctx = view.world();
  A.ground(ctx, view, 0, 0, 62, 0.4);
  A.mold(ctx, view, { x: 0, base: 0, open: true });
  A.pot(ctx, view, { x: -128, base: 8, liquid: 0.4, color: '#f2efe4', time: app.time });
  A.bowl(ctx, view, { x: 130, base: 0, liquid: 0.5, mixed: 1 });

  // ふわっと光る「触ってね」の手（型を隠さない位置に置く）
  const c = view.begin();
  const pulse = 0.5 + 0.5 * Math.sin(app.time * 2.4);
  const p = view.toScreen(0, 0);
  const hy = Math.min(view.h - 90, p.y + view.h * 0.16);
  c.save();
  c.beginPath();
  c.arc(p.x, hy, 44 + pulse * 14, 0, TAU);
  c.fillStyle = `rgba(255,255,255,${0.12 + pulse * 0.16})`;
  c.fill();
  c.restore();
  A.handIcon(c, p.x + 14, hy + 12, 1.25 + pulse * 0.1, 0.15, 0.95);
  drawMuteButton(c);
}

function updatePlay(dt) {
  const st = STAGES[app.stage];

  // 停滞したときの自動アシスト（詰まらせない）
  const assistAfter = st.id === 'demold' ? 26 : 16;
  if (app.phase === 'play' && g.gesture && input.idle > assistAfter && g.gesture.nudge) {
    g.gesture.nudge(dt);
  }

  if (app.phase === 'play') {
    app.t += dt;
    const p = st.update(g, dt, input, view) || 0;
    app.progress = p;
    if (p >= 0.999 && !st.auto) {
      app.phase = 'outro';
      app.outroT = 0;
      if (st.id !== 'demold') sfx.place();
    }
  } else {
    app.outroT += dt;
    const u = clamp(app.outroT / Math.max(0.001, st.hold));
    if (st.outro) st.outro(g, u);
    if (st.update && st.id === 'demold') st.update(g, dt, input, view);
    if (u >= 1) {
      const next = app.stage + 1;
      if (next < STAGES.length) {
        gotoStage(next);
      } else {
        app.phase = 'play';
      }
    }
  }

  if (g.shake > 0) {
    view.shake = Math.max(view.shake, g.shake);
    g.shake = 0;
  }
  applyCamera(false);
  view.update(dt);

  // 背景（冷却時は青みがかる）
  if (st.id !== 'chill') g.cold = damp(g.cold, 0, 0.9, dt);
  A.background(view.ctx, view, clamp(g.cold * 0.75));

  const ctx = view.world();
  st.draw(ctx, view, g);

  const c = view.begin();
  app.buttons.length = 0;
  if (g.sparks && g.sparks.length) A.sparkles(c, g.sparks);
  drawHint(c, st);
  drawUI(c, st);
}

// --- 誘導（文字なし） -------------------------------------------------------
function drawHint(c, st) {
  if (st.auto || app.phase !== 'play' || !st.hint) {
    g.pulse = 0;
    return;
  }
  if (st.id === 'demold' && (g.released || g.recap > 0)) {
    g.pulse = 0;
    return;
  }
  const warmup = app.t < 3.5 ? 0.7 : 1.6;
  const idle = Math.min(input.idle, 99);
  if (idle < warmup) {
    g.pulse = 0;
    return;
  }
  const a = clamp((idle - warmup) / 0.5);
  g.pulse = a * (0.5 + 0.5 * Math.sin(app.time * 3.2));
  const h = st.hint(view, g);
  if (!h || !h.pts || h.pts.length < 2) return;

  const period = h.slow ? 3.0 : 2.3;
  const u = (app.time % period) / period;
  const move = clamp(u / 0.72);
  const e = h.circle ? u : smooth(move);
  const idx = Math.min(h.pts.length - 1, Math.floor(e * (h.pts.length - 1)));
  const frac = e * (h.pts.length - 1) - idx;
  const p0 = h.pts[idx];
  const p1 = h.pts[Math.min(h.pts.length - 1, idx + 1)];
  const hx = lerp(p0[0], p1[0], frac);
  const hy = lerp(p0[1], p1[1], frac);

  A.guideArrow(c, h.pts, app.time * 46, a * 0.85);
  // 出発点のパルス
  const pr = 22 + 10 * (0.5 + 0.5 * Math.sin(app.time * 3.4));
  c.save();
  c.globalAlpha = a * 0.5;
  c.beginPath();
  c.arc(h.pts[0][0], h.pts[0][1], pr, 0, TAU);
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.stroke();
  c.restore();
  A.handIcon(c, hx, hy + 14, 1.15, 0, a);
}

// --- UI ---------------------------------------------------------------------
function iconButton(c, x, y, r, draw, tint = '#ff8a5c') {
  c.save();
  c.translate(x, y);
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  const grd = c.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.05);
  grd.addColorStop(0, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.32, tint);
  grd.addColorStop(1, '#c9401f');
  c.fillStyle = grd;
  c.shadowColor = 'rgba(90,50,15,0.35)';
  c.shadowBlur = 14;
  c.shadowOffsetY = 4;
  c.fill();
  c.shadowColor = 'transparent';
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.stroke();
  draw(c, r);
  c.restore();
}

function drawUI(c, st) {
  drawMuteButton(c);
  if (st.id !== 'reveal') return;
  const ins = safeInsets();
  const pulse = 0.5 + 0.5 * Math.sin(app.time * 2.6);
  const R = Math.min(52, Math.min(view.w, view.h) * 0.14);
  // 縦画面は下中央、横画面は右下（どちらでもプリンに指がかからない場所）
  const bottom = view.h - ins.bottom - (view.portrait ? 76 : 60);
  const centerX = view.portrait ? view.w * 0.5 : view.w - R * 1.35;

  // もう一度「型をぬく」
  const bx = view.portrait ? centerX + R * 0.9 : centerX;
  iconButton(
    c,
    bx,
    bottom,
    R * (1 + pulse * 0.03),
    (cc, r) => {
      const s = r / 52;
      cc.save();
      cc.scale(s, s);
      // 型（台形）を上へ持ち上げる、を表すアイコン
      cc.beginPath();
      cc.moveTo(-21, 26);
      cc.lineTo(-15, 4);
      cc.lineTo(15, 4);
      cc.lineTo(21, 26);
      cc.closePath();
      cc.fillStyle = 'rgba(255,255,255,0.97)';
      cc.fill();
      cc.beginPath();
      cc.moveTo(0, -30);
      cc.lineTo(14, -12);
      cc.lineTo(6, -12);
      cc.lineTo(6, -2);
      cc.lineTo(-6, -2);
      cc.lineTo(-6, -12);
      cc.lineTo(-14, -12);
      cc.closePath();
      cc.fillStyle = '#fff2cf';
      cc.fill();
      cc.restore();
    },
    '#ffa04d'
  );
  app.buttons.push({ x: bx, y: bottom, r: R, action: replayDemold });

  // 最初から
  const sr = R * 0.68;
  const sx = view.portrait ? centerX - R * 1.25 : centerX - R - sr - 14;
  iconButton(
    c,
    sx,
    bottom,
    sr,
    (cc, r) => {
      const s = r / 36;
      cc.save();
      cc.scale(s, s);
      cc.beginPath();
      cc.arc(0, 0, 14, 0.6, TAU * 0.86);
      cc.lineWidth = 6;
      cc.lineCap = 'round';
      cc.strokeStyle = 'rgba(255,255,255,0.95)';
      cc.stroke();
      cc.beginPath();
      cc.moveTo(14, -12);
      cc.lineTo(18, 2);
      cc.lineTo(4, -2);
      cc.closePath();
      cc.fillStyle = 'rgba(255,255,255,0.95)';
      cc.fill();
      cc.restore();
    },
    '#7fc4e8'
  );
  app.buttons.push({ x: sx, y: bottom, r: sr, action: restartAll });
}

function drawMuteButton(c) {
  const ins = safeInsets();
  const x = view.w - 30 - ins.top * 0.2;
  const y = 30 + ins.top;
  const r = 17;
  c.save();
  c.globalAlpha = 0.55;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.fill();
  c.beginPath();
  c.moveTo(x - 7, y - 3);
  c.lineTo(x - 3, y - 3);
  c.lineTo(x + 2, y - 8);
  c.lineTo(x + 2, y + 8);
  c.lineTo(x - 3, y + 3);
  c.lineTo(x - 7, y + 3);
  c.closePath();
  c.fillStyle = '#7b5230';
  c.fill();
  if (isMuted()) {
    c.beginPath();
    c.moveTo(x - 9, y - 9);
    c.lineTo(x + 9, y + 9);
    c.lineWidth = 3;
    c.strokeStyle = '#c0392b';
    c.stroke();
  } else {
    c.beginPath();
    c.arc(x + 4, y, 6, -0.9, 0.9);
    c.lineWidth = 2.5;
    c.strokeStyle = '#7b5230';
    c.stroke();
  }
  c.restore();
  app.buttons.push({
    x,
    y,
    r,
    action: () => {
      setMuted(!isMuted());
      if (!isMuted()) sfx.tap();
    },
  });
}

// --- 起動 -------------------------------------------------------------------
view.resize(FAST);
view.snapToTarget();
view.recompute();
requestAnimationFrame(frame);

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    view.resize(FAST);
    A.clearGradientCache();
    if (app.mode === 'play') applyCamera(true);
  }, 120);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopAllLoops();
});

// --- E2E / デバッグ用フック --------------------------------------------------
window.__game = {
  app,
  g,
  view,
  input,
  STAGES,
  STAGE_INDEX,
  start() {
    initAudio();
    app.mode = 'play';
    resetGame();
  },
  jump(id) {
    if (app.mode !== 'play') this.start();
    gotoStage(STAGE_INDEX[id], true);
  },
  stageId: () => STAGES[app.stage].id,
  complete() {
    // 現在のステージのジェスチャを一気に満たす（自動プレイ検証用）
    const gs = g.gesture;
    if (!gs) return;
    if (gs.dist != null) gs.acc = gs.dist;
    else if (gs.need != null) gs.acc = gs.need;
    else if (gs.dur != null) gs.acc = gs.dur;
  },
};

'use strict';
/* ==========================================================================
   かまくらつくろう — 4歳児向け かまくら作りゲーム (iPhone/iPad モバイルWeb)
   雪を集める → 固める → 入口を掘る → 中に入る → 中を削って広げる →
   ランタンを置く → 青白い部屋が暖色に変わる → 外観リビール
   Canvas 2D のみ / 一指操作 / 文字説明・点数・失敗・制限時間なし
   ========================================================================== */

/* ---------- 基本セットアップ ---------- */
const FAST = /[?&](fast|test)=1/.test(location.search); // E2E高速モード
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let cw = 0, ch = 0, DPR = 1;

function resize() {
  DPR = FAST ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth;
  ch = window.innerHeight;
  canvas.width = Math.round(cw * DPR);
  canvas.height = Math.round(ch * DPR);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

/* ---------- 乱数（固定シード） ---------- */
let _seed = 20260816;
function rnd() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
}
function rrange(a, b) { return a + (b - a) * rnd(); }

/* ---------- ユーティリティ ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const TAU = Math.PI * 2;
function mix3(a, b, t) {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
}
function rgb(c, a) { return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function dur(t) { return FAST ? Math.max(0.08, t * 0.25) : t; }

/* 開いた点列をなめらかな曲線で描く */
function smoothOpen(pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
/* 閉じたブロブ */
function blobPath(pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1].x + pts[0].x) / 2, (pts[n - 1].y + pts[0].y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------- サウンド（WebAudio 合成・実火なし電子音） ---------- */
let AC = null, master = null;
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.4;
    master.connect(AC.destination);
  } catch (e) { AC = null; }
}
function tone(f0, f1, len, type, vol, delay) {
  if (!AC) return;
  try {
    const t0 = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, f1 || f0), t0 + len);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + len + 0.05);
  } catch (e) {}
}
let _noiseBuf = null;
function noise(len, vol, freq, delay) {
  if (!AC) return;
  try {
    if (!_noiseBuf) {
      _noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = _noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = AC.currentTime + (delay || 0);
    const s = AC.createBufferSource(); s.buffer = _noiseBuf; s.loop = true;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = 0.8;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + len + 0.05);
  } catch (e) {}
}
const SFX = {
  tap() { tone(560, 760, 0.1, 'sine', 0.18); },
  push() { noise(0.28, 0.14, 500); tone(180, 120, 0.25, 'sine', 0.1); },
  arrive() { tone(140, 90, 0.16, 'sine', 0.2); noise(0.12, 0.1, 700); },
  pat() { tone(200, 130, 0.1, 'sine', 0.25); noise(0.08, 0.12, 1200); },
  scoop() { noise(0.2, 0.2, 800); tone(300, 160, 0.14, 'triangle', 0.1); },
  firstHole() { tone(523, 523, 0.12, 'sine', 0.2); tone(659, 659, 0.12, 'sine', 0.2, 0.1); tone(784, 784, 0.2, 'sine', 0.2, 0.2); },
  slide() { tone(700, 200, 0.45, 'sine', 0.2); noise(0.4, 0.1, 600); },
  wow() { tone(392, 392, 0.5, 'triangle', 0.1); tone(494, 494, 0.5, 'triangle', 0.08, 0.05); tone(587, 587, 0.6, 'triangle', 0.08, 0.1); },
  scrape() { noise(0.12, 0.12, 1400); },
  sparkle() { tone(1200, 1600, 0.15, 'sine', 0.1); tone(1600, 2100, 0.15, 'sine', 0.08, 0.08); },
  pickup() { tone(500, 700, 0.1, 'sine', 0.16); },
  place() { tone(320, 240, 0.12, 'sine', 0.22); },
  warmOn() {
    tone(262, 262, 1.1, 'triangle', 0.12); tone(330, 330, 1.1, 'triangle', 0.1, 0.06);
    tone(392, 392, 1.2, 'triangle', 0.1, 0.12); tone(523, 523, 1.4, 'sine', 0.08, 0.2);
    tone(1568, 2093, 0.4, 'sine', 0.06, 0.3);
  },
  tada() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.14, i * 0.12)); }
};

/* ---------- ゲーム定数 ---------- */
const PUSHES_NEED = FAST ? 2 : 6;   // 雪集め回数
const PATS_NEED = FAST ? 3 : 8;     // ペタペタ回数
const DIGS_NEED = FAST ? 3 : 8;     // 入口掘り回数
const CARVE_NEED = FAST ? 0.55 : 0.85; // 内部広げ達成率

/* ワールド座標（外の雪原） */
const HORIZON = 340;   // 地平線
const MX = 500;        // 雪山中心x
const MB = 598;        // 雪山ベースy
const MOUND_R = 175;   // 完成時の雪山半径

const SHOTS = {
  wide:  { x: 500, y: 430, w: 1080, h: 720 },
  mound: { x: 500, y: 495, w: 840, h: 570 },
  front: { x: 500, y: 512, w: 620, h: 440 },
  hole:  { x: 500, y: 556, w: 150, h: 110 }
};

/* ---------- ゲーム状態 ---------- */
const G = {
  phase: 'title',
  t: 0,              // フェーズ経過秒
  time: 0,           // 全体秒
  pushes: 0, leftSnow: 0, rightSnow: 0,
  moundS: 0,         // 表示中の雪山成長(0..1)
  pats: 0, patS: 0,
  digs: 0, holeS: 0,
  balls: [],         // 転がる雪玉
  chunks: [],        // 掘った雪の塊（ワールド）
  patMarks: [],
  kid: { x: 385, y: 604, pose: 'idle', flip: false, a: 1 },
  goinT: 0,
  trans: null,       // {t,dur,to,color}
  lastInput: 0,
  pointer: { down: false, x: 0, y: 0, id: null },
  camNow: { ...SHOTS.wide },
  dusk: 0,
  sparkles: [],      // スクリーン座標のキラキラ
  IN: null           // 内部状態
};

function makeInterior() {
  const N = 16;
  const grow = new Array(N).fill(0);
  const bump = [];
  for (let i = 0; i < N; i++) bump.push(rrange(0.4, 1));
  return {
    N, grow, bump,
    grooves: [],
    shavings: [],
    intro: 0,
    benchShown: false,
    lantern: { x: 0, y: 0, held: false, placed: false, homeSet: false },
    warm: 0,
    kidClap: 0
  };
}

function resetGame(toGather) {
  G.pushes = 0; G.leftSnow = Math.ceil(PUSHES_NEED / 2); G.rightSnow = Math.ceil(PUSHES_NEED / 2);
  G.moundS = 0; G.pats = 0; G.patS = 0; G.digs = 0; G.holeS = 0;
  G.balls = []; G.chunks = []; G.patMarks = []; G.sparkles = [];
  G.kid = { x: 385, y: 604, pose: 'idle', flip: false, a: 1 };
  G.goinT = 0; G.dusk = 0;
  G.IN = makeInterior();
  setPhase(toGather ? 'gather' : 'title');
}

function setPhase(p) {
  G.phase = p;
  G.t = 0;
}

/* フェーズ間フェード遷移 */
function fadeTo(phase, color, d) {
  G.trans = { t: 0, dur: dur(d || 0.9), to: phase, color: color || [10, 18, 36], done: false };
}

/* ---------- カメラ ---------- */
function currentShot() {
  switch (G.phase) {
    case 'title': case 'gather': return SHOTS.wide;
    case 'pat': return SHOTS.mound;
    case 'tofront': case 'dig': case 'enter': return SHOTS.front;
    case 'goin': return SHOTS.hole;
    case 'reveal': case 'toreveal': return SHOTS.wide;
    default: return SHOTS.wide;
  }
}
function camScale() { return Math.min(cw / G.camNow.w, ch / G.camNow.h); }
function worldToScreen(x, y) {
  const s = camScale();
  return { x: cw / 2 + (x - G.camNow.x) * s, y: ch / 2 + (y - G.camNow.y) * s };
}
function screenToWorld(x, y) {
  const s = camScale();
  return { x: G.camNow.x + (x - cw / 2) / s, y: G.camNow.y + (y - ch / 2) / s };
}
function updateCam(dt) {
  const t = currentShot();
  const k = 1 - Math.exp(-dt * (G.phase === 'goin' ? 2.2 : 3.5));
  G.camNow.x = lerp(G.camNow.x, t.x, k);
  G.camNow.y = lerp(G.camNow.y, t.y, k);
  G.camNow.w = lerp(G.camNow.w, t.w, k);
  G.camNow.h = lerp(G.camNow.h, t.h, k);
}

/* ---------- 降雪（スクリーン空間） ---------- */
const FLAKES = [];
const FLAKE_N = FAST ? 14 : 70;
function initFlakes() {
  FLAKES.length = 0;
  for (let i = 0; i < FLAKE_N; i++) {
    FLAKES.push({ x: rnd(), y: rnd(), r: rrange(1, 3), v: rrange(0.014, 0.04), ph: rnd() * TAU });
  }
}
initFlakes();

/* ---------- 入力 ---------- */
let dragAcc = 0, dragStartX = 0, dragLastX = 0, dragLastY = 0, dragMoved = 0, carveSound = 0;

canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  ensureAudio();
  if (G.pointer.down) return; // 一指のみ
  G.pointer.down = true; G.pointer.id = e.pointerId;
  G.pointer.x = e.clientX; G.pointer.y = e.clientY;
  G.lastInput = G.time;
  dragAcc = 0; dragStartX = e.clientX; dragLastX = e.clientX; dragLastY = e.clientY; dragMoved = 0;
  onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e => {
  if (!G.pointer.down || e.pointerId !== G.pointer.id) return;
  e.preventDefault();
  const dx = e.clientX - dragLastX, dy = e.clientY - dragLastY;
  dragLastX = e.clientX; dragLastY = e.clientY;
  dragMoved += Math.hypot(dx, dy);
  G.pointer.x = e.clientX; G.pointer.y = e.clientY;
  G.lastInput = G.time;
  onDrag(e.clientX, e.clientY, dx, dy);
});
function endPointer(e) {
  if (e.pointerId !== G.pointer.id) return;
  G.pointer.down = false; G.pointer.id = null;
  onRelease(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

/* タップ処理 */
function onTap(x, y) {
  switch (G.phase) {
    case 'title': {
      const b = titleBtn();
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.6) {
        SFX.tap();
        fadeTo('gather', [235, 244, 252], 0.7);
      }
      break;
    }
    case 'pat': doPat(x, y); break;
    case 'dig': doDig(x, y); break;
    case 'enter': {
      const h = worldToScreen(MX, MB - 40);
      const s = camScale();
      if (Math.hypot(x - h.x, y - h.y) < Math.max(90, 130 * s)) startGoIn();
      break;
    }
    case 'lantern': {
      const L = G.IN.lantern, M = Math.min(cw, ch);
      if (!L.placed && Math.hypot(x - L.x, y - L.y) < M * 0.16) {
        L.held = true; SFX.pickup();
      }
      break;
    }
    case 'reveal': {
      const b = replayBtn();
      if (Math.hypot(x - b.x, y - b.y) < b.r * 1.7) {
        SFX.tap();
        fadeTo('restart', [235, 244, 252], 0.7);
      }
      break;
    }
  }
}

/* ドラッグ処理 */
function onDrag(x, y, dx, dy) {
  switch (G.phase) {
    case 'gather': {
      // 山の中心方向への横移動を蓄積 → 一定量で雪をひと押し
      const mound = worldToScreen(MX, MB);
      const toward = (dragStartX < mound.x) ? dx : -dx;
      if (toward > 0) dragAcc += toward;
      const step = Math.max(70, cw * 0.16);
      if (dragAcc > step) {
        dragAcc -= step;
        doPush(dragStartX < mound.x ? 'L' : 'R');
      }
      break;
    }
    case 'dig': {
      dragAcc += Math.hypot(dx, dy);
      if (dragAcc > 110) { dragAcc = 0; doDig(x, y); }
      break;
    }
    case 'carve': doCarve(x, y, Math.hypot(dx, dy)); break;
    case 'lantern': {
      const L = G.IN.lantern;
      if (L.held) { L.x = x; L.y = y; }
      break;
    }
  }
}

function onRelease(x, y) {
  if (G.phase === 'lantern') {
    const L = G.IN.lantern;
    if (L.held) {
      L.held = false;
      const tgt = lanternTarget(), M = Math.min(cw, ch);
      if (Math.hypot(x - tgt.x, y - tgt.y) < M * 0.2) {
        L.placed = true; L.x = tgt.x; L.y = tgt.y;
        SFX.place();
        setPhase('glow');
        setTimeout(() => SFX.warmOn(), 150);
      }
    }
  }
}

/* ---------- 行動：雪あつめ ---------- */
function doPush(side) {
  if (G.pushes >= PUSHES_NEED) return;
  if (side === 'L' && G.leftSnow <= 0) side = 'R';
  if (side === 'R' && G.rightSnow <= 0) side = 'L';
  if (side === 'L') { if (G.leftSnow <= 0) return; G.leftSnow--; }
  else { if (G.rightSnow <= 0) return; G.rightSnow--; }
  SFX.push();
  const fromX = side === 'L' ? 195 : 805;
  G.balls.push({ t: 0, from: fromX, side, d: dur(0.7) });
  G.kid.flip = side === 'R';
}

/* ---------- 行動：ペタペタ ---------- */
function doPat(x, y) {
  const m = worldToScreen(MX, MB - 90 * (0.3 + G.moundS));
  const s = camScale();
  if (Math.hypot(x - m.x, y - m.y) > Math.max(180, MOUND_R * 2 * s)) return;
  if (G.pats >= PATS_NEED) return;
  G.pats++;
  SFX.pat();
  G.patPunch = 1; // 山がプルンと縮む
  const w = screenToWorld(x, y);
  const a = Math.atan2(w.y - MB, w.x - MX);
  G.patMarks.push({ a: a, r: rrange(0.5, 0.85), s: rrange(0.8, 1.2) });
  addSpark(x, y, 4, [200, 228, 255]);
  if (G.pats >= PATS_NEED) {
    setTimeout(() => { if (G.phase === 'pat') setPhase('tofront'); }, dur(0.7) * 1000);
  }
}

/* ---------- 行動：入口掘り ---------- */
function doDig(x, y) {
  const h = worldToScreen(MX, MB - 45);
  const s = camScale();
  if (Math.hypot(x - h.x, y - h.y) > Math.max(170, 200 * s)) return;
  if (G.digs >= DIGS_NEED) return;
  G.digs++;
  SFX.scoop();
  G.digSwing = 1;
  // 雪の塊が飛ぶ（ワールド座標）
  for (let i = 0; i < (FAST ? 2 : 5); i++) {
    G.chunks.push({
      x: MX + rrange(-20, 20), y: MB - rrange(10, 60),
      vx: rrange(-140, 140), vy: rrange(-260, -120),
      r: rrange(6, 15), life: 1
    });
  }
  if (G.digs === 1) {
    // ★もう一回点：最初の穴が開く
    SFX.firstHole();
    const p = worldToScreen(MX, MB - 50);
    addSpark(p.x, p.y, 10, [255, 240, 180]);
  }
  if (G.digs >= DIGS_NEED) {
    setTimeout(() => { if (G.phase === 'dig') { setPhase('enter'); SFX.sparkle(); } }, dur(0.8) * 1000);
  }
}

/* ---------- 行動：中へ入る ---------- */
function startGoIn() {
  SFX.slide();
  setPhase('goin');
}

/* ---------- 行動：内部を削る ---------- */
function interiorGeom() {
  const M = Math.min(cw, ch);
  return { cx: cw / 2, cy: ch * 0.46, M, baseR: M * 0.295, extraR: M * 0.27 };
}
function interiorAvg() {
  const IN = G.IN;
  let s = 0; for (let i = 0; i < IN.N; i++) s += IN.grow[i];
  return s / IN.N;
}
function sectorRadius(i) {
  const { M, baseR, extraR } = interiorGeom();
  const IN = G.IN;
  const g = IN.grow[i], avg = interiorAvg();
  const wob = 0.09 * IN.bump[i] * (1 - g);
  return (baseR + extraR * (0.4 * avg + 0.6 * g)) * (1 + wob);
}
function doCarve(x, y, d) {
  const IN = G.IN;
  if (!IN || IN.intro < 0.6) return;
  const { cx, cy, M } = interiorGeom();
  const ang = Math.atan2(y - cy, x - cx);
  const distR = Math.hypot(x - cx, y - cy);
  let i = Math.round(((ang + TAU) % TAU) / TAU * IN.N) % IN.N;
  const r = sectorRadius(i);
  if (distR < r * 0.4) return; // 中心すぎは無効（壁の近くをなぞる）
  const amount = (d / M) * (FAST ? 5.5 : 1.35);
  const before = interiorAvg();
  IN.grow[i] = clamp(IN.grow[i] + amount, 0, 1);
  IN.grow[(i + 1) % IN.N] = clamp(IN.grow[(i + 1) % IN.N] + amount * 0.55, 0, 1);
  IN.grow[(i + IN.N - 1) % IN.N] = clamp(IN.grow[(i + IN.N - 1) % IN.N] + amount * 0.55, 0, 1);
  // 削り跡と雪の粉
  if (dragMoved > 8) {
    IN.grooves.push({ a: ang, rr: clamp(distR / r, 0.6, 0.98), len: rrange(0.12, 0.3), life: 1 });
    if (IN.grooves.length > 50) IN.grooves.shift();
    for (let k = 0; k < (FAST ? 1 : 3); k++) {
      IN.shavings.push({ x, y, vx: rrange(-30, 30), vy: rrange(10, 60), r: rrange(1.5, 4), life: 1 });
    }
  }
  if (G.time - carveSound > 0.18) { carveSound = G.time; SFX.scrape(); }
  const after = interiorAvg();
  if (!IN.benchShown && after > 0.4) {
    IN.benchShown = true;
    SFX.sparkle();
    addSpark(cx + interiorGeom().baseR * 0.8, cy + interiorGeom().baseR * 0.5, 6, [220, 240, 255]);
  }
  if (before < CARVE_NEED && after >= CARVE_NEED) {
    setTimeout(() => {
      if (G.phase === 'carve') {
        setPhase('lantern');
        SFX.wow();
      }
    }, dur(0.6) * 1000);
  }
}

/* ランタンの置き場所（床の中央） */
function lanternTarget() {
  const { cx, cy, M } = interiorGeom();
  return { x: cx, y: cy + M * 0.21 };
}

/* ---------- キラキラ ---------- */
function addSpark(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    G.sparkles.push({
      x: x + rrange(-30, 30), y: y + rrange(-30, 30),
      life: 1, col, r: rrange(2, 5), ph: rnd() * TAU
    });
  }
}

/* ---------- UIボタン位置 ---------- */
function titleBtn() { return { x: cw / 2, y: ch * 0.68, r: Math.min(cw, ch) * 0.11 }; }
function replayBtn() { return { x: cw / 2, y: ch * 0.85, r: Math.min(cw, ch) * 0.085 }; }

/* ---------- 更新 ---------- */
function update(dt) {
  G.time += dt;
  G.t += dt;

  // フェード遷移
  if (G.trans) {
    G.trans.t += dt;
    if (!G.trans.done && G.trans.t >= G.trans.dur / 2) {
      G.trans.done = true;
      if (G.trans.to === 'restart') resetGame(true);
      else setPhase(G.trans.to);
    }
    if (G.trans.t >= G.trans.dur) G.trans = null;
  }

  updateCam(dt);

  // 表示値のなめらか追従
  G.moundS = lerp(G.moundS, G.pushes / PUSHES_NEED, 1 - Math.exp(-dt * 5));
  G.patS = lerp(G.patS, G.pats / PATS_NEED, 1 - Math.exp(-dt * 6));
  G.holeS = lerp(G.holeS, G.digs / DIGS_NEED, 1 - Math.exp(-dt * 6));
  if (G.patPunch) G.patPunch = Math.max(0, G.patPunch - dt * 5);
  if (G.digSwing) G.digSwing = Math.max(0, G.digSwing - dt * 5);

  // 雪玉
  for (const b of G.balls) b.t += dt / b.d;
  for (let i = G.balls.length - 1; i >= 0; i--) {
    if (G.balls[i].t >= 1) {
      G.balls.splice(i, 1);
      G.pushes = Math.min(PUSHES_NEED, G.pushes + 1);
      SFX.arrive();
      const p = worldToScreen(MX, MB - 60);
      addSpark(p.x, p.y, 5, [230, 244, 255]);
      if (G.pushes >= PUSHES_NEED && G.phase === 'gather') {
        setTimeout(() => { if (G.phase === 'gather') { setPhase('pat'); SFX.sparkle(); } }, dur(0.8) * 1000);
      }
    }
  }

  // 掘り雪の塊
  for (let i = G.chunks.length - 1; i >= 0; i--) {
    const c = G.chunks[i];
    c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 700 * dt; c.life -= dt * 1.2;
    if (c.life <= 0 || c.y > MB + 40) G.chunks.splice(i, 1);
  }

  // キラキラ
  for (let i = G.sparkles.length - 1; i >= 0; i--) {
    const s = G.sparkles[i];
    s.life -= dt * 1.4; s.y -= 12 * dt;
    if (s.life <= 0) G.sparkles.splice(i, 1);
  }

  // フェーズ固有
  switch (G.phase) {
    case 'tofront':
      if (G.t > dur(1.3)) setPhase('dig');
      break;
    case 'goin': {
      G.goinT = clamp(G.t / dur(2.2), 0, 1);
      if (G.goinT >= 1) {
        setPhase('carve');
        SFX.wow();
      }
      break;
    }
    case 'carve': case 'lantern': case 'glow': {
      const IN = G.IN;
      IN.intro = clamp(IN.intro + dt / dur(0.9), 0, 1);
      for (let i = IN.shavings.length - 1; i >= 0; i--) {
        const s = IN.shavings[i];
        s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; s.life -= dt * 1.5;
        if (s.life <= 0) IN.shavings.splice(i, 1);
      }
      for (const g of IN.grooves) g.life = Math.max(0.35, g.life - dt * 0.12);
      if (G.phase === 'lantern' && !IN.lantern.homeSet) {
        IN.lantern.homeSet = true;
        IN.lantern.x = cw / 2;
        IN.lantern.y = ch * 0.88;
      }
      if (G.phase === 'glow') {
        // ★もう一回点：青白 → 暖色
        IN.warm = clamp(IN.warm + dt / dur(2.4), 0, 1);
        IN.kidClap += dt;
        if (IN.warm > 0.5 && rnd() < dt * 3) {
          const t = lanternTarget();
          addSpark(t.x + rrange(-cw * 0.2, cw * 0.2), t.y - rrange(0, ch * 0.3), 1, [255, 214, 140]);
        }
        if (G.t > dur(4.2) && !G.trans) {
          fadeTo('toreveal', [30, 26, 40], 1.2);
          setTimeout(() => SFX.tada(), dur(1.2) * 700);
        }
      }
      break;
    }
    case 'toreveal':
      G.dusk = clamp(G.dusk + dt * 1.5, 0, 1);
      if (G.t > dur(0.6)) setPhase('reveal');
      break;
    case 'reveal':
      G.dusk = clamp(G.dusk + dt * 1.5, 0, 1);
      break;
  }
}

/* ==========================================================================
   描画
   ========================================================================== */

/* ---------- 空と背景（スクリーン空間） ---------- */
function drawSky(dusk) {
  const top = mix3([168, 205, 236], [56, 68, 122], dusk);
  const bot = mix3([238, 246, 252], [186, 138, 158], dusk);
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, rgb(top));
  g.addColorStop(1, rgb(bot));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cw, ch);
  if (dusk > 0.15) {
    // 星
    ctx.fillStyle = `rgba(255,250,230,${0.8 * dusk})`;
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 137.5) % 100) / 100 * cw;
      const sy = ((i * 91.7) % 55) / 100 * ch;
      const tw = 0.5 + 0.5 * Math.sin(G.time * 2 + i * 1.7);
      ctx.globalAlpha = dusk * (0.3 + 0.7 * tw);
      ctx.beginPath();
      ctx.arc(sx, sy, i % 3 === 0 ? 2 : 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------- 遠景の丘 ---------- */
function drawHills(dusk) {
  const c1 = mix3([225, 238, 250], [96, 106, 152], dusk);
  const c2 = mix3([240, 248, 254], [120, 126, 168], dusk);
  ctx.fillStyle = rgb(c1);
  ctx.beginPath();
  ctx.moveTo(-900, HORIZON + 6);
  ctx.quadraticCurveTo(80, 220, 420, HORIZON + 4);
  ctx.lineTo(-900, HORIZON + 40);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(c2);
  ctx.beginPath();
  ctx.moveTo(300, HORIZON + 8);
  ctx.quadraticCurveTo(760, 230, 1900, HORIZON + 6);
  ctx.lineTo(1900, HORIZON + 40); ctx.lineTo(300, HORIZON + 40);
  ctx.closePath(); ctx.fill();
}

/* ---------- 地面 ---------- */
function drawGround(dusk) {
  const snow = mix3([244, 249, 255], [156, 148, 190], dusk);
  ctx.fillStyle = rgb(snow);
  ctx.fillRect(-3000, HORIZON, 7000, 4000);
  // 青白い影のむら
  const sh = mix3([176, 200, 232], [96, 96, 150], dusk);
  ctx.fillStyle = rgb(sh, 0.28);
  const patches = [[180, 660, 220, 34], [700, 700, 260, 40], [420, 640, 150, 22], [900, 640, 180, 26], [80, 620, 120, 20]];
  for (const p of patches) {
    ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, TAU); ctx.fill();
  }
  // 足あと
  ctx.fillStyle = rgb(sh, 0.5);
  for (let i = 0; i < 9; i++) {
    const fx = 210 + i * 32, fy = 622 + Math.sin(i * 2.1) * 5 + (i % 2) * 7;
    ctx.beginPath(); ctx.ellipse(fx, fy, 7, 4.5, 0.2, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 7; i++) {
    const fx = 790 - i * 30, fy = 648 + Math.sin(i * 1.7) * 4 + (i % 2) * 7;
    ctx.beginPath(); ctx.ellipse(fx, fy, 7, 4.5, -0.2, 0, TAU); ctx.fill();
  }
}

/* ---------- 雪をかぶった家 ---------- */
function drawHouse(x, y, s, bodyCol, dusk) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  // 本体
  ctx.fillStyle = rgb(mix3(bodyCol, [70, 64, 96], dusk * 0.55));
  roundRect(-55, -55, 110, 62, 6); ctx.fill();
  // 屋根雪（分厚くまるい）
  const roofSnow = mix3([250, 252, 255], [176, 168, 205], dusk);
  ctx.fillStyle = rgb(roofSnow);
  ctx.beginPath();
  ctx.moveTo(-70, -52);
  ctx.quadraticCurveTo(-72, -76, -46, -80);
  ctx.quadraticCurveTo(0, -108, 46, -80);
  ctx.quadraticCurveTo(72, -76, 70, -52);
  ctx.quadraticCurveTo(40, -62, 0, -60);
  ctx.quadraticCurveTo(-40, -62, -70, -52);
  ctx.closePath(); ctx.fill();
  // 軒のたれ雪
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const bx = -55 + i * 27;
    ctx.moveTo(bx, -54);
    ctx.quadraticCurveTo(bx + 7, -40 + (i % 2) * 6, bx + 14, -54);
  }
  ctx.fillStyle = rgb(roofSnow, 0.95); ctx.fill();
  // 暖かい窓明かり
  const glow = 0.55 + 0.45 * dusk + 0.05 * Math.sin(G.time * 3 + x);
  ctx.fillStyle = `rgba(255,190,90,${0.25 * glow})`;
  ctx.beginPath(); ctx.arc(-20, -25, 22, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(24, -25, 20, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,206,120,${0.95})`;
  roundRect(-32, -38, 24, 26, 4); ctx.fill();
  roundRect(14, -38, 20, 26, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(150,90,40,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, -38); ctx.lineTo(-20, -12);
  ctx.moveTo(-32, -25); ctx.lineTo(-8, -25);
  ctx.stroke();
  // 煙突とほわほわ湯気（火ではなく暖房の湯気）
  ctx.fillStyle = rgb(mix3([182, 106, 84], [86, 66, 90], dusk * 0.6));
  ctx.fillRect(30, -92, 14, 24);
  ctx.fillStyle = `rgba(255,255,255,${0.5 - 0.15 * dusk})`;
  const st = G.time * 0.7 + x;
  for (let i = 0; i < 3; i++) {
    const ss = (st + i * 0.33) % 1;
    ctx.globalAlpha = (1 - ss) * 0.5;
    ctx.beginPath(); ctx.arc(37 + Math.sin(ss * 5 + i) * 6, -98 - ss * 40, 7 + ss * 8, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ---------- 雪をかぶった木 ---------- */
function drawTree(x, y, s, dusk) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = rgb(mix3([94, 74, 58], [56, 48, 66], dusk * 0.6));
  ctx.fillRect(-6, -18, 12, 20);
  const green = mix3([74, 122, 96], [42, 62, 88], dusk * 0.7);
  const snowC = mix3([248, 252, 255], [178, 172, 208], dusk);
  for (let L = 0; L < 3; L++) {
    const w = 62 - L * 15, hy = -20 - L * 34;
    ctx.fillStyle = rgb(green);
    ctx.beginPath();
    ctx.moveTo(-w, hy); ctx.lineTo(0, hy - 46); ctx.lineTo(w, hy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgb(snowC);
    ctx.beginPath();
    ctx.moveTo(-w * 0.92, hy - 3);
    ctx.quadraticCurveTo(-w * 0.5, hy - 20 - 8, 0, hy - 44);
    ctx.quadraticCurveTo(w * 0.5, hy - 20 - 8, w * 0.92, hy - 3);
    ctx.quadraticCurveTo(w * 0.4, hy - 14, 0, hy - 12);
    ctx.quadraticCurveTo(-w * 0.4, hy - 14, -w * 0.92, hy - 3);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = rgb(snowC);
  ctx.beginPath(); ctx.arc(0, -122, 12, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- 横の雪だまり ---------- */
function drawSidePile(x, remain, total, dusk) {
  if (remain <= 0) return;
  const k = remain / total;
  const R = 60 * (0.45 + 0.55 * k);
  const snow = mix3([250, 252, 255], [170, 164, 202], dusk);
  const sh = mix3([196, 214, 238], [110, 110, 160], dusk);
  ctx.fillStyle = rgb(sh, 0.4);
  ctx.beginPath(); ctx.ellipse(x, MB + 6, R * 1.3, R * 0.28, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgb(snow);
  ctx.beginPath();
  ctx.moveTo(x - R * 1.25, MB + 4);
  ctx.quadraticCurveTo(x - R, MB - R * 0.9, x - R * 0.2, MB - R * 0.95);
  ctx.quadraticCurveTo(x + R * 0.4, MB - R * 1.05, x + R * 0.9, MB - R * 0.4);
  ctx.quadraticCurveTo(x + R * 1.25, MB - R * 0.1, x + R * 1.2, MB + 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(sh, 0.35);
  ctx.beginPath(); ctx.ellipse(x + R * 0.2, MB - R * 0.25, R * 0.5, R * 0.2, 0.3, 0, TAU); ctx.fill();
}

/* ---------- 雪山（かまくら） ---------- */
const MOUND_BUMPS = [];
for (let i = 0; i < 15; i++) MOUND_BUMPS.push(rrange(-1, 1));

function moundGeom() {
  const s = 0.22 + 0.78 * easeOut(clamp(G.moundS, 0, 1));
  const punch = (G.patPunch || 0) * 0.05;
  return { R: MOUND_R * s * (1 - punch), H: MOUND_R * 1.18 * s * (1 - punch * 2), s };
}

function drawMound(dusk, lit) {
  const { R, H, s } = moundGeom();
  const smoothK = easeOut(G.patS); // 固めるほどなめらか
  const snowTop = mix3([252, 253, 255], [188, 182, 218], dusk);
  const snowBot = mix3([214, 230, 248], [130, 130, 178], dusk);
  const sh = mix3([180, 202, 234], [104, 104, 156], dusk);

  // 影
  ctx.fillStyle = rgb(sh, 0.42);
  ctx.beginPath(); ctx.ellipse(MX + R * 0.15, MB + 8, R * 1.35, R * 0.22, 0, 0, TAU); ctx.fill();

  // ドーム
  const N = 15;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = Math.PI - Math.PI * i / N;
    const wob = 1 + (1 - smoothK) * 0.09 * MOUND_BUMPS[Math.min(i, N - 1)];
    pts.push({ x: MX + Math.cos(a) * R * 1.12 * wob, y: MB - Math.sin(a) * H * wob });
  }
  ctx.beginPath();
  smoothOpen(pts);
  ctx.lineTo(MX + R * 1.12, MB + 4);
  ctx.lineTo(MX - R * 1.12, MB + 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, MB - H, 0, MB);
  g.addColorStop(0, rgb(snowTop));
  g.addColorStop(1, rgb(snowBot));
  ctx.fillStyle = g;
  ctx.fill();

  // ふわふわ→固い質感：固める前は点描のもこもこ、後はつやすじ
  if (smoothK < 0.9) {
    ctx.fillStyle = rgb(sh, 0.22 * (1 - smoothK));
    for (let i = 0; i < 12; i++) {
      const a = 0.35 + (i / 12) * 2.4;
      const rr = R * (0.35 + (i % 4) * 0.16);
      ctx.beginPath();
      ctx.arc(MX + Math.cos(a) * rr * 0.9, MB - 10 - Math.abs(Math.sin(a)) * H * 0.55, R * 0.09, 0, TAU);
      ctx.fill();
    }
  }
  if (smoothK > 0.15) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * smoothK})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(MX - R * 0.2, MB - H * 0.28, R * 0.78, -2.4, -1.1);
    ctx.stroke();
    ctx.strokeStyle = rgb(sh, 0.3 * smoothK);
    ctx.beginPath();
    ctx.arc(MX + R * 0.1, MB - H * 0.2, R * 0.92, -0.5, 0.6);
    ctx.stroke();
  }
  // ペタペタの手あと
  for (const m of G.patMarks) {
    const px = MX + Math.cos(m.a) * R * m.r * 1.02;
    const py = MB - Math.abs(Math.sin(m.a)) * H * m.r * 0.9 - H * 0.08;
    ctx.fillStyle = rgb(sh, 0.3);
    ctx.beginPath(); ctx.ellipse(px, py, 10 * m.s * s, 13 * m.s * s, m.a * 0.2, 0, TAU); ctx.fill();
  }

  drawMoundHole(dusk, lit, R, H);
}

/* 入口の穴（雪の断面リム付き） */
function holeSize() {
  const k = easeOut(clamp(G.holeS, 0, 1));
  return { hw: 8 + 78 * k, hh: 12 + 128 * k, k };
}
function holePath(hw, hh, grow) {
  const w = hw * (grow || 1), h = hh * (grow || 1);
  ctx.beginPath();
  ctx.moveTo(MX - w, MB + 3);
  ctx.bezierCurveTo(MX - w, MB - h * 0.8, MX - w * 0.65, MB - h, MX, MB - h);
  ctx.bezierCurveTo(MX + w * 0.65, MB - h, MX + w, MB - h * 0.8, MX + w, MB + 3);
  ctx.closePath();
}
function drawMoundHole(dusk, lit, R, H) {
  if (G.holeS < 0.02) return;
  const { hw, hh } = holeSize();
  // 断面リム（掘った雪の白い縁 + 青い内側）
  holePath(hw + 9, hh + 8);
  ctx.fillStyle = rgb(mix3([255, 255, 255], [210, 200, 230], dusk));
  ctx.fill();
  holePath(hw + 4, hh + 4);
  ctx.fillStyle = rgb(mix3([190, 214, 242], [140, 140, 190], dusk));
  ctx.fill();
  // 穴の中
  holePath(hw, hh);
  if (lit) {
    const g = ctx.createRadialGradient(MX, MB - hh * 0.35, 4, MX, MB - hh * 0.35, hh * 1.1);
    g.addColorStop(0, 'rgb(255,224,150)');
    g.addColorStop(0.6, 'rgb(255,178,92)');
    g.addColorStop(1, 'rgb(200,110,50)');
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, MB - hh, 0, MB);
    g.addColorStop(0, 'rgb(24,42,74)');
    g.addColorStop(1, 'rgb(10,22,44)');
    ctx.fillStyle = g;
  }
  ctx.fill();
  if (lit) {
    // 入口から雪面にこぼれる暖色光
    const g2 = ctx.createRadialGradient(MX, MB + 4, 2, MX, MB + 4, R * 1.5);
    g2.addColorStop(0, 'rgba(255,190,100,0.55)');
    g2.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.ellipse(MX, MB + 10, R * 1.5, R * 0.4, 0, 0, TAU); ctx.fill();
    // 雪壁を薄く透ける暖色（Hero: 光を透過する雪壁）
    const g3 = ctx.createRadialGradient(MX, MB - H * 0.4, 6, MX, MB - H * 0.4, R * 1.15);
    g3.addColorStop(0, 'rgba(255,180,100,0.34)');
    g3.addColorStop(0.7, 'rgba(255,170,110,0.1)');
    g3.addColorStop(1, 'rgba(255,170,110,0)');
    ctx.fillStyle = g3;
    ctx.beginPath();
    ctx.ellipse(MX, MB - H * 0.42, R * 1.05, H * 0.62, 0, 0, TAU);
    ctx.fill();
  }
}

/* ---------- 転がる雪玉 ---------- */
function drawBalls(dusk) {
  for (const b of G.balls) {
    const t = easeInOut(clamp(b.t, 0, 1));
    const x = lerp(b.from, MX + (b.side === 'L' ? -60 : 60), t);
    const r = lerp(16, 30, t);
    const y = MB + 2 - r;
    ctx.fillStyle = rgb(mix3([252, 253, 255], [186, 180, 214], dusk));
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(170,196,230,0.6)';
    ctx.lineWidth = 2.5;
    const rot = t * 7 * (b.side === 'L' ? 1 : -1);
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, rot, rot + 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.85, rot + 2.5, rot + 3.8); ctx.stroke();
    // 押している子ども
    drawKid(x + (b.side === 'L' ? -r - 16 : r + 16), MB + 4, 0.95, 'push', b.side === 'R');
  }
}

/* ---------- 掘り雪の塊 ---------- */
function drawChunks(dusk) {
  ctx.fillStyle = rgb(mix3([250, 252, 255], [190, 184, 216], dusk));
  for (const c of G.chunks) {
    ctx.globalAlpha = clamp(c.life, 0, 1);
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- 子ども ---------- */
function drawKid(x, y, s, pose, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  const bob = pose === 'idle' ? Math.sin(G.time * 2.2) * 1.6 : 0;
  const duck = pose === 'duck' ? 0.6 : 1;
  ctx.translate(0, bob);
  if (pose === 'push') ctx.rotate(0.18);
  if (pose === 'sit') ctx.translate(0, 6);
  // 影
  ctx.fillStyle = 'rgba(150,178,215,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 2, 20, 6, 0, 0, TAU); ctx.fill();
  // ブーツ
  ctx.fillStyle = '#4a5f8c';
  roundRect(-14, -10, 12, 11, 4); ctx.fill();
  roundRect(2, -10, 12, 11, 4); ctx.fill();
  // 体（スノーウェア）
  ctx.fillStyle = '#ff8f80';
  ctx.save();
  ctx.scale(1, duck);
  roundRect(-16, -46 / 1, 32, 40, 13); ctx.fill();
  // 腕（ミトン）
  ctx.fillStyle = '#ff8f80';
  if (pose === 'push') {
    roundRect(8, -44, 22, 9, 4.5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(31, -39, 6, 0, TAU); ctx.fill();
  } else if (pose === 'wave') {
    ctx.save(); ctx.rotate(-0.6 + Math.sin(G.time * 6) * 0.18);
    roundRect(8, -52, 9, 24, 4.5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(12, -54, 6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ff8f80';
    roundRect(-18, -40, 9, 18, 4.5); ctx.fill();
  } else if (pose === 'clap') {
    const cl = Math.abs(Math.sin(G.time * 8));
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-6 - cl * 6, -34, 6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6 + cl * 6, -34, 6, 0, TAU); ctx.fill();
  } else {
    roundRect(-19, -42, 9, 20, 4.5); ctx.fill();
    roundRect(10, -42, 9, 20, 4.5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-14, -21, 5.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(15, -21, 5.5, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // 頭
  const hy = -46 * duck - 12;
  ctx.fillStyle = '#ffe3cd';
  ctx.beginPath(); ctx.arc(0, hy, 15, 0, TAU); ctx.fill();
  // 帽子
  ctx.fillStyle = '#e25c5c';
  ctx.beginPath(); ctx.arc(0, hy - 4, 15, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(-15, hy - 7, 30, 6, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(0, hy - 19, 6, 0, TAU); ctx.fill();
  // 顔
  ctx.fillStyle = '#5b4238';
  ctx.beginPath(); ctx.arc(-5, hy + 2, 1.8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(5, hy + 2, 1.8, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,150,140,0.55)';
  ctx.beginPath(); ctx.arc(-8, hy + 6, 3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(8, hy + 6, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#5b4238'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, hy + 5, 4, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.restore();
}

/* ---------- 大人（見守り） ---------- */
function drawAdult(x, y, s, pose, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  ctx.fillStyle = 'rgba(150,178,215,0.4)';
  ctx.beginPath(); ctx.ellipse(0, 2, 24, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3c5570';
  roundRect(-15, -14, 13, 15, 5); ctx.fill();
  roundRect(3, -14, 13, 15, 5); ctx.fill();
  ctx.fillStyle = '#4f948d';
  roundRect(-19, -66, 38, 55, 14); ctx.fill();
  ctx.fillStyle = '#4f948d';
  if (pose === 'wave') {
    ctx.save(); ctx.rotate(-0.5 + Math.sin(G.time * 5) * 0.15);
    roundRect(10, -78, 10, 30, 5); ctx.fill();
    ctx.fillStyle = '#f3d9c3';
    ctx.beginPath(); ctx.arc(15, -80, 6.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#4f948d';
    roundRect(-22, -60, 10, 26, 5); ctx.fill();
  } else {
    roundRect(-23, -62, 10, 28, 5); ctx.fill();
    roundRect(13, -62, 10, 28, 5); ctx.fill();
  }
  const hy = -80;
  ctx.fillStyle = '#f3d9c3';
  ctx.beginPath(); ctx.arc(0, hy, 16, 0, TAU); ctx.fill();
  ctx.fillStyle = '#35526b';
  ctx.beginPath(); ctx.arc(0, hy - 5, 16, Math.PI, 0); ctx.closePath(); ctx.fill();
  roundRect(-16, hy - 9, 32, 6, 3); ctx.fill();
  ctx.fillStyle = '#4a3a30';
  ctx.beginPath(); ctx.arc(-5, hy + 2, 1.8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(5, hy + 2, 1.8, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4a3a30'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, hy + 5, 4.5, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.restore();
}

/* ---------- スコップ ---------- */
function drawShovel(x, y, swing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5 - swing * 0.9);
  // 柄
  ctx.fillStyle = '#b98a5a';
  roundRect(-5, -86, 10, 70, 5); ctx.fill();
  ctx.fillStyle = '#a1734a';
  roundRect(-12, -98, 24, 14, 7); ctx.fill();
  // 大きな雪スコップ
  ctx.fillStyle = '#5f8fd6';
  ctx.beginPath();
  ctx.moveTo(-20, -18);
  ctx.quadraticCurveTo(-24, 22, 0, 30);
  ctx.quadraticCurveTo(24, 22, 20, -18);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(-13, -14); ctx.quadraticCurveTo(-16, 14, 0, 22);
  ctx.lineTo(0, -16); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- 降雪 ---------- */
function drawSnowfall() {
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const f of FLAKES) {
    const x = (f.x + Math.sin(G.time * 0.5 + f.ph) * 0.02) * cw;
    const y = ((f.y + G.time * f.v) % 1.05) * ch;
    ctx.globalAlpha = 0.4 + 0.5 * Math.sin(f.ph + G.time);
    ctx.beginPath(); ctx.arc(x, y, f.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- キラキラ（スクリーン） ---------- */
function drawSparkles() {
  for (const s of G.sparkles) {
    const a = clamp(s.life, 0, 1);
    const r = s.r * (0.6 + 0.4 * Math.sin(G.time * 8 + s.ph));
    ctx.fillStyle = rgb(s.col, a);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.ph + G.time * 2);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.3 * Math.cos(i * Math.PI / 2 + 0.4), r * 0.3 * Math.sin(i * Math.PI / 2 + 0.4));
      ctx.lineTo(r * 1.6 * Math.cos(i * Math.PI / 2), r * 1.6 * Math.sin(i * Math.PI / 2));
      ctx.lineTo(r * 0.3 * Math.cos(i * Math.PI / 2 - 0.4), r * 0.3 * Math.sin(i * Math.PI / 2 - 0.4));
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/* ---------- 外の雪原シーン ---------- */
function drawExterior(dusk, lit) {
  drawSky(dusk);
  const s = camScale();
  ctx.save();
  ctx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (cw / 2 - G.camNow.x * s), DPR * (ch / 2 - G.camNow.y * s));
  drawHills(dusk);
  drawGround(dusk);
  drawTree(78, 350, 1.05, dusk);
  drawTree(925, 345, 0.9, dusk);
  drawTree(645, 332, 0.62, dusk);
  drawHouse(248, 332, 1, [186, 110, 88], dusk);
  drawHouse(775, 326, 0.85, [150, 118, 150], dusk);
  // 遠くの小さな雪山（雪国らしさ）
  ctx.fillStyle = rgb(mix3([240, 247, 254], [166, 160, 198], dusk));
  ctx.beginPath();
  ctx.moveTo(30, 640); ctx.quadraticCurveTo(95, 560, 165, 640); ctx.closePath(); ctx.fill();

  if (G.phase === 'gather' || G.phase === 'title') {
    drawSidePile(180, G.leftSnow, Math.ceil(PUSHES_NEED / 2), dusk);
    drawSidePile(820, G.rightSnow, Math.ceil(PUSHES_NEED / 2), dusk);
  }
  drawMound(dusk, lit);
  drawChunks(dusk);
  drawBalls(dusk);

  // キャラクター
  if (G.phase === 'title') {
    drawKid(390, 604, 1, 'idle', false);
    drawAdult(860, 600, 1, 'idle', true);
  } else if (G.phase === 'gather') {
    if (G.balls.length === 0) drawKid(G.kid.x, G.kid.y, 1, 'idle', G.kid.flip);
    drawAdult(880, 598, 1, 'idle', true);
  } else if (G.phase === 'pat' || G.phase === 'tofront') {
    drawKid(MX - moundGeom().R - 40, 604, 1, 'idle', false);
  } else if (G.phase === 'dig') {
    drawKid(MX - moundGeom().R - 46, 604, 1, 'idle', false);
    drawAdult(MX + moundGeom().R + 70, 600, 1, 'idle', true);
  } else if (G.phase === 'enter') {
    const hop = Math.abs(Math.sin(G.time * 3)) * 6;
    drawKid(MX - holeSize().hw - 34, 602 - hop, 1, 'idle', false);
    drawAdult(MX + moundGeom().R + 70, 600, 1, 'idle', true);
  } else if (G.phase === 'goin') {
    // スルッと入る演出
    const t = G.goinT;
    if (t < 0.45) {
      const k = t / 0.45;
      const kx = lerp(MX - holeSize().hw - 34, MX, easeInOut(k));
      drawKid(kx, 602, 1 - 0.25 * k, k > 0.5 ? 'duck' : 'idle', false);
    }
    drawAdult(MX + moundGeom().R + 70, 600, 1, 'idle', true);
  } else if (G.phase === 'reveal' || G.phase === 'toreveal') {
    drawKid(MX - moundGeom().R - 60, 606, 1, 'wave', false);
    drawAdult(MX - moundGeom().R - 110, 602, 1, 'wave', false);
  }

  // 掘り中の大スコップ（指に追従）
  if (G.phase === 'dig') {
    const p = G.pointer.down ? screenToWorld(G.pointer.x, G.pointer.y) : { x: MX + 130, y: MB - 40 };
    drawShovel(p.x, p.y, G.digSwing || 0);
  }
  ctx.restore();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

/* ---------- 内部シーン ---------- */
function drawInterior() {
  const IN = G.IN;
  const { cx, cy, M } = interiorGeom();
  const warm = IN.warm;

  // 雪の中の闇（壁の向こう）
  const outCool = [18, 30, 56], outWarm = [46, 32, 40];
  ctx.fillStyle = rgb(mix3(outCool, outWarm, warm));
  ctx.fillRect(0, 0, cw, ch);

  // 空洞の形（セクター半径からブロブ）
  const pts = [];
  for (let i = 0; i < IN.N; i++) {
    const a = i / IN.N * TAU;
    const r = sectorRadius(i);
    pts.push({ x: cx + Math.cos(a) * r * 1.06, y: cy + Math.sin(a) * r });
  }
  blobPath(pts);

  // 壁のグラデーション（Hero: 青白い雪壁 → 暖色に透ける）
  const inner = mix3([236, 246, 254], [255, 233, 196], warm);
  const mid = mix3([176, 205, 238], [244, 190, 130], warm);
  const edge = mix3([120, 154, 200], [196, 138, 92], warm);
  const lt = lanternTarget();
  const lightX = warm > 0.02 ? lt.x : cx, lightY = warm > 0.02 ? lt.y - M * 0.05 : cy + M * 0.08;
  const rg = ctx.createRadialGradient(lightX, lightY, M * 0.02, cx, cy, M * 0.62);
  rg.addColorStop(0, rgb(inner));
  rg.addColorStop(0.55, rgb(mid));
  rg.addColorStop(1, rgb(edge));
  ctx.fillStyle = rg;
  ctx.fill();

  ctx.save();
  blobPath(pts);
  ctx.clip();

  // 床
  const floorY = cy + M * 0.17;
  const fg = ctx.createLinearGradient(0, floorY, 0, floorY + M * 0.45);
  fg.addColorStop(0, rgb(mix3([224, 238, 250], [255, 226, 180], warm)));
  fg.addColorStop(1, rgb(mix3([185, 210, 238], [235, 178, 120], warm)));
  ctx.fillStyle = fg;
  ctx.fillRect(cx - M, floorY, M * 2, M);
  ctx.fillStyle = rgb(mix3([200, 222, 244], [246, 205, 152], warm), 0.8);
  ctx.beginPath(); ctx.ellipse(cx, floorY + 2, M * 0.55, M * 0.05, 0, 0, TAU); ctx.fill();

  // 入口（外の光が見える小さなアーチ）
  const exW = M * 0.075, exH = M * 0.12;
  const exY = floorY + M * 0.01;
  ctx.beginPath();
  ctx.moveTo(cx - exW, exY);
  ctx.bezierCurveTo(cx - exW, exY - exH, cx + exW, exY - exH, cx + exW, exY);
  ctx.closePath();
  const dayCol = mix3([225, 242, 255], [130, 120, 170], G.dusk);
  ctx.fillStyle = rgb(dayCol);
  ctx.fill();
  ctx.strokeStyle = rgb(mix3([255, 255, 255], [255, 230, 200], warm), 0.8);
  ctx.lineWidth = M * 0.012;
  ctx.stroke();

  // 削り跡（Hero: 削った雪の断面）
  for (const g of IN.grooves) {
    const i = Math.round(((g.a + TAU) % TAU) / TAU * IN.N) % IN.N;
    const r = sectorRadius(i) * g.rr;
    ctx.strokeStyle = rgb(mix3([222, 238, 252], [255, 226, 186], warm), 0.55 * g.life);
    ctx.lineWidth = M * 0.014;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, g.a - g.len, g.a + g.len);
    ctx.stroke();
  }

  // 壁の縁のかげ（丸み）
  blobPath(pts);
  ctx.strokeStyle = rgb(mix3([100, 134, 184], [180, 120, 80], warm), 0.5);
  ctx.lineWidth = M * 0.035;
  ctx.stroke();

  // 雪のベンチ（掘り残し）
  if (IN.benchShown) {
    const bx = cx + M * 0.26, by = floorY + M * 0.015;
    ctx.fillStyle = rgb(mix3([214, 232, 248], [250, 214, 164], warm));
    roundRect(bx - M * 0.1, by - M * 0.075, M * 0.2, M * 0.085, M * 0.03); ctx.fill();
    ctx.fillStyle = rgb(mix3([238, 247, 254], [255, 236, 198], warm));
    roundRect(bx - M * 0.115, by - M * 0.095, M * 0.23, M * 0.045, M * 0.022); ctx.fill();
    ctx.fillStyle = rgb(mix3([170, 198, 230], [222, 168, 116], warm), 0.5);
    ctx.beginPath(); ctx.ellipse(bx, by + M * 0.012, M * 0.12, M * 0.02, 0, 0, TAU); ctx.fill();
  }

  // 雪の粉
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const s of IN.shavings) {
    ctx.globalAlpha = clamp(s.life, 0, 1) * 0.9;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ランタン設置ターゲット
  if (G.phase === 'lantern' && !IN.lantern.placed) {
    const pulse = 0.7 + 0.3 * Math.sin(G.time * 4);
    ctx.strokeStyle = `rgba(255,214,140,${0.65 * pulse})`;
    ctx.lineWidth = M * 0.012;
    ctx.setLineDash([M * 0.03, M * 0.025]);
    ctx.beginPath(); ctx.ellipse(lt.x, lt.y, M * 0.11 * pulse + M * 0.02, M * 0.055 * pulse + M * 0.012, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }

  // グロー中：子どもが座って拍手
  if (G.phase === 'glow') {
    drawKidScreen(cx - M * 0.24, floorY + M * 0.02, M / 260, 'clap');
  }

  ctx.restore();

  // ランタン本体（LED・電池式）
  if (G.phase === 'lantern' || G.phase === 'glow') {
    drawLantern(IN.lantern.x, IN.lantern.y, M / 340, IN.lantern.placed, warm);
  }

  // 暖色の全体グロー
  if (warm > 0.01) {
    const gg = ctx.createRadialGradient(lt.x, lt.y - M * 0.04, M * 0.01, lt.x, lt.y - M * 0.04, M * 0.85);
    gg.addColorStop(0, `rgba(255,190,110,${0.4 * warm})`);
    gg.addColorStop(0.5, `rgba(255,170,90,${0.14 * warm})`);
    gg.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
  }

  // 導入フェードイン（穴からスルッの直後）
  if (IN.intro < 1) {
    ctx.fillStyle = `rgba(8,16,34,${1 - easeOut(IN.intro)})`;
    ctx.fillRect(0, 0, cw, ch);
  }

  // 周辺減光
  const vg = ctx.createRadialGradient(cx, cy, M * 0.3, cx, cy, Math.max(cw, ch) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(6,10,26,${0.5 - 0.2 * warm})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cw, ch);
}

/* スクリーン座標で子どもを描く（内部用） */
function drawKidScreen(x, y, s, pose) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * 2.2, s * 2.2);
  ctx.translate(-0, 0);
  drawKidBody(pose);
  ctx.restore();
}
function drawKidBody(pose) {
  // drawKidの中身をスケール済み座標で再利用（簡易版：座り姿）
  ctx.fillStyle = '#ff8f80';
  roundRect(-16, -40, 32, 34, 13); ctx.fill();
  ctx.fillStyle = '#4a5f8c';
  roundRect(-16, -8, 13, 9, 4); ctx.fill();
  roundRect(3, -8, 13, 9, 4); ctx.fill();
  const cl = Math.abs(Math.sin(G.time * 8));
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-6 - cl * 6, -28, 6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(6 + cl * 6, -28, 6, 0, TAU); ctx.fill();
  const hy = -52;
  ctx.fillStyle = '#ffe3cd';
  ctx.beginPath(); ctx.arc(0, hy, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e25c5c';
  ctx.beginPath(); ctx.arc(0, hy - 4, 15, Math.PI, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  roundRect(-15, hy - 7, 30, 6, 3); ctx.fill();
  ctx.beginPath(); ctx.arc(0, hy - 19, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5b4238';
  ctx.beginPath(); ctx.arc(-5, hy + 2, 1.8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(5, hy + 2, 1.8, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#5b4238'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, hy + 6, 5, 0.25, Math.PI - 0.25); ctx.stroke();
  ctx.fillStyle = 'rgba(255,150,140,0.55)';
  ctx.beginPath(); ctx.arc(-9, hy + 6, 3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(9, hy + 6, 3, 0, TAU); ctx.fill();
}

/* ---------- LEDランタン（電池式・火なし） ---------- */
function drawLantern(x, y, s, lit, warm) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (lit) {
    const glow = ctx.createRadialGradient(0, -26, 4, 0, -26, 140);
    glow.addColorStop(0, `rgba(255,206,120,${0.8})`);
    glow.addColorStop(0.4, `rgba(255,180,90,${0.32})`);
    glow.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, -26, 140, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // 持ち手
  ctx.strokeStyle = '#8b93a8';
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, -52, 16, Math.PI * 0.15, Math.PI * 0.85, false); ctx.stroke();
  // 上ぶた
  ctx.fillStyle = '#9aa3ba';
  roundRect(-20, -56, 40, 12, 5); ctx.fill();
  // ガラス部（LEDが入っている）
  ctx.fillStyle = lit ? 'rgba(255,222,150,0.95)' : 'rgba(205,220,238,0.9)';
  roundRect(-17, -46, 34, 34, 8); ctx.fill();
  // LED素子
  ctx.fillStyle = lit ? '#fff4d0' : '#eef2f8';
  ctx.beginPath(); ctx.arc(0, -29, lit ? 9 : 6, 0, TAU); ctx.fill();
  if (lit) {
    ctx.strokeStyle = 'rgba(255,244,208,0.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + G.time * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 13, -29 + Math.sin(a) * 13);
      ctx.lineTo(Math.cos(a) * 19, -29 + Math.sin(a) * 19);
      ctx.stroke();
    }
  }
  // 電池ボックス（火ではないことを伝える台座＋スイッチ）
  ctx.fillStyle = '#7c86a0';
  roundRect(-20, -12, 40, 14, 6); ctx.fill();
  ctx.fillStyle = lit ? '#8fe08a' : '#cdd4e2';
  ctx.beginPath(); ctx.arc(10, -5, 3.5, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- ヒントの手（ミトン） ---------- */
function drawHand(x, y, press) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.5);
  const s = 1 - press * 0.15;
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(40,60,100,0.25)';
  ctx.beginPath(); ctx.ellipse(3, 26, 17, 8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#d66';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 19, 0, 0, TAU);
  ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-13, 8, 7, 9, 0.7, 0, TAU);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e25c5c';
  roundRect(-13, 15, 26, 12, 6); ctx.fill();
  ctx.restore();
}

function hintSpec() {
  switch (G.phase) {
    case 'title': {
      const b = titleBtn();
      return { type: 'tap', from: { x: b.x, y: b.y } };
    }
    case 'gather': {
      const side = (G.leftSnow >= G.rightSnow) ? 'L' : 'R';
      const pileX = side === 'L' ? 180 : 820;
      const a = worldToScreen(pileX, MB - 30);
      const b = worldToScreen(MX + (side === 'L' ? -85 : 85), MB - 40);
      return { type: 'drag', from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y } };
    }
    case 'pat': {
      const m = moundGeom();
      const p = worldToScreen(MX, MB - m.H * 0.75);
      return { type: 'tap', from: { x: p.x, y: p.y } };
    }
    case 'dig': {
      const p = worldToScreen(MX, MB - 42);
      return { type: 'tap', from: { x: p.x, y: p.y } };
    }
    case 'enter': {
      const p = worldToScreen(MX, MB - 45);
      return { type: 'tap', from: { x: p.x, y: p.y } };
    }
    case 'carve': {
      const IN = G.IN;
      const { cx, cy } = interiorGeom();
      let best = 0, bi = 0;
      for (let i = 0; i < IN.N; i++) {
        if (1 - IN.grow[i] > best) { best = 1 - IN.grow[i]; bi = i; }
      }
      const a0 = bi / IN.N * TAU;
      const r = sectorRadius(bi) * 0.8;
      const p1 = { x: cx + Math.cos(a0 - 0.35) * r, y: cy + Math.sin(a0 - 0.35) * r };
      const p2 = { x: cx + Math.cos(a0 + 0.35) * r, y: cy + Math.sin(a0 + 0.35) * r };
      // 画面内に収める
      p1.x = clamp(p1.x, 20, cw - 20); p1.y = clamp(p1.y, 20, ch - 20);
      p2.x = clamp(p2.x, 20, cw - 20); p2.y = clamp(p2.y, 20, ch - 20);
      return { type: 'drag', from: p1, to: p2 };
    }
    case 'lantern': {
      const IN = G.IN;
      if (IN.lantern.placed) return null;
      const t = lanternTarget();
      return { type: 'drag', from: { x: IN.lantern.x, y: IN.lantern.y }, to: t };
    }
    case 'reveal': {
      const b = replayBtn();
      return { type: 'tap', from: { x: b.x, y: b.y } };
    }
    default: return null;
  }
}

function drawHint() {
  if (G.pointer.down) return;
  if (G.time - G.lastInput < 1.4 && G.phase !== 'title' && G.phase !== 'enter') return;
  const spec = hintSpec();
  if (!spec) return;
  const t = (G.time % 1.6) / 1.6;
  if (spec.type === 'tap') {
    const press = t < 0.5 ? Math.sin(t * Math.PI * 2) : 0;
    drawHand(spec.from.x + 14, spec.from.y + 22 - press * 10, press);
    if (t > 0.1 && t < 0.6) {
      const rr = (t - 0.1) * 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - rr)})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(spec.from.x, spec.from.y, 14 + rr * 34, 0, TAU); ctx.stroke();
    }
  } else {
    const k = easeInOut(t);
    const x = lerp(spec.from.x, spec.to.x, k);
    const y = lerp(spec.from.y, spec.to.y, k);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(spec.from.x, spec.from.y);
    ctx.quadraticCurveTo((spec.from.x + spec.to.x) / 2, Math.min(spec.from.y, spec.to.y) - 24, spec.to.x, spec.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawHand(x + 12, y + 20, 0.5);
  }
}

/* ---------- タイトル・リプレイUI ---------- */
function drawTitleUI() {
  const b = titleBtn();
  // タイトルロゴ（装飾）
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.min(cw * 0.09, 52);
  ctx.font = `bold ${fs}px ui-rounded, "Hiragino Maru Gothic ProN", "BIZ UDGothic", sans-serif`;
  ctx.lineWidth = fs * 0.28;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineJoin = 'round';
  const ty = ch * 0.16 + Math.sin(G.time * 1.5) * 4;
  ctx.strokeText('かまくら つくろう', cw / 2, ty);
  ctx.fillStyle = '#3d6ea8';
  ctx.fillText('かまくら つくろう', cw / 2, ty);
  // ボタン
  const pulse = 1 + Math.sin(G.time * 3) * 0.05;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(80,120,180,0.5)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ff9a56';
  ctx.beginPath();
  ctx.moveTo(b.x - b.r * 0.28, b.y - b.r * 0.42);
  ctx.lineTo(b.x + b.r * 0.5, b.y);
  ctx.lineTo(b.x - b.r * 0.28, b.y + b.r * 0.42);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawReplayUI() {
  if (G.t < dur(1.6)) return;
  const b = replayBtn();
  const pulse = 1 + Math.sin(G.time * 3) * 0.05;
  ctx.save();
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * pulse, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(30,40,80,0.5)';
  ctx.shadowBlur = 14;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ff9a56';
  ctx.lineWidth = b.r * 0.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 0.5, -0.4, Math.PI * 1.4);
  ctx.stroke();
  const aa = -0.4;
  const ax = b.x + Math.cos(aa) * b.r * 0.5, ay = b.y + Math.sin(aa) * b.r * 0.5;
  ctx.fillStyle = '#ff9a56';
  ctx.beginPath();
  ctx.moveTo(ax + b.r * 0.3, ay - b.r * 0.05);
  ctx.lineTo(ax - b.r * 0.16, ay - b.r * 0.3);
  ctx.lineTo(ax - b.r * 0.12, ay + b.r * 0.28);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ---------- 「中に入る」ズーム演出 ---------- */
function drawGoInOverlay() {
  const t = G.goinT;
  if (t < 0.35) return;
  // 穴の闇が画面を包む
  const k = easeInOut(clamp((t - 0.35) / 0.65, 0, 1));
  const p = worldToScreen(MX, MB - 45);
  const maxR = Math.hypot(cw, ch);
  const r = lerp(camScale() * holeSize().hh * 0.9, maxR, k);
  ctx.fillStyle = 'rgb(10,20,42)';
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  ctx.ellipse(p.x, p.y, r * 0.8, r, 0, 0, TAU, true);
  ctx.fill('evenodd');
  // トンネルのリング（前へ進む感じ）
  if (k > 0.15) {
    for (let i = 0; i < 3; i++) {
      const rk = ((t * 2.2 + i * 0.33) % 1);
      ctx.strokeStyle = `rgba(140,175,220,${(1 - rk) * 0.4 * k})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r * 0.8 * rk, r * rk, 0, 0, TAU);
      ctx.stroke();
    }
  }
}

/* ---------- メイン描画 ---------- */
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const phase = G.phase;
  const interior = (phase === 'carve' || phase === 'lantern' || phase === 'glow');

  if (interior) {
    drawInterior();
  } else if (phase === 'toreveal' || phase === 'reveal') {
    drawExterior(G.dusk, true);
    drawSnowfall();
    if (phase === 'reveal') drawReplayUI();
  } else {
    drawExterior(0, false);
    drawSnowfall();
    if (phase === 'title') drawTitleUI();
    if (phase === 'goin') drawGoInOverlay();
  }

  drawSparkles();
  drawHint();

  // フェード遷移オーバーレイ
  if (G.trans) {
    const half = G.trans.dur / 2;
    const a = G.trans.t < half ? G.trans.t / half : 1 - (G.trans.t - half) / half;
    ctx.fillStyle = rgb(G.trans.color, clamp(a, 0, 1));
    ctx.fillRect(0, 0, cw, ch);
  }
}

/* ---------- メインループ ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
resetGame(false);

/* ---------- E2E用フック ---------- */
window.game = {
  get phase() { return G.phase; },
  get pushes() { return G.pushes; },
  get pats() { return G.pats; },
  get digs() { return G.digs; },
  get carve() { return G.IN ? interiorAvg() : 0; },
  get warm() { return G.IN ? G.IN.warm : 0; },
  get size() { return { w: cw, h: ch, dpr: DPR }; },
  hint: hintSpec,
  version: 1
};

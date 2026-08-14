// ゲームの進行。
//   かわいた街を見る → おなじ雨 → 水があふれる → とめる
//   → 排水口/壁をひとつ変える → やりなおす → おなじ雨 → くらべる
// この輪をなんども回せることがいちばん大事。

import { createCity, W, H, idx, TT, canPlaceWall, canDig, digAt, clearDig, DIG_MAX, MAX_WALLS } from './city.js';
import { createSim, resetWater, stepSim, openDrain, setWall, RUN_TICKS, rainRate } from './sim.js';
import { createRenderer, drawMinimap } from './render.js';
import { createCamera, fitCamera, look, lookWide, updateCamera, snapCamera, screenToWorld, worldToScreen } from './camera.js';
import { unproject, isoX, isoY, setProjection } from './iso.js';
import { createAudio } from './audio.js';

const WALL_LEN = 11;
const DIG_R = 1.7;      // ゆびでほるみぞの太さ

export function createGame(root) {
  const canvas = root.querySelector('#view');
  const city = createCity();
  const sim = createSim(city);
  const renderer = createRenderer(canvas);
  const cam = createCamera();
  const audio = createAudio();

  const el = {
    play: root.querySelector('#btn-play'),
    reset: root.querySelector('#btn-reset'),
    sound: root.querySelector('#btn-sound'),
    again: root.querySelector('#btn-again'),
    toolWall: root.querySelector('#tool-wall'),
    toolDig: root.querySelector('#tool-dig'),
    toolHand: root.querySelector('#tool-hand'),
    result: root.querySelector('#result'),
    mapBefore: root.querySelector('#map-before'),
    mapAfter: root.querySelector('#map-after'),
    slotBefore: root.querySelector('#slot-before'),
    scores: root.querySelector('#scores'),
    hint: root.querySelector('#hint'),
  };

  const g = {
    city, sim, renderer, cam, audio, el,
    state: 'dry',           // dry | raining | paused | review
    tool: 'hand',
    runs: [],               // これまでの結果
    ui: { hintDrain: null, wallGhost: null, digAt: null, crossFade: 0, ghost: null, badges: null },
    crossTimer: 0,
    autoplayTimer: 0,
    autoStopped: false,
    hintEl: null,
    ghost: null,
    pullBackTimer: 0,
    acc: 0,
    last: 0,
    frameMs: 16,
    scale: 1,
    dead: false,
  };

  layout(g);
  window.addEventListener('resize', () => layout(g));
  window.addEventListener('orientationchange', () => setTimeout(() => layout(g), 220));
  lookWide(cam);
  snapCamera(cam);
  hintFor(g);

  bindUi(g);
  bindPointer(g, canvas);
  updateToolBadges(g);

  requestAnimationFrame((t) => { g.last = t; loop(g, t); });
  return g;
}

// 大きな iPad で塗る面積が増えすぎないよう、実ピクセル数に上限をつける
const MAX_PIXELS = 2_400_000;

function layout(g) {
  const vw = Math.max(320, window.innerWidth);
  const vh = Math.max(320, window.innerHeight);
  const cap = Math.sqrt(MAX_PIXELS / (vw * vh));
  const dpr = Math.min(2, window.devicePixelRatio || 1, cap) * g.scale;
  g.renderer.resize(vw, vh, dpr);
  // たて長の画面では見おろす角度を急にして、街を大きく見せる
  const changed = setProjection(vh > vw * 1.25 ? 13 : 10);
  fitCamera(g.cam, vw, vh);
  if (changed) snapCamera(g.cam);
}

// ---------- メインループ ----------
function loop(g, t) {
  if (g.dead) return;
  const dt = Math.min(100, t - g.last);
  g.last = t;
  g.frameMs = g.frameMs * 0.92 + dt * 0.08;

  if (g.state === 'raining') {
    g.acc += dt;
    let steps = 0;
    while (g.acc >= 16.667 && steps < 3) {
      g.acc -= 16.667;
      tickSim(g);
      steps++;
    }
    if (g.acc > 60) g.acc = 0;
  }

  if (g.crossTimer > 0) {
    g.crossTimer -= dt;
    g.ui.crossFade = Math.min(1, g.ui.crossFade + 0.08);
  } else {
    g.ui.crossFade = Math.max(0, g.ui.crossFade - 0.06);
  }

  g.ui.badges = g.sim.stats.watch;
  g.ui.ghost = (g.state === 'raining' || g.state === 'paused') ? g.ghost : null;
  g.cam.dpr = g.renderer.dpr;
  updateCamera(g.cam);
  g.renderer.draw(g.sim, g.cam, g.ui);
  updateHint(g);
  adaptQuality(g);
  requestAnimationFrame((tt) => loop(g, tt));
}

// 重い端末では解像度をすこし落とす（見た目より 60fps を優先）
function adaptQuality(g) {
  // キャンバスの作りなおしは重い。ゆっくり、少しずつ。
  g.adaptWait = (g.adaptWait || 0) - 1;
  if (g.adaptWait > 0) return;
  if (g.frameMs > 26 && g.scale > 0.6) { g.scale -= 0.08; layout(g); g.adaptWait = 30; }
  else if (g.frameMs < 13 && g.scale < 1) { g.scale = Math.min(1, g.scale + 0.06); layout(g); g.adaptWait = 120; }
}

function tickSim(g) {
  const { sim, renderer, audio } = g;
  stepSim(sim);

  for (const ev of sim.events) {
    if (ev.t === 'splash') {
      if (renderer.fx.length < 90) renderer.addFx('splash', ev.x, ev.y, { life: 16, solid: ev.solid });
    } else if (ev.t === 'suck') {
      renderer.addFx('suck', ev.x, ev.y, { life: 18 });
    } else if (ev.t === 'suckStart') {
      audio.suck();
    } else if (ev.t === 'firstStream') {
      director(g, 'stream');
    } else if (ev.t === 'rampIn') {
      director(g, 'ramp', ev);
    } else if (ev.t === 'plazaPool') {
      director(g, 'pool', ev);
    } else if (ev.t === 'overflow') {
      director(g, 'overflow', ev);
      audio.splash();
      // はじめての1回だけ、水が入った所で自分で止まって「なおしてね」を見せる。
      // ここが「23秒ただ見ているだけ」をなくす、いちばん効く仕掛け。
      if (g.runs.length === 0 && !g.autoStopped) {
        g.autoStopped = true;
        clearTimeout(g.autoStopTimer);
        g.autoStopTimer = setTimeout(() => { if (g.state === 'raining') pause(g); }, 2400);
      }
    }
  }

  audio.setRain(rainRate(sim.tick));

  // 演出のきりかえ
  if (sim.tick === 42) director(g, 'rainStart');
  if (sim.tick === 1000) director(g, 'rainEnd');

  // おわり
  const done = sim.tick >= RUN_TICKS || (sim.tick > 1080 && landWater(sim) < 1.2);
  if (done) endRun(g);
}

function landWater(sim) {
  const { d, city } = sim;
  let s = 0;
  for (let i = 0; i < d.length; i++) if (city.type[i] !== TT.RIVER) s += d[i];
  return s;
}

// ---------- カメラ演出 ----------
function director(g, what, ev) {
  const { cam, city } = g;
  switch (what) {
    case 'rainStart': lookWide(cam, 1, 90); break;
    case 'stream': look(cam, 47, 49, 2.0, 2, 130); break;
    case 'ramp': look(cam, ev.x, ev.y + 4, 2.3, 3, 150); break;
    case 'pool': look(cam, city.low.x + 2, city.low.y - 6, 1.75, 4, 170); break;
    case 'overflow': look(cam, (city.entrance.x0 + city.entrance.x1) / 2, (city.entrance.y0 + city.entrance.y1) / 2 + 2, 2.9, 6, 260); break;
    case 'rainEnd': look(cam, city.low.x, city.low.y - 4, 1.4, 2, 120); break;
    case 'drain': look(cam, ev.x, ev.y, 3.3, 8, 210); break;
    case 'wide': lookWide(cam, 9, 120); break;
    default: break;
  }
}

// ---------- 進行 ----------
function play(g) {
  clearTimeout(g.autoplayTimer);
  g.audio.unlock();
  if (g.state === 'raining') { pause(g); return; }
  if (g.state === 'review') hideResult(g);
  // 「とちゅうで止めた雨」だけつづきから。それ以外は必ず最初から降らせる。
  const resuming = g.state === 'paused' && g.sim.tick > 0 && g.sim.tick < RUN_TICKS;
  if (!resuming) {
    resetWater(g.sim);
    g.renderer.fx.length = 0;
  }
  g.state = 'raining';
  g.el.play.classList.add('is-playing');
  g.el.play.classList.remove('pulse');
  hintFor(g);
  if (g.sim.tick < 5) lookWide(g.cam, 1, 60);
}

function pause(g) {
  if (g.state !== 'raining') return;
  g.state = 'paused';
  g.el.play.classList.remove('is-playing');
  g.audio.setRain(0);
  hintFor(g);
}

// 街をかわいた最初の状態へ。壁と排水口はそのまま。
function resetCity(g, autoplay = false) {
  clearTimeout(g.autoplayTimer);
  g.audio.unlock();
  hideResult(g);
  resetWater(g.sim);
  g.renderer.fx.length = 0;
  g.state = 'dry';
  g.acc = 0;
  g.el.play.classList.remove('is-playing');
  g.el.play.classList.add('pulse');
  g.audio.setRain(0);
  lookWide(g.cam, 9, 40);
  hintFor(g);
  clearTimeout(g.autoplayTimer);
  if (autoplay) g.autoplayTimer = setTimeout(() => play(g), 700);
}

function endRun(g) {
  const { sim } = g;
  g.state = 'review';
  g.el.play.classList.remove('is-playing');
  g.audio.setRain(0);

  const run = {
    maxd: Float32Array.from(sim.maxd),
    under: sim.stats.under,
    plaza: sim.stats.plaza,
    drained: sim.stats.drained,
    wet: sim.stats.wet,
    watch: { ...sim.stats.watch },
  };
  g.runs.push(run);
  // つぎの回は、前回の水ぎわを重ねて見せる（違いがその場で分かる）
  g.ghost = { maxd: run.maxd, key: g.runs.length };
  director(g, 'wide');
  showResult(g);
  g.audio.chime();
}

// ---------- 介入 ----------
function tapWorld(g, gx, gy) {
  const { city, sim } = g;

  // 排水口をさわる（大きめの当たり）。開いていれば、ふたを閉められる＝何度でも試せる。
  let best = null, bestD = 1e9;
  for (const d of city.drains) {
    if (d.id === 'north') continue;      // 見本の排水口はいじらない
    const dist = Math.hypot(d.x + 0.5 - gx, d.y + 0.5 - gy);
    if (dist < d.r + 5 && dist < bestD) { best = d; bestD = dist; }
  }
  if (best) {
    if (best.state === 'open') closeDrain(g, best);
    else activateDrain(g, best);
    return true;
  }

  // 置いてある壁をさわると取れる
  for (const wl of city.walls) {
    if (Math.hypot(wl.x - gx, wl.y - gy) < 6) {
      city.walls = city.walls.filter((w) => w !== wl);
      setWall(sim, null);
      for (const w of city.walls) setWall(sim, w);
      g.audio.thud();
      hintFor(g);
      return true;
    }
  }
  return false;
}

function closeDrain(g, d) {
  d.state = 'closed';
  d.flow = 0;
  g.audio.thud();
  g.renderer.addFx('ring', d.x + 0.5, d.y + 0.5, { life: 22, max: 4, color: 'rgba(190,200,210,.9)' });
  hintFor(g);
}

function activateDrain(g, d) {
  const { sim, renderer, audio } = g;
  const was = openDrain(sim, d.id);
  if (!was) return;
  audio.unlock();

  if (was === 'clogged') {
    // 葉っぱが とんでいく
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * 6.2832;
      renderer.addFx('leaf', d.x + 0.5 + Math.cos(a) * 1.5, d.y + 0.5 + Math.sin(a) * 1.5, {
        vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4 - 0.6, life: 46, tone: k % 3,
      });
    }
    d.leaves = 0;
  }
  renderer.addFx('ring', d.x + 0.5, d.y + 0.5, { life: 34, max: 6, color: 'rgba(255,255,255,.9)' });
  audio.suck();
  director(g, 'drain', { x: d.x + 0.5, y: d.y + 0.5 });
  clearTimeout(g.pullBackTimer);
  g.pullBackTimer = setTimeout(() => {
    if (g.state !== 'raining') lookWide(g.cam, 9, 60);
  }, 5200);
  g.ui.hintDrain = null;
  // まず「うず」を見せてから、地下のようすを出す
  setTimeout(() => { g.crossTimer = 3600; }, 1500);
  hideHint(g);
}

// 指でなぞらずに置いた（＝ただのタップ）ときは、地面の下り方向と直角にする。
function autoOrient(city, x, y) {
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const sx = cl(x, 4, W - 5), sy = cl(y, 4, H - 5);
  const at = (ax, ay) => {
    const i = idx(ax, ay);
    return city.solid[i] === 1 ? city.ground[i] + 2 : city.ground[i];
  };
  const dx = at(sx + 3, sy) - at(sx - 3, sy);
  const dy = at(sx, sy + 3) - at(sx, sy - 3);
  return Math.abs(dy) >= Math.abs(dx);   // 南北に流れる → 東西にのびる壁
}

function makeGhost(g, gx, gy, from) {
  const x = Math.round(gx), y = Math.round(gy);
  let horizontal;
  if (from) {
    const dx = gx - from.x, dy = gy - from.y;
    // なぞった線にそって壁ができる（線を引く＝壁を引く）
    horizontal = Math.hypot(dx, dy) > 2.5 ? Math.abs(dx) > Math.abs(dy) : autoOrient(g.city, x, y);
  } else {
    horizontal = autoOrient(g.city, x, y);
  }
  const wl = { x, y, horizontal, len: WALL_LEN };
  wl.ok = canPlaceWall(g.city, wl);
  return wl;
}

// ---------- 入力 ----------
// 道具は「トレイのボタンから地図へそのままドラッグ」できる。
// タップして選んでから地図をなぞってもよい（どちらでも同じ）。
function bindPointer(g, canvas) {
  let drag = null;

  const toGrid = (e) => {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(g.cam, e.clientX - r.left, e.clientY - r.top);
    return unproject(w.x, w.y);
  };

  const start = (kind, e, fromTray) => {
    g.audio.unlock();
    drag = { kind, trail: [], moved: 0, sx: e.clientX, sy: e.clientY, fromTray, wasOn: g.tool === kind };
    if (!fromTray) move(e);
  };

  const move = (e) => {
    if (!drag) return;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
    const p = toGrid(e);
    if (p.x < -4 || p.y < -4 || p.x > W + 4 || p.y > H + 4) return;
    // 直近のなぞり跡だけを見て向きを決める。
    // トレイから引っぱってきた場合、出発点はボタンの上なので使えない。
    drag.trail.push({ x: p.x, y: p.y });
    if (drag.trail.length > 10) drag.trail.shift();
    if (drag.kind === 'wall') {
      const from = drag.trail.length >= 4 ? drag.trail[0] : null;
      g.ui.wallGhost = makeGhost(g, p.x, p.y, from);
    } else if (drag.kind === 'dig') {
      const ok = canDig(g.city, Math.round(p.x), Math.round(p.y)) && g.city.digLeft > 0;
      g.ui.digAt = { x: p.x, y: p.y, r: DIG_R, ok };
      if (ok) {
        const n = digAt(g.city, p.x, p.y, DIG_R);
        if (n) { updateToolBadges(g); if (!g.digSoundAt || g.renderer.time - g.digSoundAt > 8) { g.audio.dig(); g.digSoundAt = g.renderer.time; } }
      }
    }
  };

  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    g.ui.digAt = null;
    const gh = g.ui.wallGhost;
    g.ui.wallGhost = null;
    const tapped = d.moved < 8;

    // トレイのボタンを「ただ押した」ときの意味:
    //   えらばれていない道具 → えらぶだけ
    //   すでにえらばれている道具 → 置いたもの/ほったみぞを全部もどして、手にもどる
    if (d.fromTray && tapped) {
      if (d.wasOn) {
        if (d.kind === 'wall' && g.city.walls.length) { setWall(g.sim, null); g.audio.thud(); }
        if (d.kind === 'dig' && g.city.digLeft < DIG_MAX) { clearDig(g.city); g.audio.thud(); }
        updateToolBadges(g);
        hintFor(g);
        setTool(g, 'hand');
      }
      return;
    }

    if (d.kind === 'wall' && gh && gh.ok) {
      setWall(g.sim, { x: gh.x, y: gh.y, horizontal: gh.horizontal, len: WALL_LEN });
      g.audio.thud();
      g.renderer.addFx('ring', gh.x, gh.y, { life: 26, max: 7, color: 'rgba(255,220,120,.9)' });
      updateToolBadges(g);
      hintFor(g);
      setTool(g, 'hand');   // 土のうは 1 つずつ置く
    }
    // スコップは選ばれたまま。みぞは何回かに分けてなぞるものなので、
    // ひと筆ごとに道具が外れると描けない。
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (g.tool === 'hand') { g.audio.unlock(); const p = toGrid(e); tapWorld(g, p.x, p.y); return; }
    start(g.tool, e, false);
  });

  // トレイのボタンを押したまま地図へ引っぱれる
  for (const [elm, kind] of [[g.el.toolWall, 'wall'], [g.el.toolDig, 'dig']]) {
    if (!elm) continue;
    elm.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      start(kind, e, true);
      setTool(g, kind);
    });
  }

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

function setTool(g, tool) {
  g.tool = tool;
  g.el.toolWall.classList.toggle('is-on', tool === 'wall');
  if (g.el.toolDig) g.el.toolDig.classList.toggle('is-on', tool === 'dig');
  g.el.toolHand.classList.toggle('is-on', tool === 'hand');
}

// 道具の残り（土のうの数・スコップの残り）をボタンに出す
function updateToolBadges(g) {
  const { city } = g;
  g.el.toolWall.style.setProperty('--fill', `${Math.round(((MAX_WALLS - city.walls.length) / MAX_WALLS) * 100)}%`);
  g.el.toolWall.classList.toggle('is-empty', city.walls.length >= MAX_WALLS);
  if (g.el.toolDig) {
    g.el.toolDig.style.setProperty('--fill', `${Math.round((city.digLeft / DIG_MAX) * 100)}%`);
    g.el.toolDig.classList.toggle('is-empty', city.digLeft <= 0);
  }
}

function bindUi(g) {
  const tap = (elm, fn) => {
    if (!elm) return;
    elm.addEventListener('click', (e) => { e.preventDefault(); g.audio.unlock(); g.audio.pop(); fn(); });
  };
  tap(g.el.play, () => play(g));
  tap(g.el.reset, () => resetCity(g));
  tap(g.el.again, () => resetCity(g));
  tap(g.el.toolHand, () => setTool(g, 'hand'));
  g.el.result.addEventListener('pointerdown', (e) => {
    if (e.target === g.el.result) resetCity(g);
  });
  tap(g.el.sound, () => {
    g.audio.setMuted(!g.audio.muted);
    g.el.sound.classList.toggle('is-muted', g.audio.muted);
  });
}

// ---------- ヒント（文字なし） ----------
function hintFor(g) {
  const { city } = g;
  const clog = city.drains.find((d) => d.state === 'clogged');
  const closed = city.drains.find((d) => d.id !== 'north' && d.state === 'closed');
  const target = clog || closed;
  g.ui.hintDrain = target ? target.id : null;

  // まだ一度も雨を見ていないうちは、まず PLAY を指さす。
  const firstTime = g.runs.length === 0 && !g.autoStopped;
  g.hintEl = (firstTime && g.state !== 'raining') ? g.el.play : null;
  g.el.play.classList.toggle('pulse', g.state !== 'raining');
}

function hideHint(g) {
  g.el.hint.classList.add('hidden');
}

// さわってほしい所へ、ゆびのしるしを重ねる。
// 雨がふっているあいだも出す（＝止めなくても直せる、と分かるように）。
function updateHint(g) {
  const el = g.el.hint;
  if (g.tool !== 'hand' || g.state === 'review') { el.classList.add('hidden'); return; }

  let px, py;
  if (g.hintEl) {
    const r = g.hintEl.getBoundingClientRect();
    px = r.left + r.width * 0.5;
    py = r.top + r.height * 0.5;
  } else {
    const d = g.ui.hintDrain && g.city.drains.find((x) => x.id === g.ui.hintDrain);
    if (!d) { el.classList.add('hidden'); return; }
    const p = worldToScreen(g.cam, isoX(d.x + 0.5, d.y + 0.5), isoY(d.x + 0.5, d.y + 0.5));
    const m = 34;
    if (p.x < m || p.y < m || p.x > g.cam.vw - m || p.y > g.cam.vh - m) { el.classList.add('hidden'); return; }
    px = p.x; py = p.y;
  }
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
  el.classList.remove('hidden');
}

// ---------- 結果くらべ ----------
function showResult(g) {
  const runs = g.runs;
  const cur = runs[runs.length - 1];
  const prev = runs.length > 1 ? runs[runs.length - 2] : null;

  drawMinimap(g.el.mapAfter, g.city, cur.maxd, cur.under);
  if (prev) drawMinimap(g.el.mapBefore, g.city, prev.maxd, prev.under);
  g.el.result.classList.toggle('first-run', !prev);

  g.el.scores.innerHTML = '';
  for (const id of ['under', 'shop', 'play']) {
    const v = cur.watch[id] || 0;
    const was = prev ? (prev.watch[id] || 0) : null;
    const wrap = document.createElement('div');
    wrap.className = 'score' + (v < 0.08 ? ' is-safe' : v > 0.75 ? ' is-bad' : '');
    // まえの回とくらべて増えた／減ったを、小さな矢印で見せる
    const arrow = was === null || Math.abs(v - was) < 0.08 ? ''
      : `<span class="delta ${v < was ? 'down' : 'up'}"></span>`;
    wrap.innerHTML = `<div class="glass"><div class="fill" style="height:0%"></div>${arrow}</div>${iconSvg(id)}`;
    g.el.scores.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.querySelector('.fill').style.height = Math.round(v * 100) + '%';
    });
  }

  g.el.result.classList.remove('hidden');
  g.el.result.setAttribute('aria-hidden', 'false');
  hintFor(g);
}

function hideResult(g) {
  g.el.result.classList.add('hidden');
  g.el.result.setAttribute('aria-hidden', 'true');
}

function iconSvg(kind) {
  if (kind === 'play') {
    return `<svg viewBox="0 0 48 48"><path class="ink" d="M10 40L24 8l14 32M24 8v26M15 34h18"/></svg>`;
  }
  if (kind === 'under') {
    return `<svg viewBox="0 0 48 48"><path class="ink" d="M8 40h10V30h10V20h12V10"/></svg>`;
  }
  return `<svg viewBox="0 0 48 48"><path class="ink" d="M10 20v20h28V20M6 20l4-10h28l4 10z"/><path class="ink" d="M20 40V28h8v12"/></svg>`;
}

// ---------- テスト用フック ----------
export function attachTestHooks(g) {
  window.__game = g;
  window.__test = {
    play: () => play(g),
    pause: () => pause(g),
    reset: (autoplay = false) => resetCity(g, autoplay),
    state: () => g.state,
    tick: () => g.sim.tick,
    // 論理時間を直接すすめる（描画やタイマーを待たない）
    run: (n = RUN_TICKS) => {
      const before = g.state;
      g.state = 'raining';
      for (let i = 0; i < n && g.state === 'raining'; i++) tickSim(g);
      if (g.state === 'raining') g.state = before;
      return stats(g);
    },
    tap: (gx, gy) => tapWorld(g, gx, gy),
    openDrain: (id) => {
      const d = g.city.drains.find((x) => x.id === id);
      if (d) activateDrain(g, d);
      return d ? d.state : null;
    },
    wall: (x, y, horizontal) => {
      const gh = makeGhost(g, x, y);
      if (horizontal !== undefined) { gh.horizontal = horizontal; gh.ok = canPlaceWall(g.city, gh); }
      if (!gh.ok) return false;
      setWall(g.sim, { x: gh.x, y: gh.y, horizontal: gh.horizontal, len: WALL_LEN });
      return true;
    },
    clearWall: () => setWall(g.sim, null),
    // 街を出荷時の状態へ（テストが介入ごとに切りかえるため）
    restoreCity: () => {
      for (const d of g.city.drains) {
        d.state = d.id === 'plaza' ? 'clogged' : d.id === 'big' ? 'closed' : 'open';
        d.flow = 0;
        if (d.id === 'plaza') d.leaves = 9;
      }
      setWall(g.sim, null);
      clearDig(g.city);
      resetWater(g.sim);
      g.renderer.fx.length = 0;
      g.ghost = null;
      updateToolBadges(g);
    },
    stats: () => stats(g),
    runs: () => g.runs.map((r) => ({ under: r.under, shop: r.shop, plaza: r.plaza, drained: r.drained, wet: r.wet })),
    camera: () => ({ x: g.cam.x, y: g.cam.y, zoom: g.cam.zoom, fit: g.cam.fit }),
    // グリッド座標 → 画面座標（テストが本物のタップを送るために使う）
    screenOf: (gx, gy) => worldToScreen(g.cam, isoX(gx, gy), isoY(gx, gy)),
    drain: (id) => {
      const d = g.city.drains.find((x) => x.id === id);
      return d && { id: d.id, x: d.x, y: d.y, state: d.state, leaves: d.leaves };
    },
    ui: () => ({ hintDrain: g.ui.hintDrain, crossFade: g.ui.crossFade, tool: g.tool }),
    resultVisible: () => !g.el.result.classList.contains('hidden'),
    setTool: (t) => setTool(g, t),
    dig: (x, y) => { const n = digAt(g.city, x, y, DIG_R); updateToolBadges(g); return n; },
    digLine: (x0, y0, x1, y1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2.2);
      let t = 0;
      for (let k = 0; k <= n; k++) t += digAt(g.city, x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, DIG_R);
      updateToolBadges(g);
      return t;
    },
    clearDig: () => { clearDig(g.city); updateToolBadges(g); },
    autoStopped: () => g.autoStopped,
    hintTarget: () => (g.hintEl ? g.hintEl.id : g.ui.hintDrain),
    hintVisible: () => !g.el.hint.classList.contains('hidden'),
    fps: () => 1000 / g.frameMs,
    profile: (frames = 90) => new Promise((res) => {
      g.renderer.prof = {};
      let n = 0;
      const t0 = performance.now();
      const step = () => (++n < frames) ? requestAnimationFrame(step)
        : res({ total: (performance.now() - t0) / n, parts: Object.fromEntries(
            Object.entries(g.renderer.prof).map(([k, v]) => [k, +(v / n).toFixed(2)])) },
          g.renderer.prof = null);
      requestAnimationFrame(step);
    }),
    scale: () => g.scale,
  };
}

function stats(g) {
  const s = g.sim.stats;
  return {
    tick: g.sim.tick,
    under: s.under, shop: s.shop, plaza: s.plaza, drained: s.drained, wet: s.wet,
    flags: { ...g.sim.flags },
    land: landWater(g.sim),
    floaters: g.sim.floaters.length,
    drops: g.sim.drops.length,
    drains: g.city.drains.map((d) => ({ id: d.id, state: d.state, flow: d.flow || 0 })),
    walls: g.city.walls.length,
    dug: DIG_MAX - g.city.digLeft,
    watch: { ...g.sim.stats.watch },
  };
}

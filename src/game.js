// ゲームの進行。
//   かわいた街を見る → おなじ雨 → 水があふれる → とめる
//   → 排水口/壁をひとつ変える → やりなおす → おなじ雨 → くらべる
// この輪をなんども回せることがいちばん大事。

import { createCity, W, H, idx, TT, canPlaceWall } from './city.js';
import { createSim, resetWater, stepSim, openDrain, setWall, RUN_TICKS, rainRate } from './sim.js';
import { createRenderer, drawMinimap } from './render.js';
import { createCamera, fitCamera, look, lookWide, updateCamera, snapCamera, screenToWorld, worldToScreen } from './camera.js';
import { unproject, isoX, isoY } from './iso.js';
import { createAudio } from './audio.js';

const WALL_LEN = 11;

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
    prevMaxd: null,
    ui: { hintDrain: null, wallGhost: null, crossFade: 0, crossKind: 'open' },
    crossTimer: 0,
    autoplayTimer: 0,
    changedSinceRun: false,
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

  requestAnimationFrame((t) => { g.last = t; loop(g, t); });
  return g;
}

function layout(g) {
  const vw = Math.max(320, window.innerWidth);
  const vh = Math.max(320, window.innerHeight);
  const dpr = Math.min(2, window.devicePixelRatio || 1) * g.scale;
  g.renderer.resize(vw, vh, dpr);
  fitCamera(g.cam, vw, vh);
  // 目標ズームを新しい fit に合わせなおす
  const rel = g.cam.tzoom / (g.cam.fit || 1);
  g.cam.tzoom = g.cam.fit * (isFinite(rel) && rel > 0.2 ? rel : 1.5);
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

  updateCamera(g.cam);
  g.renderer.draw(g.sim, g.cam, g.ui);
  adaptQuality(g);
  requestAnimationFrame((tt) => loop(g, tt));
}

// 重い端末では解像度をすこし落とす（見た目より 60fps を優先）
function adaptQuality(g) {
  if (g.frameMs > 26 && g.scale > 0.62) { g.scale -= 0.06; layout(g); }
  else if (g.frameMs < 15 && g.scale < 1) { g.scale = Math.min(1, g.scale + 0.02); layout(g); }
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
  g.changedSinceRun = false;
  g.el.play.classList.add('is-playing');
  g.el.play.classList.remove('pulse');
  hideHint(g);
  g.ui.hintDrain = null;
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
    shop: sim.stats.shop,
    plaza: sim.stats.plaza,
    drained: sim.stats.drained,
    wet: sim.stats.wet,
  };
  g.runs.push(run);
  director(g, 'wide');
  showResult(g);
  g.audio.chime();
}

// ---------- 介入 ----------
function tapWorld(g, gx, gy) {
  const { city, sim } = g;

  // 排水口をさわる（大きめの当たり）
  let best = null, bestD = 1e9;
  for (const d of city.drains) {
    if (d.state === 'open') continue;
    const dist = Math.hypot(d.x + 0.5 - gx, d.y + 0.5 - gy);
    if (dist < d.r + 5 && dist < bestD) { best = d; bestD = dist; }
  }
  if (best) { activateDrain(g, best); return true; }

  // 置いてある壁をさわると取れる
  if (city.walls.length) {
    const wl = city.walls[0];
    if (Math.hypot(wl.x - gx, wl.y - gy) < 7) {
      setWall(sim, null);
      g.audio.thud();
      g.changedSinceRun = true;
      return true;
    }
  }
  return false;
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
  g.ui.hintDrain = null;
  g.ui.crossKind = was;
  // まず「うず」を見せてから、地下のようすを出す
  setTimeout(() => { g.crossTimer = 3600; }, 1500);
  g.changedSinceRun = true;
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
function bindPointer(g, canvas) {
  let dragging = false;
  let dragFrom = null;

  const toGrid = (e) => {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(g.cam, e.clientX - r.left, e.clientY - r.top);
    return unproject(w.x, w.y);
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    g.audio.unlock();
    const p = toGrid(e);
    if (g.tool === 'wall') {
      dragging = true;
      dragFrom = { x: p.x, y: p.y };
      g.ui.wallGhost = makeGhost(g, p.x, p.y, null);
    } else {
      tapWorld(g, p.x, p.y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const p = toGrid(e);
    g.ui.wallGhost = makeGhost(g, p.x, p.y, dragFrom);
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    dragFrom = null;
    const gh = g.ui.wallGhost;
    g.ui.wallGhost = null;
    if (gh && gh.ok) {
      setWall(g.sim, { x: gh.x, y: gh.y, horizontal: gh.horizontal, len: WALL_LEN });
      g.audio.thud();
      g.changedSinceRun = true;
      g.renderer.addFx('ring', gh.x, gh.y, { life: 26, max: 7, color: 'rgba(255,220,120,.9)' });
      setTool(g, 'hand');
      hideHint(g);
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function setTool(g, tool) {
  g.tool = tool;
  g.el.toolWall.classList.toggle('is-on', tool === 'wall');
  g.el.toolHand.classList.toggle('is-on', tool === 'hand');
}

function bindUi(g) {
  const tap = (elm, fn) => {
    if (!elm) return;
    elm.addEventListener('click', (e) => { e.preventDefault(); g.audio.unlock(); g.audio.pop(); fn(); });
  };
  tap(g.el.play, () => play(g));
  tap(g.el.reset, () => resetCity(g));
  tap(g.el.again, () => resetCity(g, true));
  tap(g.el.toolWall, () => setTool(g, g.tool === 'wall' ? 'hand' : 'wall'));
  tap(g.el.toolHand, () => setTool(g, 'hand'));
  tap(g.el.sound, () => {
    g.audio.setMuted(!g.audio.muted);
    g.el.sound.classList.toggle('is-muted', g.audio.muted);
  });
}

// ---------- ヒント（文字なし） ----------
function hintFor(g) {
  const { city } = g;
  const clog = city.drains.find((d) => d.state === 'clogged');
  const closed = city.drains.find((d) => d.state === 'closed');
  if (g.runs.length === 0) {
    g.ui.hintDrain = null;
    g.el.play.classList.add('pulse');
    return;
  }
  const target = clog || closed;
  g.ui.hintDrain = target ? target.id : null;
  g.el.play.classList.add('pulse');
}

function hideHint(g) {
  g.el.hint.classList.add('hidden');
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
  const gauges = [
    { v: Math.min(1, cur.under / 120), icon: 'stairs' },
    { v: Math.min(1, cur.shop / 0.24), icon: 'shop' },
    { v: Math.min(1, cur.plaza / 0.28), icon: 'plaza' },
  ];
  for (const ga of gauges) {
    const wrap = document.createElement('div');
    wrap.className = 'score';
    wrap.innerHTML = `<div class="glass"><div class="fill" style="height:0%"></div></div>${iconSvg(ga.icon)}`;
    g.el.scores.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.querySelector('.fill').style.height = Math.round(ga.v * 100) + '%';
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
  if (kind === 'stairs') {
    return `<svg viewBox="0 0 48 48"><path class="ink" d="M8 40h10V30h10V20h12V10"/></svg>`;
  }
  if (kind === 'shop') {
    return `<svg viewBox="0 0 48 48"><path class="ink" d="M10 20v20h28V20M6 20l4-10h28l4 10z"/><path class="ink" d="M20 40V28h8v12"/></svg>`;
  }
  return `<svg viewBox="0 0 48 48"><path class="ink" d="M6 34h36M12 34V20h24v14"/><path class="ink" d="M18 34v-8h12v8"/></svg>`;
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
      resetWater(g.sim);
      g.renderer.fx.length = 0;
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
    fps: () => 1000 / g.frameMs,
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
  };
}

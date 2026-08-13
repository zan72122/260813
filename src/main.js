import { Renderer } from './renderer.js';
import { Game, STAGE } from './game.js';
import { Audio } from './audio.js';

const qs = new URLSearchParams(location.search);
const E2E = qs.get('e2e') === '1';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('gl'));
const veil = document.getElementById('veil');
const hint = document.getElementById('hint');
const choices = document.getElementById('choices');
const dots = Array.from(document.querySelectorAll('#dots i'));
const soundBtn = document.getElementById('sound');

/* ---------------------------------------------------------------- boot */
let renderer;
try {
  renderer = new Renderer(canvas, { preserveDrawingBuffer: E2E });
} catch (err) {
  veil.innerHTML =
    '<div style="font:600 18px/1.6 system-ui;color:#444;text-align:center;padding:24px">' +
    '🌈<br>この ブラウザでは あそべません<br>' +
    '<span style="font-size:13px;opacity:.7">WebGL needed</span></div>';
  throw err;
}

const audio = new Audio(!E2E);
const game = new Game({
  seed: E2E ? Number(qs.get('seed') || 12345) : (Math.random() * 1e9) | 0,
  audio: E2E ? null : audio,
  onStage: (s) => onStageChanged(s),
});

/* ------------------------------------------------------- sizing / quality */
let renderScale = 1.0;
let maxScale = 1.0;
let cssW = 0, cssH = 0, dpr = 1;

function computeDpr() {
  let d = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  // never chase a huge backing store just because the panel is dense
  const budget = 2600000;
  if (w * h * d * d > budget) d = Math.max(1, Math.sqrt(budget / (w * h)));
  return d;
}

function syncSize(force) {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (!force && w === cssW && h === cssH) return;
  cssW = w; cssH = h;
  dpr = computeDpr();
  renderer.resize(cssW, cssH, dpr, renderScale);
}

window.addEventListener('resize', () => syncSize(true), { passive: true });
window.addEventListener('orientationchange', () => setTimeout(() => syncSize(true), 60), { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => syncSize(true), { passive: true });
}

/* -------------------------------------------------- world <-> screen maths */
function worldFromClient(cx, cy) {
  const r = canvas.getBoundingClientRect();
  const mn = Math.min(r.width, r.height) || 1;
  const ux = ((cx - r.left) - r.width / 2) / mn * 2;
  const uy = -(((cy - r.top) - r.height / 2) / mn * 2);
  return { x: ux / game.cam.z + game.cam.x, y: uy / game.cam.z + game.cam.y };
}
function screenFromWorld(wx, wy) {
  const r = canvas.getBoundingClientRect();
  const mn = Math.min(r.width, r.height) || 1;
  return {
    x: r.width / 2 + (wx - game.cam.x) * game.cam.z * mn / 2,
    y: r.height / 2 - (wy - game.cam.y) * game.cam.z * mn / 2,
  };
}

/* ------------------------------------------------------------------ input */
let active = null;
let veilGone = false;

function dismissVeil() {
  if (veilGone) return;
  veilGone = true;
  veil.classList.add('off');
  if (!E2E) audio.unlock();
}

/**
 * Turning the ring must work even if the finger never traces a real circle:
 * near the rim we use the tangential component, near the middle we fall back
 * to plain left/right, and we blend between them.
 */
function ringDelta(prev, cur) {
  const R = Math.max(game.ring.r, 0.25);
  const mx = (prev.x + cur.x) * 0.5;
  const my = (prev.y + cur.y) * 0.5;
  const r = Math.hypot(mx, my);
  const dx = cur.x - prev.x;
  const dy = cur.y - prev.y;
  let dCirc = 0;
  if (r > 1e-4) {
    dCirc = (dx * (-my / r) + dy * (mx / r)) / Math.max(r, R * 0.45);
  }
  const dHoriz = -dx / R * 0.9;
  const w = smoothstep(0.26, 0.70, r / R);
  return (dHoriz * (1 - w) + dCirc * w) * 1.30;
}

canvas.addEventListener('pointerdown', (e) => {
  if (active) return; // one finger is all this game ever needs
  dismissVeil();
  canvas.setPointerCapture?.(e.pointerId);
  const w = worldFromClient(e.clientX, e.clientY);
  const hitIdx = game.hitPart(w.x, w.y);
  const mode = game.pressEnabled() && hitIdx >= 0 ? 'press' : 'ring';
  active = {
    id: e.pointerId, mode, last: w, start: w,
    moved: 0, t0: performance.now(), lastT: performance.now(),
    press: mode === 'press' ? game.beginPress(w.x, w.y) : null,
  };
  e.preventDefault();
});

function onMove(e) {
  if (!active || e.pointerId !== active.id) return;
  const now = performance.now();
  const dt = Math.max((now - active.lastT) / 1000, 1 / 240);
  active.lastT = now;
  const w = worldFromClient(e.clientX, e.clientY);
  active.moved += Math.hypot(w.x - active.last.x, w.y - active.last.y);
  if (active.mode === 'ring') {
    game.turn(ringDelta(active.last, w), dt);
  } else if (active.press) {
    game.movePress(active.press, w.x, w.y);
  }
  active.last = w;
  e.preventDefault();
}
canvas.addEventListener('pointermove', onMove);

function endPointer(e) {
  if (!active || (e && e.pointerId !== active.id)) return;
  const dur = (performance.now() - active.t0) / 1000;
  const w = active.last;
  if (active.press) game.endPress(active.press);
  if (active.moved < 0.10 && dur < 0.45) game.tap(w.x, w.y);
  active = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', () => endPointer(null));

// keyboard nicety for desktop / testing
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    dismissVeil();
    game.turn((e.key === 'ArrowRight' ? -1 : 1) * 0.16, 1 / 60);
  } else if (e.key === ' ' || e.key === 'Enter') {
    dismissVeil();
    game.tap(0, 0);
  }
});

/* --------------------------------------------------------------------- UI */
function onStageChanged(s) {
  dots.forEach((d, i) => {
    d.classList.toggle('done', s - STAGE.RING > i);
    d.classList.toggle('now', s - STAGE.RING === i);
  });
  if (s !== STAGE.DONE) choices.classList.remove('on');
}

document.getElementById('btn-again').addEventListener('click', () => {
  choices.classList.remove('on');
  game.replay();
  if (!E2E) audio.chime();
});
document.getElementById('btn-new').addEventListener('click', () => {
  choices.classList.remove('on');
  game.nextOne();
  if (!E2E) audio.chime();
});

let soundOn = true;
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔔' : '🔕';
  soundBtn.style.opacity = soundOn ? '.55' : '.32';
  audio.setEnabled(soundOn);
});

const HINT_MODES = ['mode-tap', 'mode-circle', 'mode-press'];
function setHint(show, mode, sx, sy) {
  if (!show) { hint.classList.remove('on'); return; }
  const r = canvas.getBoundingClientRect();
  const px = clamp(sx, 64, r.width - 64);
  const py = clamp(sy, 74, r.height - 96);
  hint.style.left = px + 'px';
  hint.style.top = py + 'px';
  for (const m of HINT_MODES) if (m !== mode) hint.classList.remove(m);
  hint.classList.add(mode, 'on');
}

function updateHint() {
  if (active || !veilGone) { hint.classList.remove('on'); return; }
  const show = game.idle > 3.4;
  if (!show) { hint.classList.remove('on'); return; }
  const hero = game.parts[0];
  switch (game.stage) {
    case STAGE.INTRO:
    case STAGE.PLACE: {
      const p = screenFromWorld(hero.x, hero.y);
      setHint(true, 'mode-tap', p.x, p.y);
      break;
    }
    case STAGE.RING:
    case STAGE.WINDOW:
    case STAGE.DONE: {
      const a = game.ringAngle + 0.25;
      const p = screenFromWorld(Math.cos(a) * game.ring.r, Math.sin(a) * game.ring.r);
      setHint(game.stage !== STAGE.DONE || game.stageT < 12, 'mode-circle', p.x, p.y);
      break;
    }
    case STAGE.PRESS: {
      const p = screenFromWorld(hero.x, hero.y + hero.scale * 0.2);
      setHint(true, 'mode-press', p.x, p.y);
      break;
    }
    case STAGE.PARTS: {
      const i = Math.min(game.placedParts + 1, 2);
      const p = screenFromWorld([0, -0.95, 0.95][i], -0.02);
      setHint(game.placedParts < 2, 'mode-tap', p.x, p.y);
      break;
    }
    default:
      hint.classList.remove('on');
  }
}

/* ------------------------------------------------------------- main loop */
const uni = game.uniforms();
let frameNo = 0;
let last = performance.now();
let perfAcc = 0, perfFrames = 0, perfTimer = 0, settled = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (document.hidden) return;

  syncSize(false);
  game.update(dt);
  game.uniforms(uni);
  renderer.draw(uni);
  if (E2E) { window.__uniPost = uni.post; window.__uniPol = uni.pol; }

  frameNo++;
  updateHint();
  if (game.stage === STAGE.DONE && game.stageT > 1.3) choices.classList.add('on');
  if (!E2E) audio.setPad(0.5 + 0.5 * game.charge);

  /* adaptive resolution — mobile first, never chase pixels we can't afford */
  perfAcc += dt; perfFrames++; perfTimer += dt;
  if (perfTimer > 1.4 && !E2E) {
    const avg = perfAcc / Math.max(perfFrames, 1);
    perfAcc = 0; perfFrames = 0; perfTimer = 0;
    if (avg > 1 / 40) {
      if (renderScale > 0.62) { renderScale = Math.max(0.6, renderScale - 0.16); syncSize(true); settled = true; }
      else if (game.quality > 0) { game.quality--; settled = true; }
    } else if (avg < 1 / 57 && !settled) {
      if (renderScale < maxScale) { renderScale = Math.min(maxScale, renderScale + 0.1); syncSize(true); }
    }
  }
}

syncSize(true);
requestAnimationFrame(frame);

/* hooks for the smoke tests */
if (E2E) {
  window.__game = game;
  window.__ui = {
    dismissVeil,
    setStage: (s) => game.setStage(s),
    turn: (a) => game.turn(a, 1 / 60),
    press: (x, y) => { const p = game.beginPress(x, y); p.s = 1; return p; },
    tap: (x, y) => game.tap(x, y),
    frameNo: () => frameNo,
    /** advance n real rendered frames — SwiftShader is far slower than wall time */
    settle: (n = 3) => new Promise((res) => {
      const target = frameNo + n;
      (function poll() {
        if (frameNo >= target) res(frameNo);
        else requestAnimationFrame(poll);
      })();
    }),
    ready: true,
  };
  dismissVeil();
}

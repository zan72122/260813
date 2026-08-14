// Canvas plumbing: sizing, the game-driven camera, and a single-finger
// pointer. The child never controls the camera — stages request a world
// rectangle and the camera glides there.

import { clamp, damp } from './util.js';

export const screenSize = { w: 320, h: 480, dpr: 1, portrait: true };

let canvas = null;
let ctx = null;

export const camera = {
  x: 0, y: 0,           // world point shown at the centre of the screen
  rw: 1000, rh: 1000,   // world rect that must stay visible
  tx: 0, ty: 0, trw: 1000, trh: 1000,
  scale: 1,
  shake: 0,
  shakeX: 0, shakeY: 0,
  /** Ask for a world rect. `snap` jumps instantly (used on stage entry). */
  fit(x, y, w, h, snap = false) {
    this.tx = x; this.ty = y; this.trw = w; this.trh = h;
    if (snap) { this.x = x; this.y = y; this.rw = w; this.rh = h; }
  },
  kick(amount = 6) { this.shake = Math.max(this.shake, amount); },
  update(dt) {
    const k = 3.4;
    this.x = damp(this.x, this.tx, k, dt);
    this.y = damp(this.y, this.ty, k, dt);
    this.rw = damp(this.rw, this.trw, k, dt);
    this.rh = damp(this.rh, this.trh, k, dt);
    this.scale = Math.min(screenSize.w / this.rw, screenSize.h / this.rh);
    if (this.shake > 0.01) {
      this.shake = damp(this.shake, 0, 7, dt);
      this.shakeX = (Math.random() * 2 - 1) * this.shake;
      this.shakeY = (Math.random() * 2 - 1) * this.shake;
    } else {
      this.shake = 0; this.shakeX = 0; this.shakeY = 0;
    }
  },
  toWorld(sx, sy) {
    return {
      x: (sx - screenSize.w / 2 - this.shakeX) / this.scale + this.x,
      y: (sy - screenSize.h / 2 - this.shakeY) / this.scale + this.y,
    };
  },
  toScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.scale + screenSize.w / 2 + this.shakeX,
      y: (wy - this.y) * this.scale + screenSize.h / 2 + this.shakeY,
    };
  },
};

export function initCanvas(el) {
  canvas = el;
  ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(resize, 120), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize, { passive: true });
  }
  bindPointer(canvas);
  return ctx;
}

// Backing-store multiplier, trimmed automatically when frames run long.
let renderScale = 1;

/** 1.0 = full resolution, 0.6 = fewer pixels for older hardware. */
export function setRenderScale(k) {
  const next = clamp(k, 0.55, 1);
  if (Math.abs(next - renderScale) < 0.02) return false;
  renderScale = next;
  resize();
  return true;
}
export function getRenderScale() { return renderScale; }

export function resize() {
  if (!canvas) return;
  const w = Math.max(1, Math.round(window.innerWidth));
  const h = Math.max(1, Math.round(window.innerHeight));
  // Cap the backing store: a 3x buffer on a big iPad costs fill-rate we
  // would rather spend on a steady 60fps.
  const dpr = clamp((window.devicePixelRatio || 1) * renderScale, 1, 2);
  screenSize.w = w;
  screenSize.h = h;
  screenSize.dpr = dpr;
  screenSize.portrait = h >= w;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

export function beginWorld() {
  ctx.save();
  ctx.setTransform(screenSize.dpr, 0, 0, screenSize.dpr, 0, 0);
  ctx.translate(screenSize.w / 2 + camera.shakeX, screenSize.h / 2 + camera.shakeY);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
}
export function beginScreen() {
  ctx.save();
  ctx.setTransform(screenSize.dpr, 0, 0, screenSize.dpr, 0, 0);
}
export function end() { ctx.restore(); }

// --- pointer ----------------------------------------------------------
// One finger only. Extra touches are ignored outright so a palm resting
// on the iPad cannot hijack the drag in progress.

export const pointer = {
  down: false,
  x: 0, y: 0,            // world
  sx: 0, sy: 0,          // screen
  px: 0, py: 0,          // world, previous frame
  dx: 0, dy: 0,          // world delta this frame
  startX: 0, startY: 0,  // world, at press
  moved: 0,              // total world distance travelled while down
  heldFor: 0,
  justDown: false,
  justUp: false,
  idle: 0,               // seconds since the last meaningful input
  id: null,
  virtual: false,
};

const listeners = [];
export function onPointer(fn) { listeners.push(fn); }
function emit(type) { for (const fn of listeners) fn(type, pointer); }

function press(sx, sy) {
  const w = camera.toWorld(sx, sy);
  pointer.down = true;
  pointer.justDown = true;
  pointer.sx = sx; pointer.sy = sy;
  pointer.x = w.x; pointer.y = w.y;
  pointer.px = w.x; pointer.py = w.y;
  pointer.startX = w.x; pointer.startY = w.y;
  pointer.dx = 0; pointer.dy = 0;
  pointer.moved = 0;
  pointer.heldFor = 0;
  pointer.idle = 0;
  emit('down');
}
function move(sx, sy) {
  if (!pointer.down) return;
  const w = camera.toWorld(sx, sy);
  pointer.sx = sx; pointer.sy = sy;
  pointer.dx = w.x - pointer.x;
  pointer.dy = w.y - pointer.y;
  pointer.x = w.x; pointer.y = w.y;
  pointer.moved += Math.hypot(pointer.dx, pointer.dy);
  pointer.idle = 0;
  emit('move');
}
function release() {
  if (!pointer.down) return;
  pointer.down = false;
  pointer.justUp = true;
  pointer.id = null;
  pointer.idle = 0;
  emit('up');
}

function bindPointer(el) {
  const rect = () => el.getBoundingClientRect();

  if (window.PointerEvent) {
    el.addEventListener('pointerdown', (e) => {
      if (pointer.id !== null) return;      // already tracking a finger
      pointer.id = e.pointerId;
      pointer.virtual = false;
      const r = rect();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      press(e.clientX - r.left, e.clientY - r.top);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointer.id) return;
      const r = rect();
      move(e.clientX - r.left, e.clientY - r.top);
      e.preventDefault();
    });
    const up = (e) => {
      if (e.pointerId !== pointer.id) return;
      release();
      e.preventDefault();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  } else {
    // Old iOS fallback.
    el.addEventListener('touchstart', (e) => {
      if (pointer.down) return;
      const t = e.changedTouches[0];
      const r = rect();
      pointer.id = t.identifier;
      press(t.clientX - r.left, t.clientY - r.top);
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== pointer.id) continue;
        const r = rect();
        move(t.clientX - r.left, t.clientY - r.top);
      }
      e.preventDefault();
    }, { passive: false });
    const end2 = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === pointer.id) release();
      }
      e.preventDefault();
    };
    el.addEventListener('touchend', end2, { passive: false });
    el.addEventListener('touchcancel', end2, { passive: false });
  }

  // Belt and braces against iOS Safari page gestures.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
}

/** Used by the automated playthrough; drives the same code path as a finger. */
export const virtualPointer = {
  down(sx, sy) { pointer.virtual = true; press(sx, sy); },
  move(sx, sy) { move(sx, sy); },
  up() { release(); },
};

export function endFrameInput(dt) {
  pointer.justDown = false;
  pointer.justUp = false;
  pointer.dx = 0; pointer.dy = 0;
  if (pointer.down) pointer.heldFor += dt;
  else pointer.idle += dt;
}

export function getCtx() { return ctx; }

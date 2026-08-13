// Touch handling and the "no ugly input" filter.
//
// Nothing is injected straight from an event. Each pointer keeps a smoothed
// position, a smoothed direction and an accumulated turn angle, and impulses are
// emitted from the frame loop at a bounded rate with a bounded amplitude. A
// four-year-old slapping the glass with both hands therefore gets a rich,
// convergent pattern instead of a noise field — the filter is what keeps the
// pool beautiful under abuse.

import { clamp, damp } from './math.js';

const HOLD_DELAY = 0.30;
const HOLD_INTERVAL = 0.20;
const MIN_STEP = 0.035;      // world units between drag impulses
const MAX_PER_FRAME = 3;
const MAX_POINTERS = 3;

export class Input {
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.pick = opts.pick;             // (clientX, clientY) -> {u,v,inside} | null
    this.onImpulse = opts.onImpulse;
    this.onFirstTouch = opts.onFirstTouch || (() => {});
    this.onRelease = opts.onRelease || (() => {});
    this.pointers = new Map();
    this.load = 0;                     // recent injected energy, decays
    this.hasTouched = false;
    this.lastPos = { u: 0.5, v: 0.5 };
    this.activityLevel = 0;

    const down = (e) => this._down(e);
    const move = (e) => this._move(e);
    const up = (e) => this._up(e);

    canvas.addEventListener('pointerdown', down, { passive: false });
    canvas.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', up, { passive: false });
    // Belt and braces on iOS: stop scroll/zoom gestures reaching the page.
    for (const t of ['touchstart', 'touchmove', 'touchend']) {
      canvas.addEventListener(t, (e) => e.preventDefault(), { passive: false });
    }
    this._dispose = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }

  get active() { return this.pointers.size > 0; }

  _down(e) {
    e.preventDefault();
    if (this.pointers.size >= MAX_POINTERS) return;
    const p = this.pick(e.clientX, e.clientY);
    if (!p) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    this.pointers.set(e.pointerId, {
      u: p.u, v: p.v, tu: p.u, tv: p.v,
      lu: p.u, lv: p.v,
      dx: 1, dy: 0,
      speed: 0, turn: 0, still: 0, held: 0,
      moved: 0,
    });
    if (!this.hasTouched) {
      this.hasTouched = true;
      this.onFirstTouch();
    }
    this.lastPos = { u: p.u, v: p.v };
    // The very first ring lands on the same frame as the touch: cause and
    // effect must be instant for the youngest players.
    this._emit({
      u: p.u, v: p.v, amp: 0.42 * this._gain(), radius: 0.075,
      dx: 0, dy: 0, elong: 1, kind: 0, push: 0, swirl: 0, flowAmp: 0,
    });
  }

  _move(e) {
    const st = this.pointers.get(e.pointerId);
    if (!st) return;
    e.preventDefault();
    const p = this.pick(e.clientX, e.clientY);
    if (!p) return;
    st.tu = p.u; st.tv = p.v;
  }

  _up(e) {
    const st = this.pointers.get(e.pointerId);
    if (!st) return;
    this.pointers.delete(e.pointerId);
    this.lastPos = { u: st.u, v: st.v };
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (this.pointers.size === 0) this.onRelease(this.lastPos);
  }

  /** Amplitude scale that saturates as the pool gets busy. */
  _gain() {
    return 1 / (1 + this.load * 1.55);
  }

  _emit(imp) {
    this.load += Math.abs(imp.amp) * 1.6;
    this.activityLevel = Math.min(1, this.activityLevel + Math.abs(imp.amp) * 1.2);
    this.onImpulse(imp);
  }

  update(dt) {
    this.load *= Math.exp(-dt * 1.35);
    this.activityLevel *= Math.exp(-dt * 0.9);

    for (const st of this.pointers.values()) {
      const pu = st.u, pv = st.v;
      // Smooth the finger so jitter and event bursts never become noise.
      st.u = damp(st.u, st.tu, 26, dt);
      st.v = damp(st.v, st.tv, 26, dt);
      const mx = st.u - pu, my = st.v - pv;
      const dist = Math.hypot(mx, my);
      const inst = dist / Math.max(dt, 1e-4);
      st.speed = damp(st.speed, inst, 12, dt);

      if (dist > 1e-5) {
        const nx = mx / dist, ny = my / dist;
        const cross = st.dx * ny - st.dy * nx;
        const dot = st.dx * nx + st.dy * ny;
        // Signed turn rate: this is what tells a circle apart from a stripe.
        st.turn = damp(st.turn, clamp(Math.atan2(cross, dot) / Math.max(dt, 1e-4) / 6.0, -1, 1), 4.5, dt);
        st.dx = damp(st.dx, nx, 14, dt);
        st.dy = damp(st.dy, ny, 14, dt);
        const l = Math.hypot(st.dx, st.dy) || 1;
        st.dx /= l; st.dy /= l;
      } else {
        st.turn = damp(st.turn, 0, 2.0, dt);
      }

      st.held += dt;

      // --- dragging ------------------------------------------------------
      let travelled = Math.hypot(st.u - st.lu, st.v - st.lv);
      if (travelled > MIN_STEP) {
        st.still = 0;
        const steps = Math.min(MAX_PER_FRAME, Math.floor(travelled / MIN_STEP));
        const gain = this._gain();
        const fast = clamp(st.speed * 1.4, 0, 1);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const u = st.lu + (st.u - st.lu) * t;
          const v = st.lv + (st.v - st.lv) * t;
          const swirl = clamp(st.turn * 1.9, -1.6, 1.6);
          this._emit({
            u, v,
            amp: (0.075 + 0.16 * fast) * gain,
            radius: 0.055 + 0.030 * fast,
            dx: st.dx, dy: st.dy,
            elong: 1 - 0.55 * fast,        // stretches across the direction of travel
            kind: 1,
            push: 0.55 + 0.9 * fast,
            swirl,
            flowAmp: (0.010 + 0.026 * fast) * gain,
          });
        }
        st.lu = st.u; st.lv = st.v;
        st.moved += travelled;
      } else {
        // --- resting finger: a soft heartbeat of rings -------------------
        st.still += dt;
        if (st.still > HOLD_DELAY) {
          st.holdT = (st.holdT || 0) + dt;
          if (st.holdT >= HOLD_INTERVAL) {
            st.holdT = 0;
            const g = this._gain();
            this._emit({
              u: st.u, v: st.v,
              amp: 0.115 * g,
              radius: 0.060 + 0.02 * Math.sin(st.held * 2.1),
              dx: 0, dy: 0, elong: 1, kind: 0,
              push: 0, swirl: 0, flowAmp: 0,
            });
          }
        }
      }
      this.lastPos = { u: st.u, v: st.v };
    }
  }

  dispose() { this._dispose(); }
}

// 水面ひかり網ラボ — touch the water, make the light dance.

import { createContext, probeCaps, ScreenQuad } from './glutil.js';
import { mat4, perspective, lookAt, multiply, invert, project, clamp, damp, smoothstep } from './math.js';
import { makeSession, hashSeed } from './rng.js';
import { Sim } from './sim.js';
import { Caustics } from './caustics.js';
import { Scene, MAX_BLOOMS, MAX_BUBBLES } from './scene.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { makeDebugView } from './debug.js';

const params = new URLSearchParams(location.search);
const FAST = params.get('fast') === '1';
const FORCE_PACKED = params.get('packed') === '1';
const VIEW = params.get('view');
const RATIO_OVERRIDE = parseFloat(params.get('ratio'));
const DEPTH = 0.25;
const POOL_BASE = 2.35;

// Budgets are texel counts, not side lengths — the buffers are reshaped to the
// pool's proportions so ripples resolve equally well along both axes.
const QUALITY = [
  { name: 'high', sim: 256 * 256, flow: 128 * 128, caustic: 576 * 576, grid: 256 * 256, maxPixels: 2.4e6, post: true },
  { name: 'mid', sim: 224 * 224, flow: 112 * 112, caustic: 464 * 464, grid: 208 * 208, maxPixels: 1.6e6, post: true },
  { name: 'low', sim: 176 * 176, flow: 88 * 88, caustic: 352 * 352, grid: 152 * 152, maxPixels: 1.0e6, post: false },
];

/** Split a texel budget between the axes in the given proportion. */
function shape(budget, ratio, lo, hi) {
  const w = Math.sqrt(budget * ratio);
  const h = Math.sqrt(budget / ratio);
  const snap = (v) => clamp(Math.round(v / 8) * 8, lo, hi);
  return [snap(w), snap(h)];
}

class Lab {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = createContext(canvas);
    if (!gl) throw new Error('no-webgl2');
    this.gl = gl;
    this.caps = probeCaps(gl, FORCE_PACKED);

    const seedParam = params.get('seed');
    this.seed = seedParam ? (Number.isFinite(+seedParam) ? (+seedParam >>> 0) : hashSeed(seedParam))
      : (Math.random() * 0xffffffff) >>> 0;
    this.session = makeSession(this.seed);

    this.qIndex = FAST ? 2 : 0;
    this.quality = QUALITY[this.qIndex];

    this.pool = [POOL_BASE, POOL_BASE];
    this.quad = new ScreenQuad(gl);

    this.sim = new Sim(gl, this.quad, {
      res: shape(this.quality.sim, 1, 64, 512),
      flowRes: shape(this.quality.flow, 1, 32, 256),
      pool: this.pool,
      float: this.caps.float,
      damping: this.session.damping,
      ambient: this.session.ambient,
    });

    this.caustics = new Caustics(gl, this.quad, {
      res: shape(this.quality.caustic, 1, 128, 2048),
      grid: shape(this.quality.grid, 1, 48, 1024),
      pool: this.pool,
      float: this.caps.float,
      exposure: 0.09,   // brightness of the net over dead-flat water: a faint glow
      throw: 0.98,
    });
    this.caustics.setLight(this.session.lightAzimuth, this.session.lightElevation);

    this.size = { w: 2, h: 2, cw: 2, ch: 2, dpr: 1 };
    this._measure();

    this.scene = new Scene(gl, this.quad, {
      pool: this.pool, depth: DEPTH, float: this.caps.float,
      width: this.size.w, height: this.size.h,
    });
    this.post = new Post(gl, this.quad, {
      float: this.caps.float, width: this.size.w, height: this.size.h,
    });
    this.post.enabled = this.quality.post;

    this.camera = {
      vp: mat4(), invVP: mat4(), view: mat4(), proj: mat4(),
      pos: new Float32Array(3), right: new Float32Array(3), up: new Float32Array(3),
      axisX: new Float32Array(2), axisZ: new Float32Array(2),
      elevation: 0.66, lift: 0, distance: 4,
    };

    this.audio = new Audio();
    this.muted = localStorage.getItem('hikariami-muted') === '1';

    this.input = new Input(canvas, {
      pick: (x, y) => this._pick(x, y),
      onImpulse: (imp) => this._impulse(imp),
      onFirstTouch: () => {
        if (!this.muted) this.audio.start();
        this.hint.amount = 0;
        this.idleTime = 0;
      },
      onRelease: (p) => { this.releaseAt = { ...p }; this.sinceRelease = 0; },
    });

    this.blooms = this.session.blooms.slice(0, MAX_BLOOMS);
    this.bubbles = [];
    for (let i = 0; i < Math.min(this.session.bubbleCount, MAX_BUBBLES); i++) {
      this.bubbles.push(this._newBubble(true));
    }

    this.time = 0;
    this.acc = 0;
    this.idleTime = 0;
    this.sinceRelease = 999;
    this.sinceFinale = 6;
    this.releaseAt = { u: 0.5, v: 0.5 };
    this.finale = { active: false, t: 0, amount: 0 };
    this.glow = 1;
    this.grand = 0;
    this.play = 0;
    this.probeMean = 0.1;
    this.hint = { u: 0.5, v: 0.5, amount: 0, radius: 0.1, timer: 1.2 };
    this.openedCount = 0;
    this.frameTimes = [];
    this.stats = { fps: 0, frames: 0, quality: this.quality.name, opened: 0, finales: 0 };

    addEventListener('resize', () => this._resize());
    addEventListener('orientationchange', () => setTimeout(() => this._resize(), 120));
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (!document.hidden) this.lastT = performance.now();
    });

    this._resize();
    this._setupUi();
  }

  // ---------------------------------------------------------------- layout

  _measure() {
    const cw = Math.max(1, this.canvas.clientWidth || innerWidth);
    const ch = Math.max(1, this.canvas.clientHeight || innerHeight);
    const dpr = Math.min(devicePixelRatio || 1, FAST ? 1 : 2);
    let w = Math.round(cw * dpr);
    let h = Math.round(ch * dpr);
    const budget = this.quality.maxPixels;
    if (w * h > budget) {
      const s = Math.sqrt(budget / (w * h));
      w = Math.max(2, Math.round(w * s));
      h = Math.max(2, Math.round(h * s));
    }
    this.size = { w, h, cw, ch, dpr };
    this.canvas.width = w;
    this.canvas.height = h;
  }

  _resize() {
    this._measure();
    const { w, h } = this.size;
    this.scene.resize(w, h);
    this.post.resize(w, h);

    // Keep the pool's footprint roughly screen-shaped so both the surface and
    // the floor stay comfortably in frame in portrait and landscape.
    // Seen from ~40 degrees the depth axis is foreshortened, so a pool that
    // matches the screen on paper looks square in practice. Bias toward the
    // screen's own proportions, but never past the point where perspective
    // makes the far end too small to enjoy.
    const aspect = w / h;
    const ratio = Number.isFinite(RATIO_OVERRIDE) ? RATIO_OVERRIDE : clamp(aspect * 0.52, 0.24, 2.40);
    const s = Math.sqrt(ratio);
    this.pool[0] = POOL_BASE * s;
    this.pool[1] = POOL_BASE / s;
    this.poolRatio = ratio;
    const q = this.quality;
    this.sim.resize(shape(q.sim, ratio, 64, 512), shape(q.flow, ratio, 32, 256));
    this.sim.updatePool();
    this.caustics.resize(shape(q.caustic, ratio, 128, 2048), shape(q.grid, ratio, 48, 1024));
    this.caustics.cPool[0] = this.pool[0] * 1.28;
    this.caustics.cPool[1] = this.pool[1] * 1.28;
    this._updateCamera(0, true);
  }

  _updateCamera(dt, force) {
    const cam = this.camera;
    const { w, h } = this.size;
    const aspect = w / h;

    // Slight, slow rise when something grand is on the floor — never under the
    // player's control, just a breath of "look at the whole thing".
    const targetLift = this.input.active ? cam.lift : clamp(this.grand * 0.9 + this.finale.amount * 6.0, 0, 1);
    cam.lift = force ? targetLift : damp(cam.lift, targetLift, 0.8, dt);

    const elev = 0.66 + 0.14 * cam.lift;          // ~38° .. ~46° above the water
    const fov = 46 * Math.PI / 180;
    const center = [0, -DEPTH * 0.45, 0];
    perspective(cam.proj, fov, aspect, 0.05, 40);

    // Pull back only as far as the pool actually needs: project its eight
    // corners and solve for the distance that fills the frame. A bounding
    // sphere is far too pessimistic for a flat pool seen at a slant.
    const hw = this.pool[0] * 0.5, hd = this.pool[1] * 0.5;
    const eye = [0, 0, 0];
    let dist = 4;
    for (let it = 0; it < 8; it++) {
      eye[0] = center[0];
      eye[1] = center[1] + Math.sin(elev) * dist;
      eye[2] = center[2] + Math.cos(elev) * dist;
      lookAt(cam.view, eye, center, [0, 1, 0]);
      multiply(cam.vp, cam.proj, cam.view);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        const sx = (i & 1) ? hw : -hw;
        const sz = (i & 2) ? hd : -hd;
        const y = (i & 4) ? -DEPTH : 0;
        const p = project(cam.vp, sx, y, sz);
        if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) { x0 = 1e9; break; }
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
      if (x0 > 1e8) break;
      // Slide the aim point along the depth axis until the pool sits centred
      // vertically, then scale the distance so it just fills the frame.
      center[2] -= ((y0 + y1) * 0.5) * dist * 0.42;
      const m = Math.max((x1 - x0) * 0.5 / 0.97, (y1 - y0) * 0.5 / 0.95);
      if (!Number.isFinite(m) || m <= 0) break;
      dist *= m;
      if (Math.abs(m - 1) < 0.004 && Math.abs(y0 + y1) < 0.01) break;
    }
    dist *= 1 + 0.06 * cam.lift;
    eye[1] = center[1] + Math.sin(elev) * dist;
    eye[2] = center[2] + Math.cos(elev) * dist;
    lookAt(cam.view, eye, center, [0, 1, 0]);
    multiply(cam.vp, cam.proj, cam.view);
    invert(cam.invVP, cam.vp);
    cam.pos[0] = eye[0]; cam.pos[1] = eye[1]; cam.pos[2] = eye[2];
    // Camera basis for the billboards.
    cam.right[0] = cam.view[0]; cam.right[1] = cam.view[4]; cam.right[2] = cam.view[8];
    cam.up[0] = cam.view[1]; cam.up[1] = cam.view[5]; cam.up[2] = cam.view[9];

    // Screen-space displacement per world unit at the surface, for refraction.
    const p0 = project(cam.vp, 0, 0, 0);
    const px = project(cam.vp, 1, 0, 0);
    const pz = project(cam.vp, 0, 0, 1);
    cam.axisX[0] = (px[0] - p0[0]) * 0.5;
    cam.axisX[1] = (px[1] - p0[1]) * 0.5;
    cam.axisZ[0] = (pz[0] - p0[0]) * 0.5;
    cam.axisZ[1] = (pz[1] - p0[1]) * 0.5;
    cam.elevation = elev;
    cam.distance = dist;
  }

  /** Screen point -> pool uv via ray/water-plane intersection. */
  _pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
    const cam = this.camera;
    const a = [nx, ny, -1], b = [nx, ny, 1];
    const pa = project(cam.invVP, a[0], a[1], a[2]);
    const pb = project(cam.invVP, b[0], b[1], b[2]);
    const dir = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    dir[0] /= l; dir[1] /= l; dir[2] /= l;
    if (dir[1] > -1e-4) return null;
    const t = -cam.pos[1] / dir[1];
    const x = cam.pos[0] + dir[0] * t;
    const z = cam.pos[2] + dir[2] * t;
    const u = x / this.pool[0] + 0.5;
    const v = z / this.pool[1] + 0.5;
    // Edges are fair game — small hands touch the rim constantly.
    return { u: clamp(u, 0.03, 0.97), v: clamp(v, 0.03, 0.97), inside: u > 0 && u < 1 && v > 0 && v < 1 };
  }

  _impulse(imp) {
    this.sim.addImpulse(imp);
    this.idleTime = 0;
    // "Someone is playing right now", decaying about a second after they stop.
    this.play = Math.min(1, this.play + Math.abs(imp.amp) * 1.8);
    if (imp.kind === 0 && imp.amp > 0.2) this.audio.drop(clamp(imp.amp * 2.0, 0.2, 1));
    else if (imp.kind === 1 && Math.random() < 0.10) this.audio.drop(0.15 + Math.random() * 0.2);
  }

  _newBubble(spread) {
    const r = this.session.rng;
    return {
      x: (r() - 0.5) * this.pool[0] * 0.8,
      z: (r() - 0.5) * this.pool[1] * 0.8,
      y: -DEPTH + (spread ? r() * DEPTH : 0.01),
      size: 0.007 + r() * 0.013,
      speed: 0.016 + r() * 0.030,
      wobble: r() * 6.28,
    };
  }

  // ------------------------------------------------------------- gameplay

  _updateBlooms(dt) {
    const cp = this.caustics.cPool;
    let anyOpening = 0;
    for (let i = 0; i < this.blooms.length; i++) {
      const b = this.blooms[i];
      const wx = b.x * this.pool[0] * 0.43;
      const wz = b.z * this.pool[1] * 0.43;
      const light = this.caustics.sampleProbe(wx / cp[0] + 0.5, wz / cp[1] + 0.5);
      b.light = light;

      if (b.opened) {
        b.open = damp(b.open, 1, 2.4, dt);
        if (b.open > 0.05 && b.open < 0.9) anyOpening = Math.max(anyOpening, 1 - b.open);
      } else {
        // A flower wakes when the light gathers on it *while someone is
        // playing*. Both halves matter: `play` decays about a second after the
        // last touch, so an untouched pool never opens anything on its own, and
        // the light term means it is the caustics doing it, not the clock.
        // Relative to how bright the whole floor is right now, so the pacing
        // does not shift when adaptive quality changes how sharply the net
        // resolves. `rel` is "this spot versus the pool average".
        const rel = light / Math.max(this.probeMean, 0.02);
        b.rel = rel;
        const feed = smoothstep(1.5, 3.0, rel) * clamp(this.play * 1.5, 0, 1);
        b.energy = clamp(b.energy + (feed * 0.55 - 0.07) * dt, 0, 1.0001);
        if (b.energy >= 1) {
          b.opened = true;
          this.openedCount++;
          this.stats.opened = this.openedCount;
          this.audio.chime(2 + i, 1);
          // The flower answers with its own ring — cause and effect, again.
          this.sim.addImpulse({
            u: b.x * 0.43 + 0.5, v: b.z * 0.43 + 0.5,
            amp: 0.34, radius: 0.11,
            dx: 0, dy: 0, elong: 1, kind: 0, push: 0, swirl: 0, flowAmp: 0,
          });
        }
      }
    }
    return anyOpening;
  }

  _updateBubbles(dt) {
    for (const b of this.bubbles) {
      b.y += b.speed * dt;
      b.wobble += dt * 1.7;
      b.x += Math.sin(b.wobble) * dt * 0.012;
      b.z += Math.cos(b.wobble * 0.83) * dt * 0.012;
      if (b.y > -0.006) {
        // Pop: a whisper of a ripple, so the idle pool keeps twinkling without
        // ever competing with the rings the player makes.
        this.sim.addImpulse({
          u: b.x / this.pool[0] + 0.5, v: b.z / this.pool[1] + 0.5,
          amp: 0.013, radius: 0.024,
          dx: 0, dy: 0, elong: 1, kind: 0, push: 0, swirl: 0, flowAmp: 0,
        });
        Object.assign(b, this._newBubble(false));
      }
    }
  }

  _updateFinale(dt) {
    const f = this.finale;
    if (f.active) {
      f.t += dt;
      // ramp up, hold, dissolve
      const up = smoothstep(0, 1.0, f.t);
      const down = 1 - smoothstep(2.9, 4.4, f.t);
      f.amount = up * down;
      this.sim.flower.rate = f.amount * 5.5;
      this.sim.ambientScale = 1 - 0.88 * f.amount;
      this.sim.flower.phase += dt * 2.35;
      if (f.t > 4.6) {
        f.active = false;
        f.amount = 0;
        this.sim.flower.rate = 0;
        this.sim.ambientScale = 1;
        this.sinceFinale = 0;
      }
      return;
    }
    this.sim.flower.rate = 0;
    this.sinceFinale += dt;

    // "Let go and the water calms, then one big flower of light opens."
    const calm = !this.input.active && this.sinceRelease > 1.15 && this.input.activityLevel < 0.30;
    if (calm && this.sinceFinale > 7 && this.input.hasTouched) {
      const s = this.session;
      f.active = true;
      f.t = 0;
      this.sim.flower.x = clamp(this.releaseAt.u, 0.25, 0.75);
      this.sim.flower.y = clamp(this.releaseAt.v, 0.25, 0.75);
      this.sim.flower.petals = s.finalePetals + (this.openedCount > 2 ? 2 : 0);
      this.sim.flower.rings = s.finaleRings;
      // Big enough to be the whole picture for a few seconds.
      const lo = Math.min(this.pool[0], this.pool[1]);
      const hi = Math.max(this.pool[0], this.pool[1]);
      this.sim.flower.radius = (0.58 * lo + 0.17 * hi) * (1 + 0.16 * clamp(this.openedCount / 4, 0, 1));
      this.sim.flower.twist = s.finaleSpin * 0.16;
      this.sim.flower.phase = 0;
      this.stats.finales++;
      this.audio.flourish();
    }
  }

  _updateHint(dt) {
    const h = this.hint;
    const wants = !this.input.hasTouched || this.idleTime > 14;
    if (wants) {
      h.timer -= dt;
      h.amount = damp(h.amount, 1, 1.2, dt);
      h.radius += dt * 0.55;
      if (h.timer <= 0) {
        h.timer = 3.4;
        h.radius = 0.02;
        h.u = 0.5 + (this.session.rng() - 0.5) * 0.5;
        h.v = 0.5 + (this.session.rng() - 0.5) * 0.5;
        this.sim.addImpulse({
          u: h.u, v: h.v, amp: 0.20, radius: 0.075,
          dx: 0, dy: 0, elong: 1, kind: 0, push: 0, swirl: 0, flowAmp: 0,
        });
        this.audio.drop(0.35);
      }
    } else {
      h.amount = damp(h.amount, 0, 3.0, dt);
    }
  }

  // ----------------------------------------------------------------- loop

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (this.hidden) { this.lastT = now; return; }
    const dt = Math.min(0.05, Math.max(0.0005, (now - (this.lastT || now)) / 1000));
    this.lastT = now;
    this.time += dt;
    this.idleTime += dt;
    this.sinceRelease += dt;

    this.play *= Math.exp(-dt * 0.9);
    this.input.update(dt);
    this._updateHint(dt);
    this._updateFinale(dt);
    this._updateBubbles(dt);

    // Fixed-step physics at 180 Hz. Three cheap sub-steps per frame is what
    // makes a ripple cross the pool in about a second — slow enough to watch,
    // fast enough that a four-year-old connects the touch to the light.
    this.acc += dt;
    const fixed = 1 / 180;
    let steps = 0;
    while (this.acc >= fixed && steps < 6) {
      this.sim.step(fixed);
      this.acc -= fixed;
      steps++;
    }
    if (steps === 0 && this.sim.queue.length) { this.sim.step(fixed); this.acc = 0; }
    if (this.acc > fixed * 7) this.acc = 0;
    this.sim.updateSlope();

    this.caustics.render(this.sim.slopeTexture, this.sim.res);
    this.caustics.updateProbe();

    // Grandness: how much of the floor is brightly lit right now.
    let sum = 0, peak = 0;
    const d = this.caustics.probeData;
    for (let i = 0; i < d.length; i += 4) { sum += d[i]; if (d[i] > peak) peak = d[i]; }
    const mean = sum / (d.length / 4) / 255;
    this.probeMean = mean;
    // How concentrated the light is, not how bright — a ratio, so it means the
    // same thing at every quality level.
    const concentration = (peak / 255) / Math.max(mean, 0.02);
    this.grand = damp(this.grand, clamp((concentration - 2.4) * 0.55, 0, 1), 0.7, dt);

    const opening = this._updateBlooms(dt);

    this._updateCamera(dt, false);

    const glowTarget = 1 + 0.35 * this.finale.amount + 0.25 * opening;
    this.glow = damp(this.glow, glowTarget, 4, dt);

    const tex = this.scene.render({
      session: this.session,
      camera: this.camera,
      caustics: this.caustics,
      sim: this.sim,
      blooms: this.blooms,
      bubbles: this.bubbles,
      time: this.time,
      glow: this.glow,
      finale: this.finale.amount,
      refract: 0.085,
      sunColor: [1.0, 0.95, 0.86],
      waterAbsorb: [0.38, 0.17, 0.11],
      hint: [this.hint.u, this.hint.v, this.hint.amount * 0.55, this.hint.radius],
    });

    if (VIEW) {
      const v = {
        caustic: [this.caustics.texture, this.caustics.res, 1.0, 0],
        slope: [this.sim.slopeTexture, this.sim.res, 60.0, 1],
        state: [this.sim.stateTexture, this.sim.res, 3.0, 1],
        flow: [this.sim.flowTexture, this.sim.flowRes, 12.0, 1],
      }[VIEW];
      if (v) {
        this.debugView = this.debugView || makeDebugView(this.gl, this.quad, !this.caps.float);
        this.debugView(v[0], v[1], v[2], v[3], this.size.w, this.size.h);
        this.stats.frames++;
        return;
      }
    }

    this.post.render(tex, this.size.w, this.size.h, {
      threshold: 0.55,
      bloom: 0.80 + 0.40 * this.finale.amount,
      exposure: 1.10,
      vignette: 0.34,
      time: this.time,
    });

    this._adapt(dt);
    this.stats.frames++;
  }

  /** Two downgrade steps, never an upgrade — no oscillation, no stutter loop. */
  _adapt(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    this.stats.fps = Math.round(1 / avg);
    if (FAST) return;
    if (avg > 0.023 && this.qIndex < QUALITY.length - 1) {
      this.qIndex++;
      this._applyQuality();
    }
  }

  _applyQuality() {
    const q = QUALITY[this.qIndex];
    this.quality = q;
    this.stats.quality = q.name;
    this.post.enabled = q.post;
    this._measure();
    this.sim.resize(shape(q.sim, this.poolRatio, 64, 512), shape(q.flow, this.poolRatio, 32, 256));
    this.sim.updatePool();
    this.caustics.resize(shape(q.caustic, this.poolRatio, 128, 2048), shape(q.grid, this.poolRatio, 48, 1024));
    this.scene.resize(this.size.w, this.size.h);
    this.post.resize(this.size.w, this.size.h);
    this._updateCamera(0, true);
  }

  _setupUi() {
    const btn = document.getElementById('sound');
    const sync = () => btn.setAttribute('data-muted', this.muted ? '1' : '0');
    sync();
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.muted = !this.muted;
      localStorage.setItem('hikariami-muted', this.muted ? '1' : '0');
      if (!this.muted) this.audio.start();
      this.audio.setMuted(this.muted);
      sync();
    });
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  start() {
    this.lastT = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Test hook: poke the water in pool-uv space. */
  poke(u, v, amp = 0.42, radius = 0.075) {
    this._impulse({ u, v, amp, radius, dx: 0, dy: 0, elong: 1, kind: 0, push: 0, swirl: 0, flowAmp: 0 });
    this.input.hasTouched = true;
    this.hint.amount = 0;
  }

  /** Test hook: drag from a to b over `steps` impulses. */
  stroke(u0, v0, u1, v1, steps = 12, swirl = 0) {
    const dx = u1 - u0, dy = v1 - v0;
    const l = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      this._impulse({
        u: u0 + dx * t, v: v0 + dy * t,
        amp: 0.16, radius: 0.06,
        dx: dx / l, dy: dy / l, elong: 0.55, kind: 1,
        push: 1.0, swirl, flowAmp: 0.026,
      });
    }
    this.input.hasTouched = true;
  }
}

function boot() {
  const canvas = document.getElementById('stage');
  try {
    const lab = new Lab(canvas);
    window.__lab = lab;
    lab.start();
  } catch (err) {
    console.error(err);
    const fb = document.getElementById('fallback');
    fb.hidden = false;
    if (String(err.message).indexOf('no-webgl2') === -1) {
      document.getElementById('fallback-msg').innerHTML =
        'うまく はじめられなかったみたい。<br>ページを もういちど ひらいてね。';
    }
    window.__labError = String(err.stack || err);
  }
}

boot();

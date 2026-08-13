import { makeSet } from './shapes.js';

export const STAGE = {
  INTRO: 0,
  PLACE: 1,
  RING: 2,
  PRESS: 3,
  PARTS: 4,
  WINDOW: 5,
  DONE: 6,
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// zoom, panX, panY, ringRadius, ringWidth, ringOpacity
const SHOT = {
  [STAGE.INTRO]:  { z: 0.47, x: 0.0, y: 0.30, rr: 1.12, rw: 0.10, ro: 0.0 },
  [STAGE.PLACE]:  { z: 0.60, x: 0.0, y: 0.16, rr: 1.12, rw: 0.10, ro: 0.0 },
  [STAGE.RING]:   { z: 0.70, x: 0.0, y: 0.00, rr: 1.12, rw: 0.10, ro: 1.0 },
  [STAGE.PRESS]:  { z: 1.00, x: 0.0, y: -0.02, rr: 1.12, rw: 0.10, ro: 1.0 },
  [STAGE.PARTS]:  { z: 0.50, x: 0.0, y: -0.02, rr: 1.66, rw: 0.13, ro: 1.0 },
  [STAGE.WINDOW]: { z: 0.42, x: 0.0, y: 0.04, rr: 2.20, rw: 0.155, ro: 1.0 },
  [STAGE.DONE]:   { z: 0.44, x: 0.0, y: 0.05, rr: 2.20, rw: 0.155, ro: 1.0 },
};

const SOLO_SCALE = 0.76;
const GROUP_SCALE = [0.58, 0.45, 0.45];
const GROUP_X = [0.0, -0.95, 0.95];
// the finale pulls back, so the parts grow to stay the heroes of the shot
const FINALE_SCALE = [0.74, 0.58, 0.58];
const FINALE_X = [0.0, -1.15, 1.15];

class Part {
  constructor(recipe) {
    this.r = recipe;
    this.x = -3.2;
    this.y = 0.85;
    this.tx = -3.2;
    this.ty = 0.85;
    this.scale = SOLO_SCALE;
    this.tscale = SOLO_SCALE;
    this.rot = recipe.rot;
    this.presence = 0;
    this.tpresence = 0;
    this.squash = 0;
  }
  step(dt) {
    this.x = approach(this.x, this.tx, 4.5, dt);
    this.y = approach(this.y, this.ty, 4.5, dt);
    this.scale = approach(this.scale, this.tscale, 5.5, dt);
    this.presence = approach(this.presence, this.tpresence, 5.0, dt);
    this.squash = approach(this.squash, 0, 6.0, dt);
  }
}

export class Game {
  /** @param {{seed?:number, audio?:any, onStage?:Function}} opts */
  constructor(opts = {}) {
    this.audio = opts.audio || null;
    this.onStage = opts.onStage || (() => {});
    this.time = 0;
    this.quality = 2;
    this.reset(opts.seed ?? (Math.random() * 1e9) | 0);
  }

  reset(seed, keepSeed = false) {
    this.seed = keepSeed ? this.seed : seed;
    const set = makeSet(this.seed);
    this.set = set;
    this.parts = [new Part(set.hero), new Part(set.others[0]), new Part(set.others[1])];
    this.parts[0].tpresence = 1;
    // the two companions wait offstage until their moment
    this.parts[1].x = this.parts[1].tx = -3.6;
    this.parts[2].x = this.parts[2].tx = 3.6;
    this.parts[1].y = this.parts[1].ty = 0.9;
    this.parts[2].y = this.parts[2].ty = 0.9;
    this.placedParts = 0;

    this.stage = STAGE.INTRO;
    this.stageT = 0;
    this.idle = 0;
    this.celebrate = 0;
    this.burst = 0;

    this.ringAngle = 0;
    this.ringVel = 0;
    this.totalRot = 0;
    this.stageRot = 0;
    this.charge = 0;
    this.sweetAngle = Math.PI / 2 + (set.hero.sweet / Math.PI - 0.5) * 0.7;
    this.sweet = 0;
    this.sweetLatch = 0;

    this.presses = [];
    this.pressCount = 0;
    this.pendingStage = null;
    this.windowMix = 0;

    const s = SHOT[STAGE.INTRO];
    this.cam = { z: s.z * 0.8, x: s.x, y: s.y, vz: 0, vx: 0, vy: 0 };
    this.ring = { r: s.rr, w: s.rw, o: s.ro };

    // hero flies in
    const p0 = this.parts[0];
    p0.x = -3.0; p0.y = 0.9;
    p0.tx = 0.0; p0.ty = 0.72;
    p0.tscale = SOLO_SCALE;

    this.onStage(this.stage);
  }

  /** Same piece again — the easiest thing to choose at the end. */
  replay() { this.reset(this.seed, true); }
  /** A brand new piece. */
  nextOne() { this.reset(((this.seed * 1664525 + 1013904223) >>> 0) % 1e9); }

  setStage(s) {
    if (this.stage === s) return;
    this.stage = s;
    this.stageT = 0;
    this.stageRot = 0;
    this.idle = 0;
    this.onStage(s);
  }

  // ------------------------------------------------------------------ input
  /** @param {number} wx @param {number} wy world coords */
  hitPart(wx, wy) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.presence < 0.5) continue;
      const d = Math.hypot(wx - p.x, wy - p.y) / (p.scale * 1.25);
      if (d < 1 && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  pressEnabled() {
    return this.stage >= STAGE.PRESS;
  }

  beginPress(wx, wy) {
    this.idle = 0;
    const p = { x: wx, y: wy, s: 0, ts: 1, age: 0, held: true };
    this.presses.push(p);
    while (this.presses.length > 3) this.presses.shift();
    this.pressCount++;
    if (this.audio) this.audio.press();
    return p;
  }

  movePress(p, wx, wy) {
    p.x = wx; p.y = wy;
    this.idle = 0;
  }

  endPress(p) { p.held = false; p.ts = 0; }

  /** Rotate the ring. dA in radians, already input-assisted. */
  turn(dA, dt) {
    if (!isFinite(dA)) return;
    dA = clamp(dA, -0.7, 0.7);
    this.ringAngle += dA;
    this.totalRot += Math.abs(dA);
    this.stageRot += Math.abs(dA);
    const inst = dA / Math.max(dt, 1 / 240);
    this.ringVel = this.ringVel * 0.55 + clamp(inst, -16, 16) * 0.45;
    this.idle = 0;
  }

  tap(wx, wy) {
    this.idle = 0;
    if (this.stage === STAGE.INTRO) { this.placeHero(); return; }
    if (this.stage === STAGE.PLACE) { this.placeHero(); return; }
    if (this.stage === STAGE.PARTS) { this.placeNextPart(); return; }
  }

  placeHero() {
    if (this.stage > STAGE.PLACE) return;
    const p = this.parts[0];
    p.tx = 0; p.ty = -0.02; p.tscale = SOLO_SCALE;
    p.squash = 0.22;
    if (this.audio) this.audio.chime();
    this.setStage(STAGE.RING);
  }

  placeNextPart() {
    if (this.placedParts >= 2) return;
    const i = this.placedParts + 1;
    const p = this.parts[i];
    p.tpresence = 1;
    p.tx = GROUP_X[i];
    p.ty = -0.02;
    p.tscale = GROUP_SCALE[i];
    p.squash = 0.22;
    this.placedParts++;
    // the hero shuffles over to make room
    this.parts[0].tx = GROUP_X[0];
    this.parts[0].tscale = GROUP_SCALE[0];
    if (this.audio) this.audio.chime();
  }

  // ------------------------------------------------------------------- tick
  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.stageT += dt;
    this.idle += dt;

    // ring flywheel
    if (Math.abs(this.ringVel) > 0.0005) {
      this.ringAngle += this.ringVel * dt;
      const spun = Math.abs(this.ringVel * dt);
      this.totalRot += spun;
      this.stageRot += spun;
      this.ringVel *= Math.exp(-dt * 1.9);
      if (Math.abs(this.ringVel) < 0.02) this.ringVel = 0;
    }
    if (this.audio) this.audio.ring(this.ringAngle, this.ringVel);

    // discovery ramp: transparent → faint → full rainbow
    this.charge = clamp(this.totalRot / (TAU * 2.4), 0, 1);
    const rel = this.ringAngle - 0;
    const sw = Math.pow(Math.max(0, 0.5 + 0.5 * Math.cos(2 * (rel - this.sweetAngle))), 9);
    this.sweet = sw * this.charge;
    if (this.sweet > 0.72 && this.sweetLatch <= 0) {
      this.sweetLatch = 1.1;
      if (this.audio) this.audio.chime();
    }
    this.sweetLatch = Math.max(0, this.sweetLatch - dt);

    // presses
    for (const p of this.presses) {
      p.s = approach(p.s, p.ts, p.held ? 14 : 3.2, dt);
      p.age += dt;
    }
    this.presses = this.presses.filter((p) => p.held || p.s > 0.01);

    for (const p of this.parts) p.step(dt);

    // re-target the parts when the camera pulls back for the finale
    {
      const fin = this.stage >= STAGE.WINDOW;
      const XS = fin ? FINALE_X : GROUP_X;
      const SS = fin ? FINALE_SCALE : GROUP_SCALE;
      for (let i = 0; i <= this.placedParts; i++) {
        const p = this.parts[i];
        if (p.tpresence < 0.5) continue;
        if (this.placedParts > 0 || i > 0) { p.tx = XS[i]; p.tscale = SS[i]; }
        else if (fin) { p.tscale = FINALE_SCALE[0] * 1.25; }
      }
    }

    this.celebrate = Math.max(0, this.celebrate - dt);
    this.burst = Math.max(0, this.burst - dt * 0.9);

    this.#advance(dt);
    this.#camera(dt);
  }

  #advance(dt) {
    switch (this.stage) {
      case STAGE.INTRO:
        if (this.stageT > 2.4) this.setStage(STAGE.PLACE);
        break;
      case STAGE.PLACE:
        // a 4-year-old must never be stuck: it places itself if they wait
        if (this.stageT > 8.5) this.placeHero();
        break;
      case STAGE.RING:
        if (this.stageRot > TAU * 2.1 && this.stageT > 5.0 && this.celebrate <= 0) {
          this.celebrate = 1.5;
          if (this.audio) this.audio.celebrate();
          this.pendingStage = STAGE.PRESS;
        }
        if (this.pendingStage === STAGE.PRESS && this.celebrate <= 0.01) {
          this.pendingStage = null;
          this.setStage(STAGE.PRESS);
        }
        break;
      case STAGE.PRESS:
        if ((this.pressCount >= 3 && this.stageT > 4.5) || this.stageT > 20) {
          this.setStage(STAGE.PARTS);
        }
        break;
      case STAGE.PARTS:
        if (this.placedParts < 2 && this.stageT > 6.5 + this.placedParts * 5.5) {
          this.placeNextPart();
        }
        if (this.placedParts >= 2 && this.stageRot > TAU * 1.1 && this.stageT > 6) {
          this.setStage(STAGE.WINDOW);
          if (this.audio) this.audio.celebrate();
        }
        break;
      case STAGE.WINDOW:
        this.windowMix = approach(this.windowMix, 1, 1.6, dt);
        if (this.stageRot > TAU * 1.3 && this.stageT > 5) {
          this.burst = 1.0;
          if (this.audio) this.audio.finale();
          this.setStage(STAGE.DONE);
        }
        break;
      case STAGE.DONE:
        this.windowMix = approach(this.windowMix, 1, 1.6, dt);
        break;
      default:
        break;
    }
    if (this.stage < STAGE.WINDOW) this.windowMix = approach(this.windowMix, 0, 3, dt);
  }

  #camera(dt) {
    const s = SHOT[this.stage];
    // second-order critically damped — alive, but never a cut
    const k = 9.0, d = 2 * Math.sqrt(k) * 1.02;
    const step = (cur, vel, tgt) => {
      const a = k * (tgt - cur) - d * vel;
      vel += a * dt;
      cur += vel * dt;
      return [cur, vel];
    };
    // during a macro look, drift very gently toward the newest press
    let tx = s.x, ty = s.y;
    if (this.stage === STAGE.PRESS && this.presses.length) {
      const p = this.presses[this.presses.length - 1];
      tx += clamp(p.x, -0.35, 0.35) * 0.45;
      ty += clamp(p.y, -0.3, 0.3) * 0.45;
    }
    let r;
    r = step(this.cam.z, this.cam.vz, s.z * (1 + 0.035 * this.celebrate)); this.cam.z = r[0]; this.cam.vz = r[1];
    r = step(this.cam.x, this.cam.vx, tx); this.cam.x = r[0]; this.cam.vx = r[1];
    r = step(this.cam.y, this.cam.vy, ty); this.cam.y = r[0]; this.cam.vy = r[1];

    this.ring.r = approach(this.ring.r, s.rr, 3.2, dt);
    this.ring.w = approach(this.ring.w, s.rw, 3.2, dt);
    this.ring.o = approach(this.ring.o, s.ro, 4.0, dt);
  }

  // ------------------------------------------------------------- uniforms
  uniforms(out) {
    const u = out || {
      objA: new Float32Array(16), objB: new Float32Array(16),
      objC: new Float32Array(16), objD: new Float32Array(16),
      objE: new Float32Array(16), press: new Float32Array(12),
      cam: [0, 0, 0, 0], pol: [0, 0, 0, 0], ring: [0, 0, 0, 0],
      fin: [0, 0, 0, 0], post: [0, 0, 0, 0], time: 0, quality: 2,
    };
    for (let i = 0; i < 4; i++) {
      const p = this.parts[i];
      if (!p) { u.objC[i * 4 + 1] = 0; continue; }
      const sq = 1 + p.squash;
      u.objA[i * 4 + 0] = p.x;
      u.objA[i * 4 + 1] = p.y;
      u.objA[i * 4 + 2] = p.scale * sq * p.r.size;
      u.objA[i * 4 + 3] = p.rot;
      u.objB[i * 4 + 0] = p.r.mode;
      u.objB[i * 4 + 1] = p.r.amp;
      u.objB[i * 4 + 2] = p.r.freq;
      u.objB[i * 4 + 3] = p.r.phase;
      u.objC[i * 4 + 0] = p.r.sharp;
      u.objC[i * 4 + 1] = p.presence;
      u.objC[i * 4 + 2] = p.r.gate;
      u.objC[i * 4 + 3] = p.r.spokeN;
      for (let k = 0; k < 4; k++) {
        u.objD[i * 4 + k] = p.r.ret[k];
        u.objE[i * 4 + k] = p.r.seed[k];
      }
    }
    for (let k = 0; k < 3; k++) {
      const p = this.presses[this.presses.length - 1 - k];
      const o = k * 4;
      if (p) { u.press[o] = p.x; u.press[o + 1] = p.y; u.press[o + 2] = p.s; u.press[o + 3] = p.age; }
      else { u.press[o] = 0; u.press[o + 1] = 0; u.press[o + 2] = 0; u.press[o + 3] = 0; }
    }

    const chargeScale = 0.13 + 0.87 * Math.pow(this.charge, 0.85);
    u.cam[0] = this.cam.x; u.cam[1] = this.cam.y; u.cam[2] = this.cam.z; u.cam[3] = 0;
    u.pol[0] = this.ringAngle; u.pol[1] = 0; u.pol[2] = chargeScale; u.pol[3] = this.sweet;
    u.ring[0] = this.ring.r; u.ring[1] = this.ring.w; u.ring[2] = this.ring.o; u.ring[3] = this.ringAngle;
    u.fin[0] = this.windowMix;
    u.fin[1] = this.burst;
    u.fin[2] = 1.0 + 0.16 * this.celebrate + 0.25 * this.burst;
    u.fin[3] = this.quality;

    const bloom = 0.30 + 0.85 * this.charge + 0.55 * this.sweet
      + 0.35 * this.celebrate + 0.9 * this.burst + 0.35 * this.windowMix;
    u.post[0] = this.quality > 0 ? bloom : 0;
    u.post[1] = this.quality > 0
      ? smoothstep(0.30, 0.85, this.charge) * (0.55 + 0.8 * this.sweet + 0.7 * this.windowMix)
      : 0;
    u.post[2] = 0.32 + 0.18 * this.windowMix;
    u.post[3] = this.burst * this.burst * 0.7 + this.celebrate * 0.10;
    u.time = this.time;
    u.quality = this.quality;
    return u;
  }
}

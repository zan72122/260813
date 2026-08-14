// The shared model. Everything the stages mutate lives here so the
// renderer can stay a pure function of state.
//
// Noodles are *not* simulated. Each strand is a handful of parameters and
// a layout function turns those into a 22-point polyline. Morphing between
// stages is a plain lerp between two layouts, which is cheap enough to run
// 44 strands at 60fps on a phone.

import { TAU, clamp01, lerp, damp, makeRng, rr } from './util.js';

export const N = 22;              // samples per strand
export const RACK_HALF = 300;     // half-width of the hanging lattice
export const BOARD_HALF = 380;    // half-length on the cutting board
export const GUIDE = 300;         // where the "same length" cuts land

export const W = {
  time: 0,
  rng: makeRng(20260814),
  reducedMotion: false,

  // stage: gather
  blobs: [],
  ball: { x: 0, y: 30, r: 44, squash: 0, alpha: 1, wob: 0 },

  // stage: first stretch
  rope: {
    ax: -330, ay: 60, hx: -180, hy: 60,
    len: 0, maxLen: 620, thick: 78, grabbed: false, alpha: 0, coil: 0,
  },

  // the drying rack
  rack: { alpha: 0, rodTopY: -280, rodBotY: -160, postTop: -980, postBot: 980, grabbed: false },

  strands: [],
  targetCount: 0,
  baseThick: 30,
  stretch: 0,      // 0..1 second stretch progress
  comb: -RACK_HALF - 80,
  combDone: 0,     // 0..1
  dryness: 0,
  gusts: [],

  layout: { from: 'hang', to: 'hang', t: 1 },

  cut: { left: false, right: false, flashL: 0, flashR: 0, guides: 0 },
  offcuts: [],

  band: { x: 0, y: 300, on: false, t: 0, grabbed: false, alpha: 0 },
  bundle: { rot: 0, lift: 0, alpha: 0 },

  mood: { from: 'shop', to: 'shop', t: 1 },
  flash: 0,
  vignette: 0.35,
  backRacks: 0,    // parallax rows of noodles behind the player's rack
  spotlight: 0,

  // layer opacities the stages fade in and out
  shopAlpha: 0,
  floorAlpha: 0,
  floorY: 300,
  boardAlpha: 0,
  cutBoardAlpha: 0,
  combAlpha: 0,
  strandAlpha: 1,
  strandOffsetY: 0,
  potA: 0,
  boilA: 0,
  steamA: 0,
  bowlA: 0,
  beams: 0,
  glow: 0,
  replay: 0,

  reveal: { t: -1, phase: 0 },
  hint: { t: 0, on: 0, x: 0, y: 0, kind: 'tap', ang: 0 },
  done: false,
};

export function resetWorld() {
  W.time = 0;
  W.rng = makeRng(20260814);
  seq = 0;
  W.blobs.length = 0;
  W.ball = { x: 0, y: 30, r: 44, squash: 0, alpha: 1, wob: 0 };
  W.rope = { ax: -330, ay: 60, hx: -180, hy: 60, len: 0, maxLen: 620, thick: 78, grabbed: false, alpha: 0, coil: 0 };
  W.rack = { alpha: 0, rodTopY: -280, rodBotY: -160, postTop: -980, postBot: 980, grabbed: false };
  W.strands.length = 0;
  W.targetCount = 0;
  W.baseThick = 30;
  W.stretch = 0;
  W.comb = -RACK_HALF - 80;
  W.combDone = 0;
  W.dryness = 0;
  W.gusts.length = 0;
  W.layout = { from: 'hang', to: 'hang', t: 1 };
  W.cut = { left: false, right: false, flashL: 0, flashR: 0, guides: 0 };
  W.offcuts.length = 0;
  W.band = { x: 0, y: 300, on: false, t: 0, grabbed: false, alpha: 0 };
  W.bundle = { rot: 0, lift: 0, alpha: 0 };
  W.mood = { from: 'shop', to: 'shop', t: 1 };
  W.flash = 0;
  W.backRacks = 0;
  W.spotlight = 0;
  W.shopAlpha = 0;
  W.floorAlpha = 0;
  W.floorY = 300;
  W.boardAlpha = 0;
  W.cutBoardAlpha = 0;
  W.combAlpha = 0;
  W.strandAlpha = 1;
  W.strandOffsetY = 0;
  W.potA = 0; W.boilA = 0; W.steamA = 0; W.bowlA = 0;
  W.beams = 0; W.glow = 0; W.replay = 0;
  W.reveal = { t: -1, phase: 0 };
  W.hint = { t: 0, on: 0, x: 0, y: 0, kind: 'tap', ang: 0 };
  W.done = false;
}

export function setMood(name) {
  if (W.mood.to === name) return;
  W.mood.from = W.mood.to;
  W.mood.to = name;
  W.mood.t = 0;
}

// --- strands ----------------------------------------------------------

let nextId = 0;
let seq = 0;

function makeStrand() {
  const rng = W.rng;
  // Golden-ratio sequence: every newcomer lands in the widest remaining
  // gap, so the curtain thickens evenly instead of piling up at one end.
  const u = (seq++ * 0.6180339887498949 + 0.19) % 1;
  const lat = lerp(-RACK_HALF, RACK_HALF, u);
  // Fresh strands come out clumped and wavy — that mess is what the
  // separating stick later combs into a lattice.
  const cluster = Math.round(lat / 150) * 150;
  return {
    id: nextId++,
    u,
    lat,
    home: lat,
    xTop: lerp(lat, cluster, 0.5) + rr(rng, -14, 14),
    xBot: lerp(lat, cluster, 0.62) + rr(rng, -26, 26),
    tangleAmp: rr(rng, 7, 24),
    tanglePhase: rr(rng, 0, TAU),
    phase: rr(rng, 0, TAU),
    swaySpd: rr(rng, 0.8, 1.35),
    sway: 0,
    thick: W.baseThick,
    birth: 0,
    aligned: false,
    tint: rr(rng, -0.06, 0.06),
    boardY: 0,
    bundleY: 0,
    extraL: rr(rng, 6, 74),
    extraR: rr(rng, 6, 74),
    visA: 0,
    visB: 1,
    pts: new Float32Array(N * 2),
    tmpA: new Float32Array(N * 2),
    tmpB: new Float32Array(N * 2),
  };
}

export function setStrandCount(n) {
  W.targetCount = n;
  while (W.strands.length < n) W.strands.push(makeStrand());
  relayout();
}

/**
 * Assign each strand its slot in the final lattice by left-to-right order,
 * so combing from the left aligns them in the order the child sees them,
 * and so the board rows keep the same neighbours.
 */
export function relayout() {
  const sorted = [...W.strands].sort((a, b) => a.home - b.home);
  const m = sorted.length;
  sorted.forEach((s, i) => {
    const u = m === 1 ? 0.5 : (i + 0.5) / m;
    s.u = u;
    s.lat = lerp(-RACK_HALF, RACK_HALF, u);
    s.boardY = lerp(-170, 170, u);
    s.bundleY = lerp(-78, 78, u);
    if (s.aligned) { s.xTop = s.lat; s.xBot = s.lat; }
  });
}

export function gust(strength = 1, originX = -RACK_HALF) {
  W.gusts.push({ t: 0, strength, originX, life: 2.6 });
  if (W.gusts.length > 4) W.gusts.shift();
}

// --- layouts ----------------------------------------------------------

function layoutHang(s, out) {
  const topY = W.rack.rodTopY;
  const botY = W.rack.rodBotY;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const bend = Math.sin(Math.PI * t);
    const x = lerp(s.xTop, s.xBot, t)
      + s.tangleAmp * Math.sin(s.tanglePhase + t * 4.2) * bend
      + s.sway * bend;
    const y = lerp(topY, botY, t);
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
}

function layoutBoard(s, out) {
  const xa = -BOARD_HALF - s.extraL;
  const xb = BOARD_HALF + s.extraR;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const u = lerp(s.visA, s.visB, t);
    out[i * 2] = lerp(xa, xb, u);
    out[i * 2 + 1] = s.boardY + Math.sin(u * 7 + s.phase) * 2.2 + s.sway * 0.12;
  }
}

function layoutBundle(s, out) {
  // A real somen bundle is near-parallel with just a hint of flare at the
  // ends — enough to read as "many noodles", not a bow tie.
  const pinch = W.band.t * 0.5;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const edge = Math.abs(t * 2 - 1);
    // the band grips a short section: squeeze locally, stay parallel elsewhere
    const d = t - 0.5;
    const waist = 1 - pinch * Math.exp(-(d * d) / 0.016);
    const fan = 1 + 0.14 * Math.pow(edge, 3) * W.band.t;
    out[i * 2] = lerp(-GUIDE, GUIDE, t);
    out[i * 2 + 1] = s.bundleY * waist * fan + Math.sin(t * 4 + s.phase) * 1.6;
  }
}

const LAYOUTS = { hang: layoutHang, board: layoutBoard, bundle: layoutBundle };

export function strandPoints(s) {
  const L = W.layout;
  const fa = LAYOUTS[L.from] || layoutHang;
  const fb = LAYOUTS[L.to] || layoutHang;
  if (L.t >= 1 || L.from === L.to) {
    fb(s, s.pts);
    return s.pts;
  }
  fa(s, s.tmpA);
  fb(s, s.tmpB);
  const t = L.t < 0.5 ? 2 * L.t * L.t : 1 - Math.pow(-2 * L.t + 2, 2) / 2; // easeInOut
  for (let i = 0; i < N * 2; i++) {
    s.pts[i] = lerp(s.tmpA[i], s.tmpB[i], t);
  }
  return s.pts;
}

export function morphTo(name, speed = 1) {
  if (W.layout.to === name) return;
  W.layout.from = W.layout.to;
  W.layout.to = name;
  W.layout.t = 0;
  W.layout.speed = speed;
}

// --- per-frame update --------------------------------------------------

export function updateWorld(dt) {
  W.time += dt;

  if (W.layout.t < 1) {
    W.layout.t = clamp01(W.layout.t + dt * (W.layout.speed || 1));
  }
  if (W.mood.t < 1) W.mood.t = clamp01(W.mood.t + dt * 0.9);
  W.flash = damp(W.flash, 0, 4.5, dt);
  W.cut.flashL = damp(W.cut.flashL, 0, 8, dt);
  W.cut.flashR = damp(W.cut.flashR, 0, 8, dt);

  // gust decay
  for (let i = W.gusts.length - 1; i >= 0; i--) {
    const g = W.gusts[i];
    g.t += dt;
    if (g.t > g.life) W.gusts.splice(i, 1);
  }

  const hanging = W.layout.to === 'hang' || W.layout.from === 'hang';
  const calm = W.reducedMotion ? 0.35 : 1;

  for (const s of W.strands) {
    if (s.birth < 1) s.birth = clamp01(s.birth + dt * 3.2);

    // idle breathing + wind
    let sway = 0;
    if (hanging) {
      sway = Math.sin(W.time * s.swaySpd + s.phase) * lerp(3.4, 1.4, W.dryness) * calm;
      for (const g of W.gusts) {
        const travel = g.t * 900;                       // the gust rolls across the rack
        const d = (s.lat - g.originX) - travel;
        const env = Math.exp(-Math.abs(d) / 260) * Math.exp(-g.t / 0.9);
        sway += Math.sin(g.t * 12 - s.lat * 0.02) * 34 * g.strength * env * calm;
      }
    }
    s.sway = sway;

    // thickness: shrinks as the dough is drawn out, then again as it dries
    const target = W.baseThick * lerp(1, 0.94, W.dryness);
    s.thick = damp(s.thick, target, 6, dt);
  }

  // offcut pieces tumbling off the board
  for (let i = W.offcuts.length - 1; i >= 0; i--) {
    const o = W.offcuts[i];
    o.t += dt;
    o.vy += 900 * dt;
    o.y += o.vy * dt;
    o.x += o.vx * dt;
    o.rot += o.spin * dt;
    if (o.t > 1.5) W.offcuts.splice(i, 1);
  }

  // hint timer
  if (W.hint.t > 0) W.hint.on = damp(W.hint.on, 1, 6, dt);
  else W.hint.on = damp(W.hint.on, 0, 9, dt);
}

export function askHint(x, y, kind = 'tap', ang = 0) {
  W.hint.x = x; W.hint.y = y; W.hint.kind = kind; W.hint.ang = ang; W.hint.t = 1;
}
export function clearHint() { W.hint.t = 0; }

/** Colour of a noodle at the current dryness. */
export function noodleColor(s, shade = 0) {
  // warm raw dough -> bright dried somen
  const d = clamp01(W.dryness);
  const r = lerp(238, 255, d) - shade * 26 + s.tint * 12;
  const g = lerp(224, 252, d) - shade * 24 + s.tint * 10;
  const b = lerp(196, 243, d) - shade * 22;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

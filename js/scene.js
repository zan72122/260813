// World state: where the character stands, where the sun is, how far the
// rainbow crown has grown, and where the camera should be looking.

import { clamp, lerp, smoothstep, approach, mulberry32, v3 } from './math.js';

export const STAGE = {
  TITLE: 'title',
  INTRO: 'intro',
  FOG: 'fog',
  ALIGN: 'align',
  MIST: 'mist',
  FINALE: 'finale',
};

// Cloud tops stay well under white: the rainbow has to be the brightest thing
// on screen, so the fog it sits on is kept in the mid tones.
const SKIES = [
  { // clear morning
    name: 'morning',
    top: [0.16, 0.34, 0.74], mid: [0.44, 0.66, 0.92], haze: [0.88, 0.86, 0.86],
    sun: [1.00, 0.95, 0.84],
    cloudLit: [0.86, 0.88, 0.94], cloudDark: [0.40, 0.46, 0.68],
    fog: [0.46, 0.52, 0.72], fogLit: [0.82, 0.86, 0.94],
    shadow: [0.13, 0.15, 0.30], terrace: [0.62, 0.62, 0.80],
  },
  { // evening rose
    name: 'evening',
    top: [0.20, 0.20, 0.52], mid: [0.60, 0.44, 0.72], haze: [0.96, 0.72, 0.62],
    sun: [1.00, 0.84, 0.62],
    cloudLit: [0.94, 0.80, 0.78], cloudDark: [0.42, 0.36, 0.62],
    fog: [0.48, 0.42, 0.64], fogLit: [0.90, 0.78, 0.80],
    shadow: [0.16, 0.11, 0.26], terrace: [0.66, 0.56, 0.72],
  },
  { // pale gold
    name: 'gold',
    top: [0.20, 0.42, 0.76], mid: [0.62, 0.70, 0.90], haze: [0.98, 0.84, 0.66],
    sun: [1.00, 0.96, 0.84],
    cloudLit: [0.94, 0.90, 0.82], cloudDark: [0.46, 0.50, 0.70],
    fog: [0.50, 0.54, 0.72], fogLit: [0.92, 0.88, 0.82],
    shadow: [0.16, 0.15, 0.30], terrace: [0.70, 0.64, 0.74],
  },
  { // soft mint dawn
    name: 'dawn',
    top: [0.14, 0.32, 0.64], mid: [0.44, 0.70, 0.82], haze: [0.94, 0.80, 0.86],
    sun: [1.00, 0.92, 0.88],
    cloudLit: [0.86, 0.90, 0.94], cloudDark: [0.36, 0.50, 0.66],
    fog: [0.44, 0.54, 0.68], fogLit: [0.84, 0.90, 0.94],
    shadow: [0.11, 0.16, 0.30], terrace: [0.58, 0.64, 0.78],
  },
];

export const CHAR_H = 1.72;
export const CHAR_W = 1.15;
export const TERRACE_Y = 0.55;

export function createScene(seedIn) {
  const seed = seedIn >>> 0 || (Math.random() * 4294967295) >>> 0;
  const rnd = mulberry32(seed);
  const range = (a, b) => a + rnd() * (b - a);

  const sky = SKIES[(rnd() * SKIES.length) | 0];
  // A low sun: that is what throws the long shadow the whole game depends on.
  const elev = range(0.175, 0.245);            // sun elevation, radians (10-14 deg)
  const azim = range(-0.09, 0.09);             // slight sideways offset
  const special = rnd() < 0.3;

  const L = [
    Math.sin(azim) * Math.cos(elev),
    -Math.sin(elev),
    -Math.cos(azim) * Math.cos(elev),
  ];

  const s = {
    seed,
    rnd,
    sky,
    special,
    L,
    sunDir: [-L[0], -L[1], -L[2]],

    stage: STAGE.TITLE,
    stageT: 0,
    introDur: 5.4,
    time: 0,
    idle: 0,

    // The character stands somewhere along the terrace; that varies per run.
    charX: range(-1.0, 1.0),
    charXTarget: 0,
    charZ: 0,
    charFacing: 0,

    // Growth inputs.
    fog: 0.06,
    fogPan: [0, 0],
    mist: 0,
    sweetX: 0,

    // Derived each frame.
    align: 0,
    score: 0,
    glow: 0,
    sat: 0,
    ringCount: 0,
    gloryCenter: [0, 0, -6],
    shadowHead: [0, 0, -6],
    crown: 0,

    // Per-run look of the rings.
    ringThick: range(0.85, 1.3),
    ringR0: range(0.26, 0.34),
    ringGap: range(0.185, 0.225),
    maxRings: special ? 4 : 3,
    glorySize: range(2.1, 2.6),
    shadowLen: range(5.6, 6.6),
    shadowLift: range(2.2, 2.7),

    fade: 0,
    milestone: 0,
    justGrew: 0,
    cards: null,
    sparks: [],
  };
  s.charXTarget = s.charX;
  // The sweet spot is never far from where you start: a small walk finds it,
  // and it always sits comfortably inside the ledge.
  const dir = s.charX > 0.4 ? -1 : s.charX < -0.4 ? 1 : (rnd() < 0.5 ? -1 : 1);
  s.sweetX = clamp(s.charX + dir * range(1.2, 2.1), -2.6, 2.6);

  s.cards = makeClouds(rnd, s);
  return s;
}

function makeClouds(rnd, s) {
  const range = (a, b) => a + rnd() * (b - a);
  const back = [];
  const front = [];

  // Distant cloud sea filling the horizon.
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const d = range(45, 135);
    back.push({
      base: [Math.sin(a) * d, range(-0.6, 3.4), -Math.abs(Math.cos(a)) * d - 8],
      size: range(16, 42), seed: rnd(), alpha: range(0.10, 0.24),
      warm: range(0.2, 0.9), rot: rnd() * 6.28, layer: 0,
      drift: range(0.2, 0.7), phase: rnd() * 6.28,
    });
  }
  // The bank of fog the shadow falls into: denser right around the shadow.
  for (let i = 0; i < 54; i++) {
    const nearBank = i < 26;
    back.push({
      base: nearBank
        ? [range(-9, 9), range(-0.4, 3.2), range(-11, -3.2)]
        : [range(-28, 28), range(-0.8, 3.0), range(-38, -9)],
      size: nearBank ? range(2.6, 6.5) : range(4.5, 13),
      seed: rnd(), alpha: nearBank ? range(0.05, 0.12) : range(0.10, 0.26),
      warm: range(0.0, 0.6), rot: rnd() * 6.28, layer: 1,
      drift: range(0.4, 1.3), phase: rnd() * 6.28,
    });
  }
  // Wisps close to the camera; drawn over the rings so they veil them.
  for (let i = 0; i < 22; i++) {
    front.push({
      base: [range(-11, 11), range(-0.8, 2.2), range(-9, 3.5)],
      size: range(2.2, 6.5), seed: rnd(), alpha: range(0.05, 0.15),
      warm: range(0.0, 0.5), rot: rnd() * 6.28, layer: 2,
      drift: range(0.6, 1.8), phase: rnd() * 6.28,
    });
  }
  // Mist lapping at the ledge, so the rock sits in the cloud sea.
  for (let i = 0; i < 10; i++) {
    front.push({
      base: [range(-5, 5), range(0.0, 0.8), range(-1.6, 2.4)],
      size: range(1.4, 3.0), seed: rnd(), alpha: range(0.06, 0.14),
      warm: range(0.2, 0.8), rot: rnd() * 6.28, layer: 2,
      drift: range(0.3, 0.9), phase: rnd() * 6.28,
    });
  }
  void s;
  return { back, front };
}

// The shadow falls on a bank of fog that rises away from the terrace, so it
// starts at the child's feet and stands up in the mist ahead of them. That is
// what a Brocken spectre actually looks like, and it keeps the head big enough
// on a phone for the ring to sit on it.
export function shadowCorners(s) {
  const len = s.shadowLen;
  const lift = s.shadowLift;
  const drift = s.L[0] / -s.L[2];          // sideways lean from the sun's azimuth
  const near = 1.1;
  const z0 = s.charZ - near, z1 = s.charZ - len;
  const x0 = s.charX + drift * near, x1 = s.charX + drift * len;
  const w0 = CHAR_W * 1.05 * 0.5, w1 = CHAR_W * 2.05 * 0.5;
  return {
    c00: [x0 - w0, 0.02, z0],
    c10: [x0 + w0, 0.02, z0],
    c01: [x1 - w1, lift, z1],
    c11: [x1 + w1, lift, z1],
  };
}

export function update(s, dt) {
  s.time += dt;
  s.stageT += dt;
  s.idle += dt;

  // Character eases toward wherever the player last swiped.
  s.charX = approach(s.charX, s.charXTarget, 6.5, dt);

  // Gentle helpers, never a fail state: fog creeps in on its own if the
  // player waits, and the sweet spot drifts toward them if they linger.
  if (s.stage === STAGE.FOG && s.idle > 6) s.fog = Math.min(1, s.fog + dt * 0.045);
  if (s.stage === STAGE.ALIGN) {
    // The sweet spot drifts toward the child, faster if they have stopped
    // trying. Nobody gets stuck, but it never solves itself in a blink.
    const help = s.idle > 10 ? 0.36 : 0.05;
    s.sweetX = lerp(s.sweetX, s.charX, clamp(help * dt, 0, 0.05));
  }
  if (s.stage === STAGE.FINALE) {
    // Lock the crown on: playing after the reveal never breaks the picture.
    s.sweetX = approach(s.sweetX, s.charX, 3.0, dt);
    s.mist = Math.min(1, s.mist + dt * 0.5);
    s.fog = Math.min(1, s.fog + dt * 0.25);
    s.crown = Math.min(1, s.crown + dt * 0.4);
  }

  const corners = shadowCorners(s);
  // The head sits at v = 0.73 of the silhouette, not at the very top edge.
  const HEAD_V = 0.73;
  s.shadowHead = [0, 1, 2].map((i) => {
    const foot = (corners.c00[i] + corners.c10[i]) * 0.5;
    const top = (corners.c01[i] + corners.c11[i]) * 0.5;
    return foot + (top - foot) * HEAD_V;
  });
  s.corners = corners;

  // How well the sun, the child and the camera line up. Deliberately a wide,
  // smooth basin rather than a hit-or-miss target.
  const mis = clamp((s.charX - s.sweetX) / 3.0, -1.6, 1.6);
  s.mis = mis;
  s.align = clamp(1 - Math.pow(Math.abs(mis), 1.35), 0, 1);

  const fogQ = smoothstep(0.10, 0.80, s.fog);
  const mistQ = s.mist;
  s.score = clamp(s.align * fogQ * (0.56 + 0.44 * mistQ), 0, 1);

  const target = Math.min(s.maxRings, Math.max(0, (s.score - 0.05) * 4.4));
  s.ringCount = approach(s.ringCount, target, 3.0, dt);
  s.glow = approach(s.glow, smoothstep(0.015, 0.26, s.score) * (0.34 + 0.72 * s.score), 4.0, dt);
  s.sat = approach(s.sat, smoothstep(0.16, 0.72, s.score), 3.0, dt);

  // The halo hangs in the fog beside the shadow until the child lines up.
  const gx = s.shadowHead[0] + mis * 3.4;
  const gy = s.shadowHead[1] - mis * mis * 0.7;
  s.gloryCenter = [gx, gy, s.shadowHead[2]];

  // Milestones drive the chimes and the "it grew!" flourishes.
  const m = Math.floor(s.ringCount + 0.001);
  if (m > s.milestone) {
    s.milestone = m;
    s.justGrew = 1;
  }
  s.justGrew = Math.max(0, s.justGrew - dt * 2);

  updateSparks(s, dt);
  updateStage(s, dt);
}

function updateStage(s, dt) {
  switch (s.stage) {
    case STAGE.INTRO:
      if (s.stageT > s.introDur) setStage(s, STAGE.FOG);
      break;
    case STAGE.FOG:
      if (s.fog > 0.72) setStage(s, STAGE.ALIGN);
      break;
    case STAGE.ALIGN:
      // A wide basin: anywhere near the sweet spot counts, and it only has to
      // be held for a moment.
      if (s.align > 0.55) {
        s.hold = (s.hold || 0) + dt;
        if (s.hold > 1.1) setStage(s, STAGE.MIST);
      } else {
        s.hold = Math.max(0, (s.hold || 0) - dt * 0.5);
      }
      break;
    case STAGE.MIST:
      if (s.mist > 0.92) setStage(s, STAGE.FINALE);
      break;
    default:
      break;
  }
}

export function setStage(s, stage) {
  if (s.stage === stage) return;
  s.stage = stage;
  s.stageT = 0;
  s.idle = 0;
  s.hold = 0;
  if (stage === STAGE.FINALE) burstSparks(s, 46);
}

/* --------------------------------------------------------------- sparks --- */

function burstSparks(s, n) {
  for (let i = 0; i < n; i++) {
    const a = s.rnd() * Math.PI * 2;
    const r = 0.8 + s.rnd() * 2.6;
    s.sparks.push({
      p: [
        s.gloryCenter[0] + Math.cos(a) * r,
        s.gloryCenter[1] + Math.sin(a) * r * 0.9,
        s.gloryCenter[2] + (s.rnd() - 0.5) * 1.6,
      ],
      v: [(s.rnd() - 0.5) * 0.18, 0.10 + s.rnd() * 0.22, (s.rnd() - 0.5) * 0.12],
      life: 1, decay: 0.16 + s.rnd() * 0.18,
      size: 0.05 + s.rnd() * 0.09,
      hue: s.rnd(),
    });
  }
}

function updateSparks(s, dt) {
  if (s.stage === STAGE.FINALE && s.special && s.rnd() < dt * 14) burstSparks(s, 1);
  else if (s.stage === STAGE.FINALE && s.rnd() < dt * 5) burstSparks(s, 1);
  for (let i = s.sparks.length - 1; i >= 0; i--) {
    const p = s.sparks[i];
    p.life -= dt * p.decay;
    if (p.life <= 0) { s.sparks.splice(i, 1); continue; }
    p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt; p.p[2] += p.v[2] * dt;
    p.v[1] -= dt * 0.02;
  }
}

/* --------------------------------------------------------------- camera --- */

// Camera keyframes. `theta` is the angle around the child: 0 is directly
// behind them, PI is out in front where the sun is.
// `y` is measured up from the terrace, `r` is the distance behind the child.
// The whole rig is tuned so the child, their shadow and the ring all land in
// one frame with the shadow head above the child's head.
const RIGS = {
  // The opening looks back at the child with the sun blazing behind them.
  [STAGE.TITLE]: { theta: 3.05, r: 7.6, y: 2.3, bias: 0.12, fov: 52, yOff: 0.40 },
  [STAGE.INTRO]: { theta: 0.0, r: 6.4, y: 4.45, bias: 0.55, fov: 50, yOff: 0.45 },
  [STAGE.FOG]: { theta: 0.0, r: 6.4, y: 4.45, bias: 0.55, fov: 50, yOff: 0.45 },
  [STAGE.ALIGN]: { theta: 0.0, r: 6.2, y: 4.5, bias: 0.60, fov: 48, yOff: 0.40 },
  [STAGE.MIST]: { theta: 0.0, r: 5.9, y: 4.5, bias: 0.65, fov: 46, yOff: 0.34 },
  [STAGE.FINALE]: { theta: 0.0, r: 7.3, y: 4.9, bias: 0.55, fov: 50, yOff: 0.50 },
};

export function createCamera() {
  return { theta: RIGS[STAGE.TITLE].theta, r: RIGS[STAGE.TITLE].r, y: RIGS[STAGE.TITLE].y,
           bias: RIGS[STAGE.TITLE].bias, fov: RIGS[STAGE.TITLE].fov, yOff: RIGS[STAGE.TITLE].yOff,
           eye: [0, 2, 4], target: [0, 1, -4], right: [1, 0, 0], up: [0, 1, 0] };
}

export function updateCamera(cam, s, dt) {
  const rig = RIGS[s.stage] || RIGS[STAGE.FOG];

  // The opening swing from the sunlit front view round to behind the child.
  let want = { ...rig };
  if (s.stage === STAGE.INTRO) {
    const t = smoothstep(0.22, 1.0, clamp(s.stageT / (s.introDur * 0.86), 0, 1));
    const start = RIGS[STAGE.TITLE];
    want.theta = lerp(start.theta, rig.theta, t);
    want.r = lerp(start.r, rig.r, t);
    want.y = lerp(start.y, rig.y, t);
    want.bias = lerp(start.bias, rig.bias, t);
    want.fov = lerp(start.fov, rig.fov, t);
    want.yOff = lerp(start.yOff, rig.yOff, t);
  }
  if (s.stage === STAGE.FINALE) {
    want.theta += Math.sin(s.stageT * 0.22) * 0.10;
    want.r += Math.sin(s.stageT * 0.17) * 0.18;
  }
  // A touch of drift so the frame is never dead still.
  want.y += Math.sin(s.time * 0.31) * 0.035;

  const rate = s.stage === STAGE.INTRO ? 9 : 2.2;
  cam.theta = approach(cam.theta, want.theta, rate, dt);
  cam.r = approach(cam.r, want.r, rate, dt);
  cam.y = approach(cam.y, want.y, rate, dt);
  cam.bias = approach(cam.bias, want.bias, rate, dt);
  cam.fov = approach(cam.fov, want.fov, rate, dt);
  cam.yOff = approach(cam.yOff, want.yOff, rate, dt);

  // The camera only half-follows sideways, so moving really feels like moving.
  const anchorX = s.charX * 0.5;
  cam.eye = [
    anchorX + Math.sin(cam.theta) * cam.r,
    TERRACE_Y + cam.y,
    s.charZ + Math.cos(cam.theta) * cam.r,
  ];

  const head = [s.charX, TERRACE_Y + CHAR_H * 0.72, s.charZ];
  const look = s.stage === STAGE.TITLE || s.stage === STAGE.INTRO
    ? s.shadowHead
    : v3.lerp(s.shadowHead, s.gloryCenter, 0.55);
  cam.target = v3.lerp(head, look, cam.bias);
  cam.target[1] += cam.yOff;

  const fwd = v3.norm(v3.sub(cam.target, cam.eye));
  cam.right = v3.norm(v3.cross(fwd, [0, 1, 0]));
  cam.up = v3.cross(cam.right, fwd);

  // Which of the three character poses to show, from the camera angle.
  const a = Math.abs(((cam.theta % 6.283) + 6.283) % 6.283);
  const ang = a > Math.PI ? 6.283 - a : a;   // 0 behind .. PI in front
  const f = ang / Math.PI;                   // 0 = back, 1 = front
  if (f < 0.5) { cam.tileA = 2; cam.tileB = 1; cam.tileMix = smoothstep(0.08, 0.5, f); }
  else { cam.tileA = 1; cam.tileB = 0; cam.tileMix = smoothstep(0.5, 0.92, f); }
  return cam;
}

/* ---------------------------------------------------------------- input --- */

export function applyDragFog(s, dx, dy, vw, vh) {
  const d = Math.hypot(dx / vw, dy / vh);
  s.fog = clamp(s.fog + d * 0.75, 0, 1);
  s.fogPan[0] = clamp(s.fogPan[0] + dx / vw * 3.0, -2.5, 2.5);
  s.fogPan[1] = clamp(s.fogPan[1] - dy / vh * 1.6, -1.0, 1.4);
  s.idle = 0;
}

export function applySwipe(s, dx, vw) {
  s.charXTarget = clamp(s.charXTarget + (dx / vw) * 6.0, -3.3, 3.3);
  s.idle = 0;
}

export function applyHold(s, dt) {
  s.mist = clamp(s.mist + dt * 0.44, 0, 1);
  s.fog = clamp(s.fog + dt * 0.10, 0, 1);
  s.idle = 0;
}

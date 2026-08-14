// Tiny WebAudio sound kit. Everything is synthesised — no asset downloads,
// which keeps the first paint fast on a phone.

import { clamp, clamp01, lerp } from './util.js';

let ac = null;
let master = null;
let noiseBuf = null;
let muted = false;
let ready = false;

// C major pentatonic, two octaves. Friendly, never dissonant.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0];

export const audio = {
  get enabled() { return ready && !muted; },
  get muted() { return muted; },
  get started() { return ready; },
};

export function unlock() {
  if (ready) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ac = new AC();
  } catch (e) {
    return;
  }
  master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);

  const len = Math.floor(ac.sampleRate * 1.2);
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  ready = true;
  // Safari starts suspended until a gesture-driven resume.
  if (ac.state === 'suspended') ac.resume();
}

export function setMuted(v) {
  muted = !!v;
  if (master) master.gain.value = muted ? 0 : 0.9;
}
export function toggleMute() {
  setMuted(!muted);
  return muted;
}

function now() { return ac ? ac.currentTime : 0; }
function ok() { return ready && !muted && ac && ac.state !== 'closed'; }

function tone({ freq = 440, to = null, dur = 0.25, type = 'sine', gain = 0.2, delay = 0, attack = 0.005, cutoff = 0 }) {
  if (!ok()) return;
  const t = now() + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (cutoff) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    node.connect(f);
    node = f;
  }
  node.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ dur = 0.3, gain = 0.15, delay = 0, type = 'bandpass', f0 = 800, f1 = 800, q = 1 }) {
  if (!ok()) return;
  const t = now() + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = ac.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  /** soft "puft" when a lump of dough merges */
  pop(pitch = 0) {
    tone({ freq: 330 + pitch * 40, to: 150, dur: 0.22, type: 'sine', gain: 0.22, cutoff: 1400 });
    noise({ dur: 0.12, gain: 0.05, f0: 900, f1: 300, q: 0.7 });
  },
  /** woody knock: hanging on the rod, snapping into place */
  knock() {
    tone({ freq: 210, to: 90, dur: 0.26, type: 'triangle', gain: 0.3 });
    noise({ dur: 0.09, gain: 0.09, f0: 1600, f1: 500, q: 1.2 });
  },
  /** short bell from the pentatonic scale */
  note(i = 0, gain = 0.14, delay = 0, dur = 0.6) {
    const f = SCALE[clamp(Math.round(i), 0, SCALE.length - 1)];
    tone({ freq: f, dur, type: 'sine', gain, delay });
    tone({ freq: f * 2.01, dur: dur * 0.55, type: 'sine', gain: gain * 0.35, delay });
  },
  /** the "しゃらら" cascade */
  shara(count = 6, base = 2, spread = 0.045, gain = 0.1) {
    for (let i = 0; i < count; i++) {
      sfx.note(base + i, gain * (1 - i / (count * 1.6)), i * spread, 0.7);
    }
  },
  whoosh(strength = 1) {
    noise({ dur: 0.5 * strength, gain: 0.075 * strength, f0: 320, f1: 1500, q: 0.6 });
    noise({ dur: 0.6 * strength, gain: 0.05 * strength, f0: 1500, f1: 260, q: 0.5, delay: 0.12 });
  },
  cut() {
    noise({ dur: 0.13, gain: 0.16, f0: 3600, f1: 900, q: 2.2 });
    tone({ freq: 1400, to: 500, dur: 0.1, type: 'triangle', gain: 0.07 });
  },
  cinch() {
    noise({ dur: 0.22, gain: 0.1, f0: 500, f1: 2400, q: 1.4 });
    tone({ freq: 300, to: 620, dur: 0.2, type: 'sine', gain: 0.16 });
  },
  boil() {
    noise({ dur: 1.6, gain: 0.06, f0: 400, f1: 700, q: 0.4 });
    for (let i = 0; i < 12; i++) {
      tone({ freq: 500 + Math.random() * 700, to: 900, dur: 0.09, type: 'sine', gain: 0.035, delay: Math.random() * 1.4 });
    }
  },
  sparkle(n = 4) {
    for (let i = 0; i < n; i++) {
      sfx.note(6 + Math.floor(Math.random() * 5), 0.07, i * 0.05 + Math.random() * 0.05, 0.9);
    }
  },
  /** wind-bell: the signal for Japanese summer */
  furin() {
    const bells = [1568, 1760, 2093, 1760, 1318];
    for (let i = 0; i < bells.length; i++) {
      const f = bells[i];
      tone({ freq: f, dur: 1.8, type: 'sine', gain: 0.09, delay: i * 0.17 });
      tone({ freq: f * 2.76, dur: 0.9, type: 'sine', gain: 0.03, delay: i * 0.17 });
    }
  },
  stageClear() {
    sfx.note(2, 0.14, 0.0, 0.5);
    sfx.note(4, 0.14, 0.09, 0.5);
    sfx.note(7, 0.16, 0.18, 0.9);
  },
  fanfare() {
    const seq = [0, 2, 4, 5, 7, 9, 7];
    seq.forEach((n, i) => sfx.note(n, 0.15, i * 0.11, 1.1));
    tone({ freq: 130.8, dur: 2.4, type: 'triangle', gain: 0.08, delay: 0.1 });
    tone({ freq: 196.0, dur: 2.4, type: 'triangle', gain: 0.06, delay: 0.1 });
  },
};

// --- continuous "stretching" voice ------------------------------------
// One oscillator that lives while the child is pulling; the pitch rises
// with how far the dough has been drawn out.

let stretchOsc = null, stretchGain = null, stretchFilt = null;

export function stretchStart() {
  if (!ok() || stretchOsc) return;
  const t = now();
  stretchOsc = ac.createOscillator();
  stretchFilt = ac.createBiquadFilter();
  stretchGain = ac.createGain();
  stretchOsc.type = 'sawtooth';
  stretchOsc.frequency.setValueAtTime(180, t);
  stretchFilt.type = 'lowpass';
  stretchFilt.frequency.setValueAtTime(700, t);
  stretchFilt.Q.value = 4;
  stretchGain.gain.setValueAtTime(0.0001, t);
  stretchGain.gain.exponentialRampToValueAtTime(0.05, t + 0.08);
  stretchOsc.connect(stretchFilt);
  stretchFilt.connect(stretchGain);
  stretchGain.connect(master);
  stretchOsc.start(t);
}

export function stretchUpdate(progress, speed) {
  if (!stretchOsc) return;
  const t = now();
  const f = lerp(170, 520, clamp01(progress));
  stretchOsc.frequency.setTargetAtTime(f, t, 0.08);
  stretchFilt.frequency.setTargetAtTime(lerp(600, 2400, clamp01(speed)), t, 0.1);
  stretchGain.gain.setTargetAtTime(lerp(0.012, 0.06, clamp01(speed)), t, 0.09);
}

export function stretchStop() {
  if (!stretchOsc) return;
  const t = now();
  try {
    stretchGain.gain.setTargetAtTime(0.0001, t, 0.06);
    stretchOsc.stop(t + 0.4);
  } catch (e) { /* already stopped */ }
  const o = stretchOsc;
  stretchOsc = null; stretchGain = null; stretchFilt = null;
  setTimeout(() => { try { o.disconnect(); } catch (e) {} }, 600);
}

// --- ambient bed -------------------------------------------------------
// Sparse marimba-ish notes, very quiet, so silence never feels broken.

let ambTimer = 2.0;
let ambStep = 0;
export function updateAudio(dt) {
  if (!ok()) return;
  ambTimer -= dt;
  if (ambTimer <= 0) {
    ambTimer = 2.6 + Math.random() * 2.4;
    const pattern = [0, 2, 4, 2, 5, 4, 2, 0];
    const n = pattern[ambStep % pattern.length];
    ambStep++;
    tone({ freq: SCALE[n] / 2, dur: 1.5, type: 'sine', gain: 0.045 });
    tone({ freq: SCALE[n + 2] / 2, dur: 1.3, type: 'sine', gain: 0.028, delay: 0.18 });
  }
}

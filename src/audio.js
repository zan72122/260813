// Synthesised sound - no asset downloads, nothing to preload, and nothing
// loud. iOS needs the context resumed from inside a real touch handler.

let ctx = null;
let master = null;
let noiseBuf = null;
export let muted = false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}

function env(node, t0, a, d, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  node.connect(g);
  g.connect(master);
  return g;
}

function noise(t0, dur, { f = 1200, q = 0.8, gain = 0.18, type = 'bandpass' } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, t0);
  flt.Q.value = q;
  src.connect(flt);
  env(flt, t0, Math.min(0.05, dur * 0.3), dur, gain);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
  return flt;
}

function tone(t0, freq, dur, { type = 'sine', gain = 0.2, to = null } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env(o, t0, 0.012, dur, gain);
  o.start(t0);
  o.stop(t0 + dur + 0.1);
  return o;
}

const now = () => (ctx ? ctx.currentTime : 0);

let lastSwish = 0;
export const sfx = {
  /** dry starch under a hand or a brush */
  swish(strength = 1) {
    if (!ensure() || muted) return;
    const t = now();
    if (t - lastSwish < 0.075) return;
    lastSwish = t;
    noise(t, 0.16, { f: 2200 + strength * 1800, q: 0.6, gain: 0.05 + 0.07 * strength });
  },
  /** "boss!" - the stamp landing in the powder */
  thud() {
    if (!ensure() || muted) return;
    const t = now();
    tone(t, 150, 0.28, { type: 'sine', gain: 0.42, to: 52 });
    noise(t, 0.3, { f: 420, q: 0.5, gain: 0.24, type: 'lowpass' });
  },
  /** glugging juice */
  pour(level = 0) {
    if (!ensure() || muted) return;
    const t = now();
    tone(t, 220 + level * 420, 0.1, { type: 'sine', gain: 0.1, to: 320 + level * 520 });
  },
  /** the jelly setting, and every later wobble */
  boing() {
    if (!ensure() || muted) return;
    const t = now();
    tone(t, 620, 0.26, { type: 'triangle', gain: 0.22, to: 240 });
    tone(t + 0.05, 900, 0.18, { type: 'sine', gain: 0.1, to: 420 });
  },
  /** the tray going over */
  whoosh() {
    if (!ensure() || muted) return;
    const t = now();
    noise(t, 0.7, { f: 700, q: 0.4, gain: 0.16, type: 'lowpass' });
    tone(t + 0.5, 120, 0.35, { type: 'sine', gain: 0.34, to: 48 });
  },
  /** a gummy just came out of the powder */
  ding(step = 0) {
    if (!ensure() || muted) return;
    const t = now();
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    tone(t, scale[step % scale.length], 0.34, { type: 'sine', gain: 0.2 });
    tone(t + 0.005, scale[step % scale.length] * 2, 0.22, { type: 'sine', gain: 0.07 });
  },
  /** polishing shimmer */
  shine() {
    if (!ensure() || muted) return;
    const t = now();
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      tone(t + i * 0.07, f, 0.4, { type: 'sine', gain: 0.13 });
    });
  },
  /** the big reveal fanfare */
  fanfare() {
    if (!ensure() || muted) return;
    const t = now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(t + i * 0.13, f, 0.55, { type: 'triangle', gain: 0.2 });
    });
  },
  tap() {
    if (!ensure() || muted) return;
    tone(now(), 880, 0.09, { type: 'sine', gain: 0.14, to: 1200 });
  },
};

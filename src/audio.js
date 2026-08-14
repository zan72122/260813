// WebAudio による効果音。外部アセットなし。最初のタップで初期化（iOS 対策）。
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const len = Math.floor(ctx.sampleRate * 1.5);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = v ? 0 : 0.5;
}
export function isMuted() {
  return muted;
}

const now = () => (ctx ? ctx.currentTime : 0);

function tone(freq, dur, type = 'sine', gain = 0.2, glideTo = null) {
  if (!ctx || muted) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now());
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now() + dur);
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(gain, now() + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  o.connect(g).connect(master);
  o.start();
  o.stop(now() + dur + 0.05);
}

function noise(dur, freq, q, gain = 0.2, sweepTo = null) {
  if (!ctx || muted) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, now());
  f.Q.value = q;
  if (sweepTo) f.frequency.linearRampToValueAtTime(sweepTo, now() + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(gain, now() + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
  s.connect(f).connect(g).connect(master);
  s.start();
  s.stop(now() + dur + 0.05);
}

// --- ループ音（注ぐ / 湯気 / 混ぜる） ---
class Loop {
  constructor(make) {
    this.make = make;
    this.node = null;
    this.gain = null;
  }
  set(level) {
    if (!ctx || muted) return;
    level = Math.max(0, Math.min(1, level));
    if (level > 0.02 && !this.node) {
      const built = this.make(ctx);
      this.node = built.src;
      this.gain = built.gain;
      this.gain.connect(master);
      this.node.start();
    }
    if (this.gain) this.gain.gain.setTargetAtTime(level * 0.16, now(), 0.06);
    if (level <= 0.02 && this.node) {
      const n = this.node;
      const g = this.gain;
      this.node = null;
      this.gain = null;
      g.gain.setTargetAtTime(0.0001, now(), 0.05);
      setTimeout(() => {
        try {
          n.stop();
        } catch {
          /* noop */
        }
      }, 400);
    }
  }
  stop() {
    this.set(0);
  }
}

const mkNoiseLoop = (freq, q) => (c) => {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const gain = c.createGain();
  gain.gain.value = 0.0001;
  src.connect(f).connect(gain);
  return { src, gain };
};

export const pourLoop = new Loop(mkNoiseLoop(700, 1.2));
export const steamLoop = new Loop(mkNoiseLoop(3200, 0.7));
export const whiskLoop = new Loop(mkNoiseLoop(1800, 2.2));
export const coldLoop = new Loop(mkNoiseLoop(420, 0.9));

export function stopAllLoops() {
  pourLoop.stop();
  steamLoop.stop();
  whiskLoop.stop();
  coldLoop.stop();
}

// --- 単発音 ---
export const sfx = {
  tap: () => tone(660, 0.12, 'sine', 0.16, 880),
  bubble: () => tone(300 + Math.random() * 250, 0.1, 'sine', 0.1, 160),
  clack: () => {
    noise(0.09, 2400, 1.5, 0.18);
    tone(180, 0.16, 'sine', 0.12, 90);
  },
  place: () => {
    tone(320, 0.18, 'triangle', 0.12, 220);
    noise(0.06, 1200, 1, 0.1);
  },
  whoosh: () => noise(0.45, 500, 0.8, 0.2, 1800),
  // ぷるん（型から外れる瞬間）: ピッチが下がり、軽く揺れる
  purun: () => {
    if (!ctx || muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, now());
    o.frequency.exponentialRampToValueAtTime(200, now() + 0.42);
    lfo.frequency.value = 11;
    lg.gain.value = 42;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, now());
    g.gain.exponentialRampToValueAtTime(0.32, now() + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.55);
    o.connect(g).connect(master);
    o.start();
    lfo.start();
    o.stop(now() + 0.6);
    lfo.stop(now() + 0.6);
  },
  drip: () => tone(880, 0.22, 'sine', 0.1, 420),
  sparkle: () => {
    [784, 988, 1175, 1568].forEach((f, i) =>
      setTimeout(() => tone(f, 0.5, 'triangle', 0.12), i * 90)
    );
  },
  chime: () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.6, 'sine', 0.13), i * 70));
  },
};

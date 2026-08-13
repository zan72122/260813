// WebAudio だけで作る効果音（音源ファイルなし・軽量）
// iOS 対策：最初のタッチで resume する。

let ctx = null;
let master = null;
let muted = false;
let noiseBuf = null;
let fireNode = null;

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  if (master) master.gain.value = muted ? 0 : 0.9;
  if (muted) stopFire();
}

export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);

  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function tone({ freq = 440, dur = 0.25, type = 'sine', gain = 0.3, slide = 0, delay = 0 }) {
  if (!ctx || muted) return;
  const t0 = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.3, gain = 0.2, lo = 200, hi = 2400, delay = 0, q = 0.7 }) {
  if (!ctx || muted || !noiseBuf) return;
  const t0 = now() + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(lo, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(60, hi), t0 + dur);
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(bp).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.05);
}

/* ---- ゲームの音 ---- */

export const sfx = {
  tap() {
    tone({ freq: 620, dur: 0.12, type: 'triangle', gain: 0.22, slide: 260 });
  },
  drop() {
    tone({ freq: 300, dur: 0.16, type: 'sine', gain: 0.3, slide: -160 });
    noise({ dur: 0.14, gain: 0.1, lo: 900, hi: 300 });
  },
  bubble() {
    const f = 220 + Math.random() * 260;
    tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.16, slide: 180 });
  },
  fan() {
    noise({ dur: 0.45, gain: 0.16, lo: 1600, hi: 380, q: 0.5 });
  },
  grow() {
    const f = 500 + Math.random() * 120;
    tone({ freq: f, dur: 0.16, type: 'square', gain: 0.09, slide: 420 });
    tone({ freq: f * 2, dur: 0.22, type: 'sine', gain: 0.12, slide: 300 });
  },
  pour() {
    noise({ dur: 0.9, gain: 0.15, lo: 500, hi: 1500, q: 0.4 });
  },
  clink() {
    tone({ freq: 1180, dur: 0.3, type: 'triangle', gain: 0.16, slide: -180 });
    tone({ freq: 1760, dur: 0.2, type: 'sine', gain: 0.1 });
  },
  sparkle(i = 0) {
    const scale = [784, 880, 988, 1175, 1319, 1568];
    tone({
      freq: scale[i % scale.length],
      dur: 0.35,
      type: 'sine',
      gain: 0.16,
      slide: 60,
    });
  },
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.2, delay: i * 0.11 });
      tone({ freq: f * 2, dur: 0.4, type: 'sine', gain: 0.1, delay: i * 0.11 });
    });
  },
  place() {
    tone({ freq: 420, dur: 0.22, type: 'sine', gain: 0.22, slide: 300 });
  },
};

/* ---- 炎のループ音 ---- */

export function startFire() {
  if (!ctx || muted || fireNode) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now());
  g.gain.exponentialRampToValueAtTime(0.16, now() + 0.25);
  s.connect(lp).connect(g).connect(master);
  s.start();
  fireNode = { s, g };
}

export function stopFire() {
  if (!fireNode || !ctx) return;
  const { s, g } = fireNode;
  fireNode = null;
  try {
    g.gain.cancelScheduledValues(now());
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now());
    g.gain.exponentialRampToValueAtTime(0.0001, now() + 0.25);
    s.stop(now() + 0.3);
  } catch {
    /* すでに止まっている */
  }
}

// 効果音はすべて WebAudio で合成する（音声ファイルなし = 読み込み待ちゼロ）
import { clamp, lerp } from './util.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
let steamNode = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { enabled = false; return null; }
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

function noise() {
  const c = ac();
  if (!c) return null;
  if (!noiseBuf) {
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // ややブラウン寄りのノイズ
      d[i] = last * 3.5;
    }
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/** 最初のタッチで解錠する（iOS 必須） */
export function unlock() {
  const c = ac();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  // 無音を 1 発鳴らして解錠を確定させる
  const o = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.0001;
  o.connect(g); g.connect(master);
  o.start(); o.stop(c.currentTime + 0.02);
}

export function setEnabled(v) {
  enabled = v;
  if (master) master.gain.value = v ? 0.5 : 0;
}
export function isEnabled() { return enabled; }

function env(node, t0, a, d, peak = 1) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone(freq, { type = 'sine', dur = 0.2, attack = 0.01, gain = 0.25, glide = 0, delay = 0, detune = 0 } = {}) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
  if (detune) o.detune.value = detune;
  o.connect(g); g.connect(master);
  env(g, t0, attack, dur, gain);
  o.start(t0);
  o.stop(t0 + dur + attack + 0.05);
}

function noiseBurst({ dur = 0.2, gain = 0.2, f0 = 1200, f1 = 400, q = 1, type = 'bandpass', delay = 0 } = {}) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + delay;
  const src = noise();
  if (!src) return;
  const f = c.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);
  const g = c.createGain();
  src.connect(f); f.connect(g); g.connect(master);
  env(g, t0, 0.012, dur, gain);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
}

/* ---------------------------- 効果音 ---------------------------- */

export const sfx = {
  tap() { tone(660, { type: 'triangle', dur: 0.1, gain: 0.16, glide: 1.6 }); },

  pop(p = 1) {
    tone(320 * p, { type: 'sine', dur: 0.12, gain: 0.22, glide: 2.4 });
    noiseBurst({ dur: 0.06, gain: 0.06, f0: 2000, f1: 800 });
  },

  water() {
    noiseBurst({ dur: 0.7, gain: 0.12, f0: 700, f1: 1800, q: 0.7 });
    for (let i = 0; i < 5; i++) {
      tone(500 + i * 120, { type: 'sine', dur: 0.12, gain: 0.05, glide: 1.8, delay: i * 0.09 });
    }
  },

  bubble() { tone(420 + Math.random() * 260, { type: 'sine', dur: 0.14, gain: 0.07, glide: 2.2 }); },

  lever() {
    tone(180, { type: 'square', dur: 0.09, gain: 0.1, glide: 0.6 });
    noiseBurst({ dur: 0.12, gain: 0.1, f0: 900, f1: 200 });
  },

  steamPuff() { noiseBurst({ dur: 0.5, gain: 0.11, f0: 2600, f1: 900, q: 0.6, type: 'bandpass' }); },

  steamOn() {
    const c = ac();
    if (!c || !enabled || steamNode) return;
    const src = noise();
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.4);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    steamNode = { src, g };
  },

  steamOff() {
    if (!steamNode || !ctx) return;
    const { src, g } = steamNode;
    steamNode = null;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    try { src.stop(ctx.currentTime + 0.5); } catch (e) { /* noop */ }
  },

  spray() {
    noiseBurst({ dur: 0.38, gain: 0.16, f0: 5200, f1: 2200, q: 0.9, type: 'highpass' });
    tone(1400, { type: 'sine', dur: 0.16, gain: 0.05, glide: 1.5 });
  },

  drop(i = 0) {
    const f = 300 + ((i * 37) % 7) * 40;
    tone(f, { type: 'sine', dur: 0.11, gain: 0.16, glide: 2.6 });
  },

  dial(p = 0) {
    tone(500 + p * 400, { type: 'triangle', dur: 0.06, gain: 0.07, glide: 1.2 });
  },

  warm() { tone(160, { type: 'sine', dur: 0.9, gain: 0.1, glide: 1.4 }); },

  ding() {
    tone(1180, { type: 'sine', dur: 0.7, gain: 0.18 });
    tone(1770, { type: 'sine', dur: 0.5, gain: 0.08, delay: 0.02 });
  },

  open() {
    noiseBurst({ dur: 0.25, gain: 0.13, f0: 3000, f1: 700 });
    tone(520, { type: 'triangle', dur: 0.2, gain: 0.12, glide: 1.5 });
  },

  /** 混ぜる音：粘りが増すほど低くねばっこく */
  stir(sticky = 0) {
    const g = 0.05 + sticky * 0.07;
    noiseBurst({ dur: 0.2 + sticky * 0.12, gain: g, f0: 900 - sticky * 400, f1: 300, q: 1.6 });
    tone(180 + sticky * 60, { type: 'sine', dur: 0.16, gain: 0.05 * (0.4 + sticky), glide: 0.85 });
  },

  /** びよーん：伸ばすほど高く張っていく */
  stretch(amount = 0) {
    const c = ac();
    if (!c || !enabled) return;
    const t0 = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lerp(700, 2600, amount);
    o.type = 'triangle';
    const f0 = lerp(210, 640, amount);
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.35, t0 + 0.5);
    // ゆっくりしたビブラート＝粘り感
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 5.5;
    lfoG.gain.value = f0 * 0.035;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    o.connect(lp); lp.connect(g); g.connect(master);
    env(g, t0, 0.05, 0.55, 0.16);
    o.start(t0); lfo.start(t0);
    o.stop(t0 + 0.75); lfo.stop(t0 + 0.75);
  },

  snap() {
    tone(900, { type: 'sine', dur: 0.09, gain: 0.09, glide: 0.35 });
    noiseBurst({ dur: 0.05, gain: 0.05, f0: 3000, f1: 1200 });
  },

  sparkle(i = 0) {
    const scale = [0, 4, 7, 12, 16, 19];
    const f = 660 * Math.pow(2, scale[i % scale.length] / 12);
    tone(f, { type: 'sine', dur: 0.35, gain: 0.09 });
  },

  jingle() {
    const notes = [0, 4, 7, 12, 19];
    notes.forEach((n, i) => {
      tone(523.25 * Math.pow(2, n / 12), { type: 'triangle', dur: 0.45, gain: 0.16, delay: i * 0.11 });
      tone(523.25 * Math.pow(2, n / 12) * 2, { type: 'sine', dur: 0.3, gain: 0.05, delay: i * 0.11 });
    });
  },

  whoosh() { noiseBurst({ dur: 0.35, gain: 0.07, f0: 400, f1: 1800, q: 0.6 }); },

  yay() {
    [0, 5, 9, 12].forEach((n, i) =>
      tone(440 * Math.pow(2, n / 12), { type: 'triangle', dur: 0.35, gain: 0.13, delay: i * 0.07 }));
  },
};

export function setVolume(v) {
  if (master) master.gain.value = clamp(v, 0, 1);
}

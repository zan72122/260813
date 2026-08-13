'use strict';
/* audio.js — all sound is synthesized with WebAudio (no assets).
   The polish loop is the most important: filtered noise whose brightness
   follows how shiny the spot under the finger already is. */
const Sound = (() => {
  let ctx = null, master = null;
  let noiseGain = null, noiseFilter = null;
  const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.75;
      master.connect(ctx.destination);
      makeNoiseLoop();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function makeNoiseLoop() {
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;   // pink-ish noise
      b0 = 0.997 * b0 + 0.03 * w;
      b1 = 0.985 * b1 + 0.07 * w;
      b2 = 0.950 * b2 + 0.18 * w;
      data[i] = (b0 + b1 + b2 + w * 0.2) * 0.35;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 600;
    noiseFilter.Q.value = 0.9;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    src.connect(noiseFilter).connect(noiseGain).connect(master);
    src.start();
  }

  /* gain 0..1, bright 0..1 (local polish level under the finger) */
  function polish(gain, bright) {
    if (!ctx || !noiseGain) return;
    const t = ctx.currentTime;
    noiseGain.gain.setTargetAtTime(Math.min(0.4, gain), t, 0.06);
    noiseFilter.frequency.setTargetAtTime(420 + bright * 3600, t, 0.09);
    noiseFilter.Q.setTargetAtTime(0.8 + bright * 5.0, t, 0.15);
  }
  function polishStop() {
    if (!ctx || !noiseGain) return;
    noiseGain.gain.setTargetAtTime(0, ctx.currentTime, 0.10);
  }

  function note(freq, when, dur, vol, type) {
    if (!ctx) return;
    when = ctx.currentTime + (when || 0);
    dur = dur || 0.5; vol = vol || 0.18; type = type || 'sine';
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = 'sine'; o2.frequency.value = freq * 2.005; g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g2).connect(g); g.connect(master);
    o.start(when); o2.start(when);
    o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
  }

  return {
    ensure,
    polish, polishStop,
    tap() { if (ctx) note(1200, 0, 0.08, 0.05, 'triangle'); },
    pick() { if (ctx) note(PENTA[2], 0, 0.25, 0.10, 'triangle'); },
    snap(i) {
      if (!ctx) return;
      const f = PENTA[i % PENTA.length];
      note(f, 0, 0.5, 0.20);
      note(f * 1.5, 0.03, 0.4, 0.08);
    },
    back() { if (ctx) note(392, 0, 0.2, 0.06, 'triangle'); },
    reveal(y01) {
      if (!ctx) return;
      const f = PENTA[Math.max(0, Math.min(5, Math.floor(y01 * 6)))];
      note(f * 2, 0, 0.8, 0.055);
    },
    wonder() {
      if (!ctx) return;
      note(392, 0.0, 0.35, 0.09, 'triangle');
      note(494, 0.22, 0.5, 0.09, 'triangle');
    },
    swish(dur) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const len = ctx.sampleRate * (dur || 1.8);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.sin(x * Math.PI) * 0.5;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(500, t);
      f.frequency.linearRampToValueAtTime(1600, t + (dur || 1.8) * 0.5);
      f.frequency.linearRampToValueAtTime(400, t + (dur || 1.8));
      const g = ctx.createGain(); g.gain.value = 0.16;
      src.connect(f).connect(g).connect(master);
      src.start(t);
    },
    shimmer() {
      if (!ctx) return;
      for (let i = 0; i < 4; i++) note(PENTA[i + 1] * 2, i * 0.07, 0.6, 0.045);
    },
    finish() {
      if (!ctx) return;
      [0, 1, 2, 4, 5].forEach((k, i) => note(PENTA[k], i * 0.09, 0.9, 0.16));
      note(PENTA[2] * 2, 0.5, 1.6, 0.10);
      note(98, 0.0, 2.2, 0.14);
      note(147, 0.05, 2.0, 0.07);
    },
  };
})();

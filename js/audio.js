// Soft wind, a slow pad, and a chime whenever a ring appears. Nothing sharp.

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];   // pentatonic-ish, no sour notes

export function createAudio() {
  let ctx = null;
  let master = null;
  let started = false;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    return ctx;
  }

  function start() {
    if (started) return;
    const c = ensure();
    if (!c) return;
    started = true;
    if (c.state === 'suspended') c.resume();

    // wind: filtered noise
    const len = c.sampleRate * 3;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.96 + w * 0.04;
      d[i] = last * 3.2;
    }
    const noise = c.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nf = c.createBiquadFilter();
    nf.type = 'lowpass'; nf.frequency.value = 520; nf.Q.value = 0.6;
    const ng = c.createGain(); ng.gain.value = 0.18;
    noise.connect(nf).connect(ng).connect(master);
    noise.start();

    // a slow LFO on the wind so it breathes
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = c.createGain(); lg.gain.value = 0.09;
    lfo.connect(lg).connect(ng.gain);
    lfo.start();

    // pad: two detuned sines a fifth apart
    [110, 164.8].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.05 - i * 0.015;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp).connect(g).connect(master);
      o.start();
      const trem = c.createOscillator();
      trem.frequency.value = 0.05 + i * 0.03;
      const tg = c.createGain(); tg.gain.value = 0.02;
      trem.connect(tg).connect(g.gain);
      trem.start();
    });

    master.gain.setTargetAtTime(enabled ? 0.5 : 0.0001, c.currentTime, 0.8);
  }

  function chime(step = 0, vol = 0.5) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const semi = SCALE[Math.min(step, SCALE.length - 1)];
    const f = 523.25 * Math.pow(2, semi / 12);
    [1, 2.02].forEach((mult, i) => {
      const o = ctx.createOscillator();
      o.type = i ? 'sine' : 'triangle';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * (i ? 0.10 : 0.22), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 2.3);
    });
  }

  function fanfare() {
    if (!ctx || !enabled) return;
    [0, 2, 4, 5, 7].forEach((s, i) => setTimeout(() => chime(s, 0.55), i * 170));
  }

  function whoosh(amount = 1) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 * amount, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 1.0);
  }

  return {
    start,
    chime,
    fanfare,
    whoosh,
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      if (ctx) master.gain.setTargetAtTime(enabled ? 0.5 : 0.0001, ctx.currentTime, 0.3);
      return enabled;
    },
  };
}

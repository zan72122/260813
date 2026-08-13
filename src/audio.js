// Tiny procedural sound: water droplets, a pentatonic chime when a bloom opens,
// and a breathing pad underneath. Everything is synthesised, nothing to load.
// Starts only on the first touch, per mobile autoplay rules.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastDrop = 0;
    this.ready = false;
  }

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.9;
      master.connect(ctx.destination);
      this.master = master;

      // A short feedback delay stands in for a room; cheaper than a convolver.
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.26;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      delay.connect(fb); fb.connect(lp); lp.connect(delay);
      delay.connect(wet); wet.connect(master);
      this.sendIn = delay;

      // Ambient pad.
      const pad = ctx.createGain();
      pad.gain.value = 0.0;
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 520;
      pad.connect(padFilter); padFilter.connect(master);
      for (const [f, d] of [[110, 0], [164.8, 3], [220, -4], [329.6, 6]]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = d;
        const g = ctx.createGain();
        g.gain.value = 0.16;
        o.connect(g); g.connect(pad);
        o.start();
      }
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency);
      lfo.start();
      this.pad = pad;
      pad.gain.setTargetAtTime(0.09, ctx.currentTime, 3.0);

      this.ready = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** Water drop. strength 0..1 sets pitch and body. */
  drop(strength = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const t = ctx.currentTime;
    if (t - this.lastDrop < 0.055) return;
    this.lastDrop = t;

    const s = Math.min(1, Math.max(0, strength));
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 340 + 620 * (1 - s) + Math.random() * 90;
    o.frequency.setValueAtTime(f0 * 2.1, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.11);
    const g = ctx.createGain();
    const amp = 0.05 + 0.11 * s;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22 + 0.2 * s);
    o.connect(g);
    g.connect(this.master);
    g.connect(this.sendIn);
    o.start(t);
    o.stop(t + 0.5);
  }

  /** Bloom opening: a bell from the pentatonic set so nothing can clash. */
  chime(index = 0, level = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const t = ctx.currentTime;
    const semi = PENTA[index % PENTA.length];
    const base = 261.63 * Math.pow(2, semi / 12);
    [[1, 0.5], [2, 0.22], [3.01, 0.10], [4.02, 0.05]].forEach(([mult, amp], i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * mult;
      const g = ctx.createGain();
      const a = amp * 0.10 * level;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(a, t + 0.012 + i * 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6 + i * 0.2);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.sendIn);
      o.start(t);
      o.stop(t + 2.2);
    });
  }

  /** The finale flower: a slow rising arpeggio. */
  flourish() {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.chime(i + 2, 0.85), i * 190);
    }
  }
}

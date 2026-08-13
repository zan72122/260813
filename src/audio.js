/** Synthesized ambience: hum + electrolysis fizz + splashes + a soft chime.
 *  No assets, resumes on first user gesture (iOS requirement). */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.humGain = null;
    this.fizzGain = null;
  }

  ensure() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const master = this.master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);

      // transformer hum
      const humOsc = ctx.createOscillator();
      humOsc.type = 'sine'; humOsc.frequency.value = 88;
      const humOsc2 = ctx.createOscillator();
      humOsc2.type = 'triangle'; humOsc2.frequency.value = 176;
      const hum2g = ctx.createGain(); hum2g.gain.value = 0.25;
      this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
      humOsc.connect(this.humGain);
      humOsc2.connect(hum2g); hum2g.connect(this.humGain);
      this.humGain.connect(master);
      humOsc.start(); humOsc2.start();

      // fizz: looped noise through a wandering band-pass
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9;
      const lfoG = ctx.createGain(); lfoG.gain.value = 500;
      lfo.connect(lfoG); lfoG.connect(bp.frequency); lfo.start();
      this.fizzGain = ctx.createGain(); this.fizzGain.gain.value = 0;
      noise.connect(bp); bp.connect(this.fizzGain); this.fizzGain.connect(master);
      noise.start();
      this.noiseBuf = buf;
    } catch (e) { /* audio is optional */ }
  }

  setProcess(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.08);
    this.fizzGain.gain.setTargetAtTime(on ? 0.14 : 0, t, 0.12);
  }

  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.8);
  }

  drip() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 700 + Math.random() * 500;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  click() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 240;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.07);
  }

  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = ctx.currentTime + i * 0.16;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 1.0);
    });
  }
}

/**
 * Tiny synthesised sound kit — no audio files to download, no licences, and it
 * survives the iOS autoplay lock because everything is created after the first
 * touch.
 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.loops = new Map();
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(this.ctx.destination);
    this.noise = this._noiseBuffer();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.9 : 0;
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A short pitched blip. */
  tone(freq, dur = 0.12, { type = 'sine', gain = 0.25, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Filtered noise burst — stamping, cutting, crumbs. */
  burst(dur = 0.14, { freq = 1400, q = 1.2, gain = 0.3, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  /** Held sounds (oven hiss, chocolate pour) keyed by name. */
  loopOn(name, { freq = 700, q = 0.8, gain = 0.12, type = 'bandpass' } = {}) {
    if (!this.ctx || this.loops.has(name)) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, this.ctx.currentTime + 0.12);
    s.connect(f).connect(g).connect(this.master);
    s.start();
    this.loops.set(name, { s, g, f });
  }

  loopSet(name, { freq, gain }) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (freq != null) l.f.frequency.setTargetAtTime(freq, t, 0.05);
    if (gain != null) l.g.gain.setTargetAtTime(gain, t, 0.05);
  }

  loopOff(name) {
    const l = this.loops.get(name);
    if (!l || !this.ctx) return;
    this.loops.delete(name);
    const t = this.ctx.currentTime;
    l.g.gain.setTargetAtTime(0.0001, t, 0.08);
    setTimeout(() => {
      try {
        l.s.stop();
      } catch {
        /* already stopped */
      }
    }, 400);
  }

  stopAllLoops() {
    for (const name of [...this.loops.keys()]) this.loopOff(name);
  }

  // ---- named cues -------------------------------------------------------
  click() {
    this.tone(660, 0.07, { type: 'triangle', gain: 0.16 });
  }

  stamp(i = 0) {
    this.burst(0.1, { freq: 900 + (i % 4) * 120, q: 1.4, gain: 0.26 });
    this.tone(240 + (i % 6) * 22, 0.1, { type: 'square', gain: 0.06 });
  }

  chime(i = 0) {
    const scale = [523, 587, 659, 784, 880, 1047, 1175, 1319];
    this.tone(scale[i % scale.length], 0.32, { type: 'sine', gain: 0.2 });
    this.tone(scale[i % scale.length] * 2, 0.2, { type: 'sine', gain: 0.06 });
  }

  cut() {
    this.burst(0.09, { freq: 2600, q: 2.4, gain: 0.24 });
    this.tone(180, 0.08, { type: 'square', gain: 0.05 });
  }

  pop() {
    this.tone(420, 0.16, { type: 'sine', gain: 0.22, slide: 320 });
  }

  snap() {
    this.burst(0.06, { freq: 3200, q: 1.0, gain: 0.5, type: 'highpass' });
    this.burst(0.22, { freq: 700, q: 0.7, gain: 0.3 });
    this.tone(150, 0.18, { type: 'square', gain: 0.12, slide: -80 });
  }

  sparkle() {
    for (let i = 0; i < 6; i++) {
      this.tone(880 + i * 220, 0.22, { type: 'sine', gain: 0.12, delay: i * 0.06 });
    }
  }

  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => this.tone(n, 0.4, { type: 'triangle', gain: 0.2, delay: i * 0.11 }));
  }
}

/**
 * Tiny WebAudio layer. Everything is synthesised — no assets, no loading.
 * Sound is a big part of "わあ！": the ring should sing while it turns.
 */

// A pentatonic set so anything we play together is consonant.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
const BASE = 293.66; // D4

export class Audio {
  constructor(enabled = true) {
    this.ctx = null;
    this.enabled = enabled;
    this.master = null;
    this.pad = null;
    this.lastStep = null;
    this.lastBell = 0;
  }

  /** Must be called from inside a user gesture on iOS. */
  unlock() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (_) {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(ctx.destination);
    this.master.gain.setTargetAtTime(0.85, ctx.currentTime, 1.2);
    this.#buildPad();
    if (ctx.state === 'suspended') ctx.resume();
  }

  #buildPad() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    lp.Q.value = 0.6;
    lp.connect(g);
    g.connect(this.master);

    const freqs = [BASE / 2, (BASE / 2) * 1.5, BASE * 0.752];
    this.padOsc = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = i === 2 ? 0.35 : 0.6;
      o.connect(og);
      og.connect(lp);
      o.start();
      // slow drift so the pad never sounds static
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.06 + i * 0.031;
      const la = ctx.createGain();
      la.gain.value = f * 0.0035;
      lfo.connect(la);
      la.connect(o.frequency);
      lfo.start();
      return o;
    });
    this.pad = g;
  }

  setPad(level) {
    if (!this.pad) return;
    this.pad.gain.setTargetAtTime(0.05 * level, this.ctx.currentTime, 0.4);
  }

  #tone(freq, gain, dur, type = 'sine', when = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  note(step, gain = 0.09, dur = 1.1, when = 0) {
    const s = SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length];
    const oct = Math.floor(step / SCALE.length);
    const f = BASE * Math.pow(2, (s + oct * 12) / 12);
    this.#tone(f, gain, dur, 'sine', when);
    this.#tone(f * 2, gain * 0.28, dur * 0.6, 'sine', when);
  }

  /** Called every frame while the ring turns: sings as it crosses detents. */
  ring(angle, speed) {
    if (!this.ctx) return;
    const step = Math.floor(angle / (Math.PI / 10));
    if (this.lastStep === null) {
      this.lastStep = step;
      return;
    }
    if (step === this.lastStep) return;
    const now = this.ctx.currentTime;
    const dir = step > this.lastStep ? 1 : -1;
    this.lastStep = step;
    if (now - this.lastBell < 0.045) return;
    this.lastBell = now;
    const v = Math.min(Math.abs(speed) / 6, 1);
    const idx = ((step % 7) + 7) % 7 + (dir > 0 ? 0 : 2);
    this.note(idx, 0.018 + 0.055 * v, 0.9 + 0.6 * v);
  }

  press() {
    if (!this.ctx) return;
    this.#tone(196, 0.09, 0.35, 'sine');
    this.#tone(392, 0.05, 0.22, 'triangle');
  }

  celebrate() {
    if (!this.ctx) return;
    [0, 2, 4, 5, 7].forEach((s, i) => this.note(s, 0.075, 1.5, i * 0.085));
  }

  finale() {
    if (!this.ctx) return;
    [0, 2, 4, 5, 7, 9, 10, 11].forEach((s, i) =>
      this.note(s, 0.085, 2.4, i * 0.1),
    );
    this.#tone(BASE / 2, 0.12, 3.2, 'triangle', 0.05);
  }

  chime() {
    if (!this.ctx) return;
    this.note(9, 0.06, 1.8);
    this.note(11, 0.05, 1.8, 0.06);
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) {
      this.master.gain.setTargetAtTime(on ? 0.85 : 0.0, this.ctx.currentTime, 0.12);
    }
  }
}

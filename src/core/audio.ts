/**
 * Tiny WebAudio synth. No asset files, so nothing to download and nothing to
 * mis-load on a phone. iOS only allows audio to start inside a user gesture, so
 * `unlock()` is called from the first tap.
 */

type Ctx = AudioContext;

const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private rollGain: GainNode | null = null;
  private rollSrc: AudioBufferSourceNode | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }

  private get t(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private ok(): boolean {
    return !this.muted && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  private tone(
    freq: number,
    at: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    glideTo?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private noise(at: number, dur: number, gain: number, freq: number, q = 1): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  /** Soft blip for picking something. */
  tap(): void {
    if (!this.ok()) return;
    const t = this.t;
    this.tone(880, t, 0.12, 0.22, 'triangle', 1320);
  }

  /** "ぺたっ" - the press coming down. */
  stamp(step = 0): void {
    if (!this.ok()) return;
    const t = this.t;
    this.noise(t, 0.16, 0.5, 180 + step * 40, 0.8);
    this.tone(120 + step * 18, t, 0.18, 0.4, 'sine', 60);
    this.tone(NOTES[Math.min(step, NOTES.length - 1)], t + 0.05, 0.22, 0.16, 'triangle');
  }

  /** "きらっ" - bell arpeggio when something lovely happens. */
  sparkle(n = 4, base = 3): void {
    if (!this.ok()) return;
    const t = this.t;
    for (let i = 0; i < n; i++) {
      const f = NOTES[Math.min(base + i, NOTES.length - 1)] * 2;
      this.tone(f, t + i * 0.055, 0.4, 0.13, 'sine');
    }
  }

  /** Card finished: a short, bright fanfare. */
  fanfare(): void {
    if (!this.ok()) return;
    const t = this.t;
    [0, 2, 4, 7].forEach((s, i) => {
      const f = 523.25 * Math.pow(2, s / 12);
      this.tone(f, t + i * 0.09, 0.5, 0.2, 'triangle');
      this.tone(f * 2, t + i * 0.09, 0.4, 0.09, 'sine');
    });
    this.noise(t + 0.36, 0.6, 0.18, 5200, 0.6);
  }

  /** Airy chime tied to how far the card is tilted. */
  shimmer(intensity: number): void {
    if (!this.ok()) return;
    const t = this.t;
    const idx = Math.min(NOTES.length - 1, Math.floor(intensity * NOTES.length));
    this.tone(NOTES[idx] * 2, t, 0.35, 0.07, 'sine');
  }

  /** Continuous roller hiss; `speed` is 0..1. */
  roll(speed: number): void {
    if (!this.ok() || !this.ctx || !this.master || !this.noiseBuf) return;
    if (!this.rollSrc) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 900;
      filt.Q.value = 0.7;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(filt).connect(g).connect(this.master);
      src.start();
      this.rollSrc = src;
      this.rollGain = g;
    }
    if (this.rollGain) {
      this.rollGain.gain.setTargetAtTime(Math.min(0.22, speed * 0.22), this.t, 0.05);
    }
  }

  rollStop(): void {
    if (this.rollGain && this.ctx) this.rollGain.gain.setTargetAtTime(0, this.t, 0.08);
  }
}

export const sfx = new Sfx();

import { STYLE } from '../style';

/**
 * The sound vocabulary: 水琴窟 (water-drop koto) + music box.
 * Everything is synthesized — no samples, no network. Sounds confirm cause
 * and effect; they never demand attention (STYLE_LOCK.audio.rule).
 */

// A major pentatonic, low to high.
const SCALE = [220.0, 246.94, 277.18, 329.63, 369.99, 440.0];

export class Chimes {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: GainNode | null = null;
  private step = 0;

  /** Must be called from a user gesture (mobile autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = STYLE.audio.masterGain;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Music-box note: bright attack, long soft decay, tiny octave shimmer. */
  private note(freq: number, gain = 0.22, decay = 1.6, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.now() + delay;
    for (const [mult, g] of [[1, 1], [2, 0.35], [4, 0.12]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain * g, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(env).connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.1);
    }
  }

  /** 水琴窟 drop: a pitched blip falling through a resonant space. */
  private waterDrop(delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.now() + delay;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.12);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.16, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 1);
  }

  /** Soft airy whoosh for falling hair. */
  whoosh(): void {
    if (!this.ctx || !this.master) return;
    const t = this.now();
    const len = 0.7;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 22;
    for (let i = 0; i < data.length; i++) {
      s = (s * 16807) % 2147483647;
      data[i] = (s / 2147483647) * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(280, t + len);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.10, t + 0.08);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    this.waterDrop(len * 0.75);
  }

  /** Rising pentatonic step — one per weave crossing. */
  cross(): void {
    this.note(SCALE[this.step % SCALE.length], 0.20, 1.4);
    this.step++;
  }

  pick(): void {
    this.note(SCALE[4] * 2, 0.10, 0.9);
  }

  petal(width: number): void {
    this.note(SCALE[Math.min(Math.floor(width * SCALE.length), SCALE.length - 1)], 0.08, 0.8);
  }

  coilTick(progress: number): void {
    const i = Math.min(Math.floor(progress * SCALE.length), SCALE.length - 1);
    this.note(SCALE[i] * 2, 0.05, 0.5);
  }

  gemSnap(): void {
    this.note(SCALE[5] * 2, 0.18, 2.2);
    this.note(SCALE[2] * 2, 0.10, 2.2, 0.06);
    this.waterDrop(0.15);
  }

  reveal(): void {
    // A quiet arpeggio bloom, then stillness.
    [0, 2, 4, 5].forEach((deg, i) => this.note(SCALE[deg], 0.10, 2.8, i * 0.28));
  }

  /** Barely-there pad + occasional far water drips. */
  private startAmbient(): void {
    if (!this.ctx || !this.master) return;
    this.ambient = this.ctx.createGain();
    this.ambient.gain.value = STYLE.audio.ambientGain;
    this.ambient.connect(this.master);
    for (const [f, det] of [[110, 0], [110, 2.3], [164.8, -1.5]] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = det;
      const g = this.ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g).connect(this.ambient);
      osc.start();
    }
    const drip = () => {
      if (!this.ctx) return;
      this.waterDrop();
      setTimeout(drip, 7000 + ((this.step * 2653) % 6000));
    };
    setTimeout(drip, 5000);
  }
}

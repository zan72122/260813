import { loadMuted, saveMuted } from '../game/persistence.ts';
import type { ToyMaterial } from '../game/types.ts';

/**
 * All sound is synthesized at runtime via Web Audio — no audio assets.
 * The AudioContext is created lazily and resumed on the first pointerdown
 * (iOS Safari requirement). Mute persists to localStorage and fully mutes
 * via the master gain node (context keeps running so ambience state stays
 * in sync even while muted).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted: boolean;
  private ambienceNodes: { stop: () => void } | null = null;
  private ambienceKind: 'lunch' | 'nap' | 'birds' | null = null;
  private birdTimer: number | null = null;

  constructor() {
    this.muted = loadMuted();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Must be called from within a user gesture handler (pointerdown). Safe to call repeatedly. */
  resume(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private envGain(peak: number, attack: number, decay: number, startAt?: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const t0 = startAt ?? this.now();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    return g;
  }

  private noiseBuffer(duration: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ---- One-shot SFX ----

  playToySound(material: ToyMaterial): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    if (material === 'wood') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, t0);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + 0.09);
      const g = this.envGain(0.35, 0.005, 0.12, t0);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    } else if (material === 'fabric') {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer(0.18);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.6;
      const g = this.envGain(0.18, 0.01, 0.16, t0);
      src.connect(filter).connect(g).connect(this.master);
      src.start(t0);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, t0);
      osc.frequency.exponentialRampToValueAtTime(1100, t0 + 0.05);
      osc.frequency.exponentialRampToValueAtTime(500, t0 + 0.12);
      const g = this.envGain(0.28, 0.004, 0.14, t0);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  }

  playBasketGulp(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, t0);
    osc.frequency.exponentialRampToValueAtTime(140, t0 + 0.2);
    const g = this.envGain(0.4, 0.01, 0.22, t0);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  }

  playRejectPop(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t0);
    osc.frequency.exponentialRampToValueAtTime(400, t0 + 0.08);
    osc.frequency.exponentialRampToValueAtTime(260, t0 + 0.18);
    const g = this.envGain(0.2, 0.01, 0.2, t0);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  }

  playChairTick(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const g = this.envGain(0.3, 0.002, 0.05, t0);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  playWipeSqueak(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = 1400 + Math.random() * 400;
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.exponentialRampToValueAtTime(base * 1.3, t0 + 0.06);
    const g = this.envGain(0.06, 0.005, 0.07, t0);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  playCurtainSlide(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.6);
    src.loop = false;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.5;
    const g = this.envGain(0.09, 0.08, 0.5, t0);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  playChime(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t0);
    const g = this.envGain(0.14, 0.01, 0.5, t0);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.6);
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, t0 + 0.06);
    const g2 = this.envGain(0.08, 0.01, 0.4, t0 + 0.06);
    osc2.connect(g2).connect(this.master);
    osc2.start(t0 + 0.06);
    osc2.stop(t0 + 0.5);
  }

  /** Continuous mat-unroll whoosh, volume/pitch tied to live swipe progress delta (call each frame while dragging). */
  playMatWhooshTick(speed: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = this.now();
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700 + Math.min(speed, 1) * 900;
    const g = this.envGain(Math.min(0.12, 0.03 + speed * 0.1), 0.01, 0.08, t0);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  // ---- Ambiences (looping, one active at a time) ----

  stopAmbience(): void {
    this.ambienceNodes?.stop();
    this.ambienceNodes = null;
    this.ambienceKind = null;
    if (this.birdTimer !== null) {
      window.clearInterval(this.birdTimer);
      this.birdTimer = null;
    }
  }

  startLunchMurmur(): void {
    if (!this.ctx || !this.master) return;
    if (this.ambienceKind === 'lunch') return;
    this.stopAmbience();
    const ctx = this.ctx;
    const master = this.master;
    const busGain = ctx.createGain();
    busGain.gain.value = 0.05;
    busGain.connect(master);
    const src = ctx.createBufferSource();
    const buf = this.noiseBuffer(2);
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    src.connect(filter).connect(busGain);
    src.start();
    this.ambienceKind = 'lunch';
    this.ambienceNodes = {
      stop: () => {
        src.stop();
        lfo.stop();
        busGain.disconnect();
      },
    };
  }

  startNapAmbience(): void {
    if (!this.ctx || !this.master) return;
    if (this.ambienceKind === 'nap') return;
    this.stopAmbience();
    const ctx = this.ctx;
    const master = this.master;
    const busGain = ctx.createGain();
    busGain.gain.value = 0.06;
    busGain.connect(master);

    const pad = ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.value = 110;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.4;
    pad.connect(padGain).connect(busGain);
    pad.start();

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.5;
    src.connect(filter).connect(noiseGain).connect(busGain);
    src.start();

    this.ambienceKind = 'nap';
    this.ambienceNodes = {
      stop: () => {
        pad.stop();
        src.stop();
        busGain.disconnect();
      },
    };
  }

  startMorningBirds(): void {
    if (!this.ctx || !this.master) return;
    if (this.ambienceKind === 'birds') return;
    this.stopAmbience();
    this.ambienceKind = 'birds';
    const chirp = (): void => {
      if (!this.ctx || !this.master || this.ambienceKind !== 'birds') return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const base = 1800 + Math.random() * 800;
      osc.frequency.setValueAtTime(base, t0);
      osc.frequency.exponentialRampToValueAtTime(base * 1.4, t0 + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.11);
      const g = this.envGain(0.05, 0.005, 0.15, t0);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    };
    chirp();
    this.birdTimer = window.setInterval(chirp, 1800 + Math.random() * 1400);
    this.ambienceNodes = { stop: () => {} };
  }
}

import type { AudioCue, AudioEngine } from '../core';

/**
 * Owner B (rendering-audio) real implementation. 100% procedural WebAudio
 * synthesis — no external audio files (see ASSET_MANIFEST.md). The
 * AudioContext is created lazily on the first unlock() call (a user
 * gesture), so no autoplay warning fires before then. All gain/pitch
 * changes ramp smoothly (AudioParam.setTargetAtTime) to avoid clicks, and
 * the whole mix stays gentle/child-friendly (soft envelopes, no harsh
 * transients, modest peak levels).
 *
 * (Wave 3 integration renamed this class from its placeholder-era name
 * `NullAudioEngine` to `WebAudioEngine`, now that App.ts wires it in as the
 * real implementation; no behavior changed.)
 */

const MASTER_GAIN = 0.8;
const MUTE_RAMP_S = 0.08;
const CONTINUOUS_RAMP_S = 0.12;

/** Cues driven by setContinuous(); everything else in AudioCue is a discrete one-shot. */
const CONTINUOUS_CUES = new Set<AudioCue>(['ropeCreak', 'pulleySpin', 'woodClatter', 'flatSlide', 'ambienceRoom', 'ambienceUnder']);

function isContinuousCue(cue: AudioCue): boolean {
  return CONTINUOUS_CUES.has(cue);
}

interface ContinuousVoice {
  setVelocity(velocity: number, now: number): void;
  stop(): void;
}

/** Builds a short loud-free noise AudioBuffer (with edge fades so .loop = true has no click seam). */
function buildNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = Math.min(length >> 2, Math.floor(ctx.sampleRate * 0.02));
  for (let i = 0; i < length; i++) {
    let sample = Math.random() * 2 - 1;
    if (i < fade) sample *= i / fade;
    else if (i > length - fade) sample *= (length - i) / fade;
    data[i] = sample;
  }
  return buffer;
}

function rampTo(param: AudioParam, target: number, now: number, timeConstant = CONTINUOUS_RAMP_S): void {
  param.cancelScheduledValues(now);
  param.setTargetAtTime(target, now, timeConstant);
}

export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private unlocked = false;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly voices = new Map<AudioCue, ContinuousVoice>();
  private readonly cleanupTimers = new Set<ReturnType<typeof setTimeout>>();

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    this.unlocked = true;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // Some browsers reject resume() outside a trusted gesture; the next
        // real gesture that calls unlock() again will succeed.
      }
    }
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  getDebugState(): { contextState: 'uninitialized' | AudioContextState; unlocked: boolean } {
    return { contextState: this.ctx ? this.ctx.state : 'uninitialized', unlocked: this.unlocked };
  }

  play(cue: AudioCue): void {
    const ctx = this.ensureContext();
    const master = this.master;
    if (!master) return;
    const now = ctx.currentTime;
    switch (cue) {
      case 'knock3':
        this.playKnock3(ctx, master, now);
        break;
      case 'lockClick':
        this.playClick(ctx, master, now);
        break;
      case 'settleThud':
        this.playThud(ctx, master, now);
        break;
      case 'releaseSoft':
        this.playReleaseSoft(ctx, master, now);
        break;
      case 'birds':
        this.playBirds(ctx, master, now);
        break;
      case 'wind':
        this.playWindGust(ctx, master, now);
        break;
      case 'applause':
        this.playApplause(ctx, master, now);
        break;
      case 'footlightsOn':
        this.playFootlightsSwell(ctx, master, now);
        break;
      default:
        // Continuous-natured cues also accept a play() "turn on at a gentle
        // default level" per docs/CONTRACTS_ADDENDUM.md loopable-bed wording.
        if (isContinuousCue(cue)) this.setContinuous(cue, 0.4);
        break;
    }
  }

  setContinuous(cue: AudioCue, velocity: number): void {
    if (!isContinuousCue(cue)) return;
    const ctx = this.ensureContext();
    const master = this.master;
    if (!master) return;
    const v = Math.max(0, Math.min(1, velocity));
    let voice = this.voices.get(cue);
    if (!voice) {
      voice = this.createContinuousVoice(cue, ctx, master);
      this.voices.set(cue, voice);
    }
    voice.setVelocity(v, ctx.currentTime);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      rampTo(this.master.gain, muted ? 0 : MASTER_GAIN, this.ctx.currentTime, MUTE_RAMP_S);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    for (const voice of this.voices.values()) voice.stop();
    this.voices.clear();
    for (const t of this.cleanupTimers) clearTimeout(t);
    this.cleanupTimers.clear();
    if (this.ctx) {
      this.master?.disconnect();
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  // ---- setup -------------------------------------------------------------

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : MASTER_GAIN;
    master.connect(ctx.destination);
    this.master = master;
    this.noiseBuffer = buildNoiseBuffer(ctx, 2);
    return ctx;
  }

  private noise(): AudioBuffer {
    if (!this.noiseBuffer) throw new Error('AudioEngine noise buffer requested before context init');
    return this.noiseBuffer;
  }

  private trackedTimeout(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.cleanupTimers.delete(id);
      fn();
    }, ms);
    this.cleanupTimers.add(id);
  }

  private stopSourceSoon(node: AudioScheduledSourceNode, whenSeconds: number): void {
    try {
      node.stop(whenSeconds);
    } catch {
      // already stopped
    }
    this.trackedTimeout(() => node.disconnect(), Math.max(0, whenSeconds - (this.ctx?.currentTime ?? 0)) * 1000 + 60);
  }

  // ---- one-shot cues -------------------------------------------------------

  /** Three short wooden knocks (les trois coups, D1 in docs/HISTORICAL_TRUTH.md — dramatized, not historical fact). */
  private playKnock3(ctx: AudioContext, master: GainNode, now: number): void {
    for (let i = 0; i < 3; i++) this.playSingleKnock(ctx, master, now + i * 0.22);
  }

  private playSingleKnock(ctx: AudioContext, master: GainNode, at: number): void {
    // wooden body: fast-decaying low tone
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, at);
    osc.frequency.exponentialRampToValueAtTime(120, at + 0.05);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, at);
    oscGain.gain.exponentialRampToValueAtTime(0.5, at + 0.006);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(oscGain).connect(master);
    osc.start(at);
    this.stopSourceSoon(osc, at + 0.12);

    // attack click: brief filtered noise
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noise();
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 900;
    bandpass.Q.value = 1.2;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, at);
    noiseGain.gain.exponentialRampToValueAtTime(0.35, at + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    noiseSrc.connect(bandpass).connect(noiseGain).connect(master);
    noiseSrc.start(at);
    this.stopSourceSoon(noiseSrc, at + 0.05);
  }

  /** Small metallic "カチン" lock release click. */
  private playClick(ctx: AudioContext, master: GainNode, now: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain).connect(master);
    osc.start(now);
    this.stopSourceSoon(osc, now + 0.08);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.2, now + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    noiseSrc.connect(hp).connect(ng).connect(master);
    noiseSrc.start(now);
    this.stopSourceSoon(noiseSrc, now + 0.04);
  }

  /** Soft low "コトン" settle thud when progress snaps to 0/1. */
  private playThud(ctx: AudioContext, master: GainNode, now: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.42, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(master);
    osc.start(now);
    this.stopSourceSoon(osc, now + 0.3);

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    noiseSrc.connect(lp).connect(ng).connect(master);
    noiseSrc.start(now);
    this.stopSourceSoon(noiseSrc, now + 0.15);
  }

  /** Gentle release "puff" when progress snaps back to 0 / lock is let go. */
  private playReleaseSoft(ctx: AudioContext, master: GainNode, now: number): void {
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.noise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, now);
    lp.frequency.exponentialRampToValueAtTime(300, now + 0.25);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    noiseSrc.connect(lp).connect(gain).connect(master);
    noiseSrc.start(now);
    this.stopSourceSoon(noiseSrc, now + 0.32);
  }

  /** 2-3 tiny bird chirps (glissando sine). */
  private playBirds(ctx: AudioContext, master: GainNode, now: number): void {
    const chirps = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < chirps; i++) {
      const at = now + i * (0.16 + Math.random() * 0.18);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const base = 2200 + Math.random() * 900;
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.exponentialRampToValueAtTime(base * 1.4, at + 0.06);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, at + 0.16);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = base;
      bp.Q.value = 4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.connect(bp).connect(gain).connect(master);
      osc.start(at);
      this.stopSourceSoon(osc, at + 0.2);
    }
  }

  /** One soft wind gust: lowpass-filtered noise swell with a slow cutoff sweep. */
  private playWindGust(ctx: AudioContext, master: GainNode, now: number): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, now);
    lp.frequency.linearRampToValueAtTime(900, now + 0.8);
    lp.frequency.linearRampToValueAtTime(250, now + 1.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.6);
    gain.gain.linearRampToValueAtTime(0.0001, now + 2);
    src.connect(lp).connect(gain).connect(master);
    src.start(now);
    this.stopSourceSoon(src, now + 2.05);
  }

  /** Filtered noise-burst applause: many tiny randomized clap clicks under a rise/fall envelope. */
  private playApplause(ctx: AudioContext, master: GainNode, now: number): void {
    const duration = 1.8;
    const claps = 70;
    for (let i = 0; i < claps; i++) {
      const t = Math.random() * duration;
      const envelope = Math.sin((Math.min(t, duration) / duration) * Math.PI); // rise then fall
      const at = now + t;
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 1800;
      bp.Q.value = 0.8;
      const gain = ctx.createGain();
      const peak = (0.05 + Math.random() * 0.05) * (0.4 + envelope * 0.6);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
      src.connect(bp).connect(gain).connect(master);
      src.start(at);
      this.stopSourceSoon(src, at + 0.05);
    }
  }

  /** Warm swelling pad chord for footlights turning on. */
  private playFootlightsSwell(ctx: AudioContext, master: GainNode, now: number): void {
    const freqs = [261.6, 329.6, 392.0]; // gentle major triad, warm/child-friendly
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.connect(master);
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 3.2;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 1.5;
      vibrato.connect(vibratoGain).connect(osc.frequency);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.5);
      gain.gain.linearRampToValueAtTime(0.0001, now + 1.6);
      osc.connect(gain).connect(lp);
      osc.start(now);
      vibrato.start(now);
      this.stopSourceSoon(osc, now + 1.7);
      this.stopSourceSoon(vibrato, now + 1.7);
    }
  }

  // ---- continuous cues -------------------------------------------------------

  private createContinuousVoice(cue: AudioCue, ctx: AudioContext, master: GainNode): ContinuousVoice {
    switch (cue) {
      case 'ropeCreak':
        return this.buildRopeCreak(ctx, master);
      case 'pulleySpin':
        return this.buildPulleySpin(ctx, master);
      case 'woodClatter':
        return this.buildWoodClatter(ctx, master);
      case 'flatSlide':
        return this.buildFlatSlide(ctx, master);
      case 'ambienceRoom':
        return this.buildAmbience(ctx, master, 1200, 0.045);
      case 'ambienceUnder':
        return this.buildAmbience(ctx, master, 480, 0.05);
      default:
        return { setVelocity: () => {}, stop: () => {} };
    }
  }

  /** Friction creak of the rope over the pulley: bandpass noise, pitch/tremolo rise with speed. */
  private buildRopeCreak(ctx: AudioContext, master: GainNode): ContinuousVoice {
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 5;
    bp.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 4;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(gain.gain);
    src.connect(bp).connect(gain).connect(master);
    src.start();
    lfo.start();
    return {
      setVelocity: (v, now) => {
        rampTo(gain.gain, v * 0.11, now);
        rampTo(bp.frequency, 450 + v * 650, now);
        rampTo(lfo.frequency, 3 + v * 9, now);
        rampTo(lfoDepth.gain, v * 0.03, now);
      },
      stop: () => {
        src.stop();
        lfo.stop();
        src.disconnect();
        bp.disconnect();
        gain.disconnect();
        lfo.disconnect();
        lfoDepth.disconnect();
      }
    };
  }

  /** Wooden pulley/drum squeak: tonal oscillator, pitch rises with rotation speed. */
  private buildPulleySpin(ctx: AudioContext, master: GainNode): ContinuousVoice {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 220;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 3;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(gain.gain);
    osc.connect(bp).connect(gain).connect(master);
    osc.start();
    lfo.start();
    return {
      setVelocity: (v, now) => {
        rampTo(gain.gain, v * 0.06, now);
        rampTo(osc.frequency, 200 + v * 320, now);
        rampTo(bp.frequency, 350 + v * 400, now);
        rampTo(lfo.frequency, 3 + v * 14, now);
        rampTo(lfoDepth.gain, v * 0.02, now);
      },
      stop: () => {
        osc.stop();
        lfo.stop();
        osc.disconnect();
        bp.disconnect();
        gain.disconnect();
        lfo.disconnect();
        lfoDepth.disconnect();
      }
    };
  }

  /** Chariot/wood-on-wood clatter: highpass noise gated by a speed-scaled rhythmic LFO. */
  private buildWoodClatter(ctx: AudioContext, master: GainNode): ContinuousVoice {
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 6;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0;
    lfo.connect(lfoDepth).connect(gain.gain);
    src.connect(hp).connect(gain).connect(master);
    src.start();
    lfo.start();
    return {
      setVelocity: (v, now) => {
        const base = v * 0.05;
        rampTo(gain.gain, base, now);
        rampTo(lfo.frequency, 4 + v * 16, now);
        rampTo(lfoDepth.gain, base, now);
      },
      stop: () => {
        src.stop();
        lfo.stop();
        src.disconnect();
        hp.disconnect();
        gain.disconnect();
        lfo.disconnect();
        lfoDepth.disconnect();
      }
    };
  }

  /** Flat/backdrop sliding along the floor grooves: broad lowpass noise, steady with speed. */
  private buildFlatSlide(ctx: AudioContext, master: GainNode): ContinuousVoice {
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(master);
    src.start();
    return {
      setVelocity: (v, now) => {
        rampTo(gain.gain, v * 0.09, now);
        rampTo(lp.frequency, 350 + v * 900, now);
      },
      stop: () => {
        src.stop();
        src.disconnect();
        lp.disconnect();
        gain.disconnect();
      }
    };
  }

  /** Quiet ambience bed (room / understage): soft lowpass noise + a barely-there sustained pad. */
  private buildAmbience(ctx: AudioContext, master: GainNode, cutoff: number, peakGain: number): ContinuousVoice {
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    src.connect(lp).connect(noiseGain).connect(master);
    src.start();

    const pad = ctx.createOscillator();
    pad.type = 'sine';
    pad.frequency.value = cutoff < 800 ? 55 : 110;
    const padGain = ctx.createGain();
    padGain.gain.value = 0;
    pad.connect(padGain).connect(master);
    pad.start();

    return {
      setVelocity: (v, now) => {
        rampTo(noiseGain.gain, v * peakGain, now, 0.6);
        rampTo(padGain.gain, v * peakGain * 0.25, now, 0.6);
      },
      stop: () => {
        src.stop();
        pad.stop();
        src.disconnect();
        lp.disconnect();
        noiseGain.disconnect();
        pad.disconnect();
        padGain.disconnect();
      }
    };
  }
}

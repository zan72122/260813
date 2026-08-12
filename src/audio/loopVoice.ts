// src/audio/loopVoice.ts
// Generic "continuous, intensity-driven" cue voice: a seamlessly-looping
// procedural noise buffer feeding a caller-supplied filter chain, with a
// smoothed output gain proportional to setIntensity(v). Used for every
// loopable cue (pipe-rush, the three fountain splashes, valve-creak,
// ambient-morning bed) so their start/stop/ramp behaviour is consistent and
// click-free.

import { clamp01, createNoiseBuffer, rampGain } from './dsp';

export interface NoiseLoopChain {
  /** First node in the caller's filter chain — the noise source connects here. */
  input: AudioNode;
  /** Last node in the caller's filter chain — connected onward to the voice's gain stage. */
  output: AudioNode;
  /** Optional per-intensity hook (e.g. modulate filter cutoff / LFO rate). */
  onIntensity?: (v: number, ctx: BaseAudioContext) => void;
}

export interface NoiseLoopVoiceOptions {
  ctx: AudioContext;
  destination: AudioNode;
  /** Loop buffer length in seconds; longer reduces perceptible periodicity. */
  seconds?: number;
  seed?: number;
  /** Output gain when intensity === 1. */
  peakGain: number;
  buildChain(ctx: AudioContext, noiseSource: AudioBufferSourceNode): NoiseLoopChain;
}

/**
 * A perpetually-running (once started) noise-based loop whose audible level
 * tracks `setIntensity`. The underlying source never stops once started —
 * silence is achieved via gain, which keeps restarts click-free and cheap.
 */
export class NoiseLoopVoice {
  private started = false;
  private readonly gainNode: GainNode;
  private onIntensityCb?: (v: number, ctx: BaseAudioContext) => void;
  private lastIntensity = 0;

  constructor(private readonly opts: NoiseLoopVoiceOptions) {
    this.gainNode = opts.ctx.createGain();
    this.gainNode.gain.value = 0;
    this.gainNode.connect(opts.destination);
  }

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    const { ctx } = this.opts;
    const buffer = createNoiseBuffer(ctx, this.opts.seconds ?? 2.2, this.opts.seed ?? 1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const chain = this.opts.buildChain(ctx, source);
    source.connect(chain.input);
    chain.output.connect(this.gainNode);
    this.onIntensityCb = chain.onIntensity;
    source.start();
    // Apply whatever intensity was set (or defaulted) before start.
    this.onIntensityCb?.(this.lastIntensity, ctx);
  }

  /** Ensures the loop is running; does not by itself change audible level. */
  start(): void {
    this.ensureStarted();
  }

  setIntensity(v: number): void {
    this.ensureStarted();
    const value = clamp01(v);
    this.lastIntensity = value;
    rampGain(this.gainNode.gain, value * this.opts.peakGain, this.opts.ctx, 0.09);
    this.onIntensityCb?.(value, this.opts.ctx);
  }
}

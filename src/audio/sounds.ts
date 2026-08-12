/**
 * Sound "recipes" — each function wires a small synth graph for one
 * `SoundCueId` into `destination` (the engine's master gain) and returns
 * either nothing (one-shots clean themselves up on `onended`) or, for the
 * three true loops, a `stop()` closure. All gains are intentionally modest
 * and warm (PRODUCT_SPEC "4歳児UX": nothing harsh/loud/sudden).
 */

import { createBrownNoiseBuffer, createWhiteNoiseBuffer } from './noise.ts';
import type {
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
} from './webAudioTypes.ts';

type FilterType = BiquadFilterNodeLike['type'];

function scheduleEnvelope(
  param: AudioParamLike,
  startTime: number,
  attackS: number,
  holdS: number,
  releaseS: number,
  peak: number,
): number {
  param.cancelScheduledValues(startTime);
  param.setValueAtTime(0, startTime);
  param.linearRampToValueAtTime(peak, startTime + attackS);
  param.setValueAtTime(peak, startTime + attackS + holdS);
  param.linearRampToValueAtTime(0.0001, startTime + attackS + holdS + releaseS);
  return startTime + attackS + holdS + releaseS;
}

interface ToneOptions {
  readonly freq: number;
  readonly freqEnd?: number;
  readonly type: OscillatorType;
  readonly attack: number;
  readonly hold: number;
  readonly release: number;
  readonly peak: number;
  readonly delay?: number;
}

/** A single enveloped oscillator note — the building block for clicks, the
 * chime melody, and the sparkle glissando. */
function playTone(ctx: AudioContextLike, destination: AudioNodeLike, opts: ToneOptions): void {
  const osc = ctx.createOscillator();
  osc.type = opts.type;
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(destination);

  const start = ctx.currentTime + (opts.delay ?? 0);
  osc.frequency.setValueAtTime(opts.freq, start);
  if (opts.freqEnd !== undefined) {
    osc.frequency.linearRampToValueAtTime(opts.freqEnd, start + opts.attack + opts.hold + opts.release);
  }
  const endTime = scheduleEnvelope(gain.gain, start, opts.attack, opts.hold, opts.release, opts.peak);
  osc.start(start);
  osc.stop(endTime + 0.05);
  osc.onended = (): void => {
    osc.disconnect();
    gain.disconnect();
  };
}

interface NoiseBurstOptions {
  readonly seconds: number;
  readonly filterType: FilterType;
  readonly freqStart: number;
  readonly freqEnd?: number;
  readonly q?: number;
  readonly attack: number;
  readonly release: number;
  readonly peak: number;
  readonly delay?: number;
}

/** A short filtered noise burst — clunks, the door slide, ui-tap, whooshes. */
function playNoiseBurst(ctx: AudioContextLike, destination: AudioNodeLike, opts: NoiseBurstOptions): void {
  const source = ctx.createBufferSource();
  source.buffer = createWhiteNoiseBuffer(ctx, opts.seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType;
  filter.Q.value = opts.q ?? 0.9;
  const gain = ctx.createGain();
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  const start = ctx.currentTime + (opts.delay ?? 0);
  filter.frequency.setValueAtTime(opts.freqStart, start);
  if (opts.freqEnd !== undefined) {
    filter.frequency.linearRampToValueAtTime(opts.freqEnd, start + opts.seconds);
  }
  const hold = Math.max(0, opts.seconds - opts.attack - opts.release);
  const endTime = scheduleEnvelope(gain.gain, start, opts.attack, hold, opts.release, opts.peak);
  source.start(start);
  source.stop(endTime + 0.05);
  source.onended = (): void => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

interface LoopOptions {
  readonly bufferSeconds: number;
  readonly brown: boolean;
  readonly filterType: FilterType;
  readonly freq: number;
  readonly q?: number;
  readonly fadeInS: number;
  readonly fadeOutS: number;
  readonly peak: number;
}

/** A filtered-noise bed that loops until `stop()` is called (used for the
 * three true loop cues). Fade in on start, fade out + disconnect on stop. */
function startFilteredNoiseLoop(
  ctx: AudioContextLike,
  destination: AudioNodeLike,
  opts: LoopOptions,
): () => void {
  const source = ctx.createBufferSource();
  source.buffer = opts.brown
    ? createBrownNoiseBuffer(ctx, opts.bufferSeconds)
    : createWhiteNoiseBuffer(ctx, opts.bufferSeconds);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filterType;
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 0.7;
  const gain = ctx.createGain();
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(opts.peak, now + opts.fadeInS);
  source.start(now);

  return (): void => {
    const stopAt = ctx.currentTime;
    gain.gain.cancelScheduledValues(stopAt);
    gain.gain.setValueAtTime(gain.gain.value, stopAt);
    gain.gain.linearRampToValueAtTime(0.0001, stopAt + opts.fadeOutS);
    source.stop(stopAt + opts.fadeOutS + 0.05);
    source.onended = (): void => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  };
}

// ---------------------------------------------------------------------------
// Loops
// ---------------------------------------------------------------------------

/** Filtered brown noise loop — the underground pistons' hydraulic hum. */
export function startHydraulicHum(ctx: AudioContextLike, dest: AudioNodeLike): () => void {
  return startFilteredNoiseLoop(ctx, dest, {
    bufferSeconds: 2,
    brown: true,
    filterType: 'lowpass',
    freq: 340,
    fadeInS: 0.5,
    fadeOutS: 0.45,
    peak: 0.16,
  });
}

/** Light metallic shimmer loop — the moving cable. */
export function startCableRun(ctx: AudioContextLike, dest: AudioNodeLike): () => void {
  return startFilteredNoiseLoop(ctx, dest, {
    bufferSeconds: 1.5,
    brown: false,
    filterType: 'bandpass',
    freq: 2600,
    q: 3.2,
    fadeInS: 0.35,
    fadeOutS: 0.3,
    peak: 0.05,
  });
}

/** Low rumble loop — the carrier riding the rails. */
export function startCarrierRide(ctx: AudioContextLike, dest: AudioNodeLike): () => void {
  return startFilteredNoiseLoop(ctx, dest, {
    bufferSeconds: 2.5,
    brown: true,
    filterType: 'lowpass',
    freq: 140,
    fadeInS: 0.6,
    fadeOutS: 0.6,
    peak: 0.14,
  });
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------

export function playValveOpen(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playNoiseBurst(ctx, dest, {
    seconds: 0.45,
    filterType: 'bandpass',
    freqStart: 260,
    freqEnd: 900,
    attack: 0.04,
    release: 0.3,
    peak: 0.16,
  });
}

export function playValveClose(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playNoiseBurst(ctx, dest, {
    seconds: 0.4,
    filterType: 'bandpass',
    freqStart: 900,
    freqEnd: 220,
    attack: 0.02,
    release: 0.2,
    peak: 0.15,
  });
  playTone(ctx, dest, {
    freq: 140,
    type: 'triangle',
    attack: 0.005,
    hold: 0.02,
    release: 0.16,
    peak: 0.14,
    delay: 0.18,
  });
}

export function playPistonSwell(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playTone(ctx, dest, {
    freq: 90,
    type: 'triangle',
    attack: 0.6,
    hold: 0.4,
    release: 0.9,
    peak: 0.12,
  });
}

export function playPulleyClick(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playNoiseBurst(ctx, dest, {
    seconds: 0.09,
    filterType: 'bandpass',
    freqStart: 700,
    q: 4,
    attack: 0.003,
    release: 0.07,
    peak: 0.12,
  });
}

export function playBrakeLock(ctx: AudioContextLike, dest: AudioNodeLike): void {
  for (const delay of [0, 0.14]) {
    playTone(ctx, dest, {
      freq: 110,
      type: 'square',
      attack: 0.002,
      hold: 0.02,
      release: 0.12,
      peak: 0.16,
      delay,
    });
    playNoiseBurst(ctx, dest, {
      seconds: 0.1,
      filterType: 'lowpass',
      freqStart: 500,
      attack: 0.001,
      release: 0.08,
      peak: 0.1,
      delay,
    });
  }
}

export function playDoorOpen(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playNoiseBurst(ctx, dest, {
    seconds: 0.5,
    filterType: 'bandpass',
    freqStart: 500,
    freqEnd: 1600,
    q: 1.4,
    attack: 0.08,
    release: 0.3,
    peak: 0.1,
  });
  const notes = [880, 1174.66];
  notes.forEach((freq, i) => {
    playTone(ctx, dest, {
      freq,
      type: 'sine',
      attack: 0.02,
      hold: 0.08,
      release: 0.3,
      peak: 0.1,
      delay: 0.35 + i * 0.12,
    });
  });
}

/** Gentle pentatonic arrival melody (C major pentatonic, ascending). */
export function playChime(ctx: AudioContextLike, dest: AudioNodeLike): void {
  const melody = [523.25, 659.25, 783.99, 880.0];
  melody.forEach((freq, i) => {
    playTone(ctx, dest, {
      freq,
      type: 'sine',
      attack: 0.03,
      hold: 0.12,
      release: 0.45,
      peak: 0.13,
      delay: i * 0.16,
    });
  });
}

export function playSparkle(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playTone(ctx, dest, {
    freq: 700,
    freqEnd: 2000,
    type: 'sine',
    attack: 0.03,
    hold: 0.05,
    release: 0.25,
    peak: 0.1,
  });
  playTone(ctx, dest, {
    freq: 1400,
    freqEnd: 3200,
    type: 'triangle',
    attack: 0.05,
    hold: 0.03,
    release: 0.2,
    peak: 0.055,
    delay: 0.04,
  });
}

export function playUiTap(ctx: AudioContextLike, dest: AudioNodeLike): void {
  playNoiseBurst(ctx, dest, {
    seconds: 0.05,
    filterType: 'lowpass',
    freqStart: 420,
    attack: 0.002,
    release: 0.04,
    peak: 0.07,
  });
}

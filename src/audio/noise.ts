/**
 * Procedural noise buffers for the synthesized machine-room ambience —
 * 100% generated, no sample assets (ARCHITECTURE_CONTRACT: "all audio
 * synthesized via WebAudio").
 */

import type { AudioBufferLike, AudioContextLike } from './webAudioTypes.ts';

/** A soft, low-passed "brown" noise buffer (integrated white noise), looped
 * for the hydraulic hum / carrier rumble beds. */
export function createBrownNoiseBuffer(context: AudioContextLike, seconds: number): AudioBufferLike {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = Math.max(-1, Math.min(1, last * 3.5));
  }
  return buffer;
}

/** Plain white noise, used for short percussive bursts (clunks, taps, the
 * door slide) that get shaped by a filter + envelope per-cue. */
export function createWhiteNoiseBuffer(context: AudioContextLike, seconds: number): AudioBufferLike {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Deterministic procedural noise-buffer generation. All noise in this game
 * is synthesized from a seeded PRNG (contracts/rng.ts `mulberry32`) rather
 * than sampled from an audio file — per ARCHITECTURE_CONTRACT.md, no audio
 * assets are used anywhere.
 */
import { mulberry32 } from '../contracts/rng';
import type { MinimalAudioContext } from './context';

export type NoiseColor = 'white' | 'pink' | 'brown';

/**
 * Builds a mono noise AudioBuffer of `seconds` length, colored via a simple
 * running-filter approximation (good enough for a filtered ambience/grain
 * bed — no need for exact spectral matching here).
 */
export function createNoiseBuffer(
  ctx: MinimalAudioContext,
  seconds: number,
  color: NoiseColor,
  seed: number,
): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);

  if (color === 'white') {
    for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
    return buffer;
  }

  if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = rng() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5; // compensate for the running-average's low amplitude
    }
    return buffer;
  }

  // pink: Paul Kellet's refined running-sum approximation.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = rng() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    data[i] = pink * 0.11;
  }
  return buffer;
}

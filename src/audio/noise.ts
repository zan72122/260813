// src/audio/noise.ts — deterministic procedural noise sample generation.
// Uses the frozen mulberry32 PRNG from contracts (never Math.random) so
// output is reproducible and unit-testable; src/audio/index.ts wraps the
// result in a real AudioBuffer.

import { mulberry32 } from '../contracts/machine';

/** White noise samples in [-1, 1], deterministic for a given seed. */
export function generateWhiteNoise(length: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(Math.max(0, Math.floor(length)));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = rand() * 2 - 1;
  }
  return out;
}

/**
 * Sparse "crackle" gate: mostly 0 with short random bursts near 1, used to
 * amplitude-modulate a noise bed into forge/hiss crackle texture.
 */
export function generateCrackleGate(length: number, seed: number, density = 0.02): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(Math.max(0, Math.floor(length)));
  let burst = 0;
  let burstLength = 1;
  for (let i = 0; i < out.length; i += 1) {
    if (burst > 0) {
      out[i] = burst / burstLength;
      burst -= 1;
    } else if (rand() < density) {
      burstLength = 5 + Math.floor(rand() * 4);
      burst = burstLength;
      out[i] = 1;
    } else {
      out[i] = 0;
    }
  }
  return out;
}

// src/audio/dsp.ts
// Low-level, dependency-free Web Audio helpers shared by every synthesized
// cue in src/audio/cues/**. No external samples — everything here is
// generated at runtime from noise / oscillators per MASTER_SPEC & ASSET_MANIFEST.

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Deterministic xorshift32 PRNG so repeated buffer builds are stable across
 * calls (helps avoid subtle behaviour differences between dev/build).
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 4294967296) * 2 - 1; // -1..1
  };
}

/**
 * Builds a mono white-noise AudioBuffer whose tail is crossfaded into its
 * head so it can be played with `loop = true` without an audible seam.
 */
export function createNoiseBuffer(
  ctx: BaseAudioContext,
  seconds: number,
  seed = 1,
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = makeRng(seed);
  for (let i = 0; i < length; i++) {
    data[i] = rand();
  }
  const fadeLen = Math.min(Math.floor(ctx.sampleRate * 0.05), Math.floor(length / 4));
  for (let i = 0; i < fadeLen; i++) {
    const t = i / fadeLen;
    const head = data[i] ?? 0;
    const tailIdx = length - fadeLen + i;
    const tail = data[tailIdx] ?? 0;
    data[tailIdx] = tail * (1 - t) + head * t;
  }
  return buffer;
}

/** Ramps a GainNode's gain to `target` smoothly (no zipper noise, no clicks). */
export function rampGain(
  param: AudioParam,
  target: number,
  ctx: BaseAudioContext,
  timeConstant = 0.08,
): void {
  param.setTargetAtTime(target, ctx.currentTime, timeConstant);
}

/**
 * Applies a linear attack/decay envelope to a GainNode's gain param starting
 * "now". Always ramps from/to small values with linear segments — never uses
 * exponentialRampToValueAtTime(0, …), which throws and is a common source of
 * audible pops when misused.
 */
export function applyAdEnvelope(
  param: AudioParam,
  ctx: BaseAudioContext,
  opts: { peak: number; attack: number; hold?: number; decay: number; start?: number },
): void {
  const t0 = opts.start ?? ctx.currentTime;
  const hold = opts.hold ?? 0;
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(opts.peak, t0 + opts.attack);
  if (hold > 0) {
    param.setValueAtTime(opts.peak, t0 + opts.attack + hold);
  }
  param.linearRampToValueAtTime(0, t0 + opts.attack + hold + opts.decay);
}

/** Random float in [min, max). */
export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Disconnects and silences a node group after a one-shot voice finishes. */
export function scheduleCleanup(nodes: AudioNode[], after: number): void {
  window.setTimeout(
    () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          // already disconnected — fine.
        }
      }
    },
    Math.max(0, after * 1000) + 50,
  );
}

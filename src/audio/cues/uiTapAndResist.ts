// src/audio/cues/uiTapAndResist.ts
// Two small, non-punishing one-shot cues: a soft UI tap and a gentle
// "valve resisting counter-clockwise rotation" bump. Neither should ever
// read as an error/failure sound per MASTER_SPEC child-UX requirements.

import { applyAdEnvelope, createNoiseBuffer, scheduleCleanup } from '../dsp';

export function playUiTap(
  ctx: AudioContext,
  destination: AudioNode,
  opts?: { gain?: number; rate?: number },
): void {
  const now = ctx.currentTime;
  const gainMul = opts?.gain ?? 1;
  const rate = opts?.rate ?? 1;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2600 * rate;
  filter.Q.value = 1.4;
  gain.connect(filter);
  filter.connect(destination);

  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, 0.08, 7);
  source.connect(gain);

  applyAdEnvelope(gain.gain, ctx, { peak: 0.08 * gainMul, attack: 0.004, decay: 0.05, start: now });
  source.start(now);
  source.stop(now + 0.09);
  scheduleCleanup([source, filter, gain], 0.12);
}

export function playValveResist(
  ctx: AudioContext,
  destination: AudioNode,
  opts?: { gain?: number; rate?: number },
): void {
  const now = ctx.currentTime;
  const gainMul = opts?.gain ?? 1;
  const rate = opts?.rate ?? 1;

  // Soft low thump — a gentle "not this way" bump, never sharp or alarming.
  const thumpGain = ctx.createGain();
  thumpGain.gain.value = 0;
  thumpGain.connect(destination);
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(150 * rate, now);
  thump.frequency.exponentialRampToValueAtTime(95 * rate, now + 0.12);
  thump.connect(thumpGain);
  applyAdEnvelope(thumpGain.gain, ctx, { peak: 0.1 * gainMul, attack: 0.008, decay: 0.14, start: now });

  // A brief soft friction texture underneath.
  const frictionGain = ctx.createGain();
  frictionGain.gain.value = 0;
  const frictionFilter = ctx.createBiquadFilter();
  frictionFilter.type = 'lowpass';
  frictionFilter.frequency.value = 500;
  frictionGain.connect(frictionFilter);
  frictionFilter.connect(destination);
  const frictionSource = ctx.createBufferSource();
  frictionSource.buffer = createNoiseBuffer(ctx, 0.16, 11);
  frictionSource.connect(frictionGain);
  applyAdEnvelope(frictionGain.gain, ctx, { peak: 0.05 * gainMul, attack: 0.01, decay: 0.15, start: now });

  const stopAt = now + 0.2;
  thump.start(now);
  thump.stop(stopAt);
  frictionSource.start(now);
  frictionSource.stop(stopAt);
  scheduleCleanup([thump, thumpGain, frictionSource, frictionFilter, frictionGain], 0.24);
}

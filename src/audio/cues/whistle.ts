// src/audio/cues/whistle.ts
// Short, bright, pleasant fontainier's whistle chirp. Each call spawns an
// independent, self-cleaning voice so overlapping retriggers (caller handles
// cooldown per contract) mix additively instead of cutting each other off.

import { applyAdEnvelope, scheduleCleanup } from '../dsp';

export function playWhistle(
  ctx: AudioContext,
  destination: AudioNode,
  opts?: { gain?: number; rate?: number },
): void {
  const now = ctx.currentTime;
  const gainMul = opts?.gain ?? 1;
  const rate = opts?.rate ?? 1;
  const baseFreq = 2000 * rate;

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0;
  const brightness = ctx.createBiquadFilter();
  brightness.type = 'bandpass';
  brightness.frequency.value = baseFreq;
  brightness.Q.value = 3.2;
  voiceGain.connect(brightness);
  brightness.connect(destination);

  // Fundamental with a quick upward-then-settling sweep (fontainier's chirp).
  const fundamental = ctx.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(baseFreq * 0.86, now);
  fundamental.frequency.linearRampToValueAtTime(baseFreq * 1.08, now + 0.05);
  fundamental.frequency.linearRampToValueAtTime(baseFreq, now + 0.16);
  fundamental.connect(voiceGain);

  // A soft fifth overtone for brightness without harshness.
  const overtone = ctx.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(baseFreq * 1.5 * 0.86, now);
  overtone.frequency.linearRampToValueAtTime(baseFreq * 1.5 * 1.08, now + 0.05);
  overtone.frequency.linearRampToValueAtTime(baseFreq * 1.5, now + 0.16);
  const overtoneGain = ctx.createGain();
  overtoneGain.gain.value = 0.28;
  overtone.connect(overtoneGain);
  overtoneGain.connect(voiceGain);

  const peak = 0.22 * gainMul;
  applyAdEnvelope(voiceGain.gain, ctx, { peak, attack: 0.012, hold: 0.05, decay: 0.16, start: now });

  const stopAt = now + 0.26;
  fundamental.start(now);
  overtone.start(now);
  fundamental.stop(stopAt);
  overtone.stop(stopAt);
  scheduleCleanup([fundamental, overtone, overtoneGain, brightness, voiceGain], 0.3);
}

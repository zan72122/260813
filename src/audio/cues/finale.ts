// src/audio/cues/finale.ts
// Warm, gentle finale chord — a soft major triad + octave using triangle/sine
// unison pairs (slightly detuned for warmth) through a mellow lowpass filter.
// No sawtooth/square content and no bright resonant peaks: explicitly
// "no harsh brass" per the rendering-audio brief.

import { scheduleCleanup } from '../dsp';

const CHORD_RATIOS = [1, 1.2599, 1.4983, 2]; // root, major third, fifth, octave (equal temperament-ish)

export function playFinaleChord(
  ctx: AudioContext,
  destination: AudioNode,
  opts?: { gain?: number; rate?: number },
): void {
  const now = ctx.currentTime;
  const gainMul = opts?.gain ?? 1;
  const rootFreq = 220 * (opts?.rate ?? 1); // A3 root — warm, low-ish register

  const chordFilter = ctx.createBiquadFilter();
  chordFilter.type = 'lowpass';
  chordFilter.frequency.value = 2200;
  chordFilter.Q.value = 0.3;
  chordFilter.connect(destination);

  const attack = 0.45;
  const hold = 1.1;
  const release = 2.6;
  const total = attack + hold + release;

  const cleanupNodes: AudioNode[] = [chordFilter];

  CHORD_RATIOS.forEach((ratio, i) => {
    const freq = rootFreq * ratio;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(chordFilter);
    cleanupNodes.push(voiceGain);

    // Two slightly-detuned unison oscillators per chord tone for warmth.
    for (const detuneCents of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detuneCents;
      osc.connect(voiceGain);
      osc.start(now);
      osc.stop(now + total + 0.1);
      cleanupNodes.push(osc);
    }

    const peak = (0.14 - i * 0.018) * gainMul;
    voiceGain.gain.setValueAtTime(0, now);
    voiceGain.gain.linearRampToValueAtTime(peak, now + attack);
    voiceGain.gain.setValueAtTime(peak, now + attack + hold);
    voiceGain.gain.linearRampToValueAtTime(0, now + attack + hold + release);
  });

  scheduleCleanup(cleanupNodes, total + 0.2);
}

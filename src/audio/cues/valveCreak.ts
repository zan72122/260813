// src/audio/cues/valveCreak.ts
// Continuous valve-creak voice: filtered noise "grains" whose repetition
// rate and loudness both track intensity (mapped by the caller from
// angularVelocityRadPerSec per docs/CONTRACTS.md causal chain). Built on
// NoiseLoopVoice so intensity 0 is silent-but-warm (source keeps running).

import { NoiseLoopVoice } from '../loopVoice';

export function createValveCreakVoice(ctx: AudioContext, destination: AudioNode): NoiseLoopVoice {
  return new NoiseLoopVoice({
    ctx,
    destination,
    seconds: 1.7,
    seed: 3,
    peakGain: 0.3,
    buildChain(audioCtx, source) {
      const bandpass = audioCtx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 950;
      bandpass.Q.value = 5;

      // LFO amplitude-modulates the noise into discrete creak "grains".
      const lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.4;
      const lfoDepth = audioCtx.createGain();
      lfoDepth.gain.value = 0; // set by onIntensity
      const grainGain = audioCtx.createGain();
      grainGain.gain.value = 0; // resting level; LFO adds on top (offset below)
      lfo.connect(lfoDepth);
      lfoDepth.connect(grainGain.gain);
      lfo.start();

      source.connect(bandpass);
      bandpass.connect(grainGain);

      return {
        input: bandpass,
        output: grainGain,
        onIntensity(v, audioCtx2) {
          const now = audioCtx2.currentTime;
          const rate = 1.2 + v * 6.5; // creaks/sec
          lfo.frequency.setTargetAtTime(rate, now, 0.1);
          const depth = 0.35 + v * 0.65;
          lfoDepth.gain.setTargetAtTime(depth * 0.5, now, 0.08);
          grainGain.gain.setTargetAtTime(depth * 0.5, now, 0.08); // offset so LFO swings 0..depth
          bandpass.frequency.setTargetAtTime(850 + v * 700, now, 0.15);
        },
      };
    },
  });
}

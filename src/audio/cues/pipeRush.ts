// src/audio/cues/pipeRush.ts
// Loopable "water rushing through pipe" bed for the pipe-run phase. Filtered
// noise with a turbulence LFO on the filter cutoff; brightens and loudens
// with intensity (t progress along the pipe / flow speed).

import { NoiseLoopVoice } from '../loopVoice';

export function createPipeRushVoice(ctx: AudioContext, destination: AudioNode): NoiseLoopVoice {
  return new NoiseLoopVoice({
    ctx,
    destination,
    seconds: 2.4,
    seed: 5,
    peakGain: 0.28,
    buildChain(audioCtx, source) {
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 500;
      lowpass.Q.value = 0.7;

      const bodyPass = audioCtx.createBiquadFilter();
      bodyPass.type = 'bandpass';
      bodyPass.frequency.value = 260;
      bodyPass.Q.value = 0.9;

      // Slow turbulence flutter on cutoff so the rush doesn't sound static.
      const flutter = audioCtx.createOscillator();
      flutter.type = 'sine';
      flutter.frequency.value = 0.35;
      const flutterDepth = audioCtx.createGain();
      flutterDepth.gain.value = 60;
      flutter.connect(flutterDepth);
      flutterDepth.connect(lowpass.frequency);
      flutter.start();

      source.connect(lowpass);
      lowpass.connect(bodyPass);

      return {
        input: lowpass,
        output: bodyPass,
        onIntensity(v, audioCtx2) {
          const now = audioCtx2.currentTime;
          lowpass.frequency.setTargetAtTime(420 + v * 900, now, 0.12);
          flutterDepth.gain.setTargetAtTime(50 + v * 150, now, 0.2);
        },
      };
    },
  });
}

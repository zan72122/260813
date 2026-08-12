// src/audio/cues/ambient.ts
// Very quiet morning-garden ambience: a soft filtered-air noise bed plus
// occasional gentle bird chirps scheduled at randomized intervals. Started
// once via play('ambient-morning'); setIntensity scales the overall bed.

import { NoiseLoopVoice } from '../loopVoice';
import { applyAdEnvelope, randRange, scheduleCleanup } from '../dsp';

function playSoftBirdChirp(ctx: AudioContext, destination: AudioNode): void {
  const now = ctx.currentTime;
  const notes = 2 + Math.floor(Math.random() * 2);
  const baseFreq = randRange(1800, 2600);
  let t = now;

  const chirpGain = ctx.createGain();
  chirpGain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = baseFreq;
  filter.Q.value = 4;
  chirpGain.connect(filter);
  filter.connect(destination);

  const oscillators: OscillatorNode[] = [];
  for (let i = 0; i < notes; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const freq = baseFreq * (1 + randRange(-0.08, 0.14) * (i + 1));
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * 1.15, t + 0.05);
    osc.connect(chirpGain);
    osc.start(t);
    osc.stop(t + 0.09);
    oscillators.push(osc);
    t += 0.1;
  }

  applyAdEnvelope(chirpGain.gain, ctx, { peak: 0.045, attack: 0.01, decay: notes * 0.1 + 0.05, start: now });
  scheduleCleanup([...oscillators, chirpGain, filter], notes * 0.1 + 0.15);
}

export interface AmbientVoice {
  start(): void;
  setIntensity(v: number): void;
}

export function createAmbientVoice(ctx: AudioContext, destination: AudioNode): AmbientVoice {
  const bed = new NoiseLoopVoice({
    ctx,
    destination,
    seconds: 3.2,
    seed: 23,
    peakGain: 0.045,
    buildChain(audioCtx, source) {
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 900;
      lowpass.Q.value = 0.4;
      source.connect(lowpass);
      return { input: lowpass, output: lowpass };
    },
  });

  let birdsScheduled = false;
  const scheduleNextBird = (): void => {
    const delay = randRange(6, 17) * 1000;
    window.setTimeout(() => {
      playSoftBirdChirp(ctx, destination);
      scheduleNextBird();
    }, delay);
  };

  return {
    start() {
      bed.start();
      bed.setIntensity(0.6);
      if (!birdsScheduled) {
        birdsScheduled = true;
        scheduleNextBird();
      }
    },
    setIntensity(v: number) {
      bed.start();
      bed.setIntensity(v);
      if (!birdsScheduled) {
        birdsScheduled = true;
        scheduleNextBird();
      }
    },
  };
}

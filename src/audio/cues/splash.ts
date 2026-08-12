// src/audio/cues/splash.ts
// Three distinct, loopable filtered-noise water characters, one per fountain
// shape. Each is two noise layers (spray + base rumble) mixed differently so
// fan/ring/crown are recognisably different even at the same intensity.

import { NoiseLoopVoice } from '../loopVoice';

export type SplashKind = 'fan' | 'ring' | 'crown';

function buildTwoLayerSplash(
  audioCtx: AudioContext,
  source: AudioBufferSourceNode,
  spraySpec: { type: BiquadFilterType; freq: number; q: number; mix: number },
  baseSpec: { type: BiquadFilterType; freq: number; q: number; mix: number },
  panRateHz: number,
) {
  const splitGain = audioCtx.createGain();
  splitGain.gain.value = 1;
  source.connect(splitGain);

  const sprayFilter = audioCtx.createBiquadFilter();
  sprayFilter.type = spraySpec.type;
  sprayFilter.frequency.value = spraySpec.freq;
  sprayFilter.Q.value = spraySpec.q;
  const sprayGain = audioCtx.createGain();
  sprayGain.gain.value = spraySpec.mix;
  splitGain.connect(sprayFilter);
  sprayFilter.connect(sprayGain);

  const baseFilter = audioCtx.createBiquadFilter();
  baseFilter.type = baseSpec.type;
  baseFilter.frequency.value = baseSpec.freq;
  baseFilter.Q.value = baseSpec.q;
  const baseGain = audioCtx.createGain();
  baseGain.gain.value = baseSpec.mix;
  splitGain.connect(baseFilter);
  baseFilter.connect(baseGain);

  const mixBus = audioCtx.createGain();
  sprayGain.connect(mixBus);
  baseGain.connect(mixBus);

  let panner: StereoPannerNode | null = null;
  let panLfo: OscillatorNode | null = null;
  let output: AudioNode = mixBus;
  if (typeof audioCtx.createStereoPanner === 'function' && panRateHz > 0) {
    panner = audioCtx.createStereoPanner();
    panLfo = audioCtx.createOscillator();
    panLfo.type = 'sine';
    panLfo.frequency.value = panRateHz;
    const panDepth = audioCtx.createGain();
    panDepth.gain.value = 0.35;
    panLfo.connect(panDepth);
    panDepth.connect(panner.pan);
    panLfo.start();
    mixBus.connect(panner);
    output = panner;
  }

  return { input: splitGain, output, sprayFilter, baseFilter, sprayGain, baseGain };
}

export function createSplashVoice(
  ctx: AudioContext,
  destination: AudioNode,
  kind: SplashKind,
): NoiseLoopVoice {
  const seedByKind: Record<SplashKind, number> = { fan: 11, ring: 13, crown: 17 };

  return new NoiseLoopVoice({
    ctx,
    destination,
    seconds: 2.6,
    seed: seedByKind[kind],
    peakGain: kind === 'crown' ? 0.32 : 0.26,
    buildChain(audioCtx, source) {
      if (kind === 'fan') {
        // Broad, airy spray fanning outward; light base rumble.
        const built = buildTwoLayerSplash(
          audioCtx,
          source,
          { type: 'highpass', freq: 1900, q: 0.5, mix: 0.7 },
          { type: 'lowpass', freq: 320, q: 0.6, mix: 0.35 },
          0.12,
        );
        return {
          input: built.input,
          output: built.output,
          onIntensity(v, c) {
            const now = c.currentTime;
            built.sprayFilter.frequency.setTargetAtTime(1500 + v * 900, now, 0.12);
            built.sprayGain.gain.setTargetAtTime(0.55 + v * 0.3, now, 0.12);
          },
        };
      }
      if (kind === 'ring') {
        // Mid-centred, circulating texture — gentle auto-pan sells the ring.
        const built = buildTwoLayerSplash(
          audioCtx,
          source,
          { type: 'bandpass', freq: 1400, q: 1.4, mix: 0.6 },
          { type: 'bandpass', freq: 500, q: 0.9, mix: 0.45 },
          0.22,
        );
        return {
          input: built.input,
          output: built.output,
          onIntensity(v, c) {
            const now = c.currentTime;
            built.sprayFilter.frequency.setTargetAtTime(1100 + v * 700, now, 0.12);
            built.baseGain.gain.setTargetAtTime(0.3 + v * 0.3, now, 0.12);
          },
        };
      }
      // crown: tall bright central jet + broad low surrounding jets.
      const built = buildTwoLayerSplash(
        audioCtx,
        source,
        { type: 'highpass', freq: 2600, q: 0.7, mix: 0.55 },
        { type: 'lowpass', freq: 260, q: 0.5, mix: 0.55 },
        0.08,
      );
      return {
        input: built.input,
        output: built.output,
        onIntensity(v, c) {
          const now = c.currentTime;
          built.sprayFilter.frequency.setTargetAtTime(2200 + v * 1200, now, 0.12);
          built.sprayGain.gain.setTargetAtTime(0.4 + v * 0.4, now, 0.12);
          built.baseGain.gain.setTargetAtTime(0.4 + v * 0.35, now, 0.12);
        },
      };
    },
  });
}

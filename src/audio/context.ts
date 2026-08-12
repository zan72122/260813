/**
 * Minimal structural AudioContext surface the audio engine depends on.
 * Using a narrow interface (instead of the full lib.dom `AudioContext`)
 * keeps the engine's dependency injectable and testable: unit tests pass a
 * lightweight stub that implements only these members instead of ever
 * constructing a real `AudioContext` (jsdom has none, and even in a real
 * browser test runner constructing one is slow/flaky). Real usage passes a
 * genuine `AudioContext`, which satisfies this interface structurally.
 */
export interface MinimalAudioContext {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly sampleRate: number;
  readonly destination: AudioDestinationNode;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBiquadFilter(): BiquadFilterNode;
  createBufferSource(): AudioBufferSourceNode;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
  createWaveShaper(): WaveShaperNode;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

/** Factory signature the audio engine uses to obtain a context lazily (first user gesture). */
export type AudioContextFactory = () => MinimalAudioContext;

/**
 * Default factory: constructs a real browser `AudioContext`. Never called
 * from unit tests (they inject their own factory) — only exercised at
 * runtime in a real browser.
 */
export function defaultAudioContextFactory(): MinimalAudioContext {
  return new AudioContext();
}

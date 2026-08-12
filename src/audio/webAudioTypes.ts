/**
 * A minimal structural subset of the WebAudio API that `EiffelAudioEngine`
 * actually calls. Declared as our own interfaces (rather than typing
 * everything as the real DOM `AudioContext`) so:
 *  1. tests can construct a small in-memory fake that satisfies exactly
 *     this surface, with no `jsdom`/browser environment required (this
 *     project's vitest config runs in `environment: 'node'`), and
 *  2. the real browser `AudioContext` / `GainNode` / etc. are structurally
 *     assignable here with zero casts, since they are supersets of these
 *     shapes.
 */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime(value: number, endTime: number): void;
  cancelScheduledValues(cancelTime: number): void;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): void;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): void;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
  readonly detune: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((event: Event) => void) | null;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
  readonly gain: AudioParamLike;
}

export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((event: Event) => void) | null;
}

/** Includes `'interrupted'` (iOS Safari, per current lib.dom types) even
 * though this engine treats it the same as `'suspended'` — `unlock()` only
 * ever checks for `'suspended'` explicitly, so an interrupted context stays
 * silent until the next explicit `unlock()` call, which is the correct,
 * safe behavior (never resume audio without a fresh user gesture). */
export type AudioContextStateLike = 'suspended' | 'running' | 'closed' | 'interrupted';

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextStateLike;
  resume(): Promise<void>;
  close(): Promise<void>;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioBufferSourceNodeLike;
}

/** Constructs the real browser `AudioContext`, typed down to `AudioContextLike`. */
export function createBrowserAudioContext(): AudioContextLike {
  return new AudioContext();
}

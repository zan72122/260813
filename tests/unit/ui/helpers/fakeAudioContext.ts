/**
 * A minimal in-memory fake satisfying `src/audio/webAudioTypes.ts`'s
 * `AudioContextLike`, for exercising `EiffelAudioEngine` in vitest's
 * `environment: 'node'` (no real WebAudio / no jsdom). Not a `*.spec.ts`
 * file, so vitest's include pattern never picks it up as a test on its own.
 */

import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioContextStateLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from '../../../../src/audio/webAudioTypes.ts';

class FakeAudioParam implements AudioParamLike {
  value = 0;
  readonly calls: string[] = [];

  setValueAtTime(value: number, _startTime: number): void {
    this.value = value;
    this.calls.push('setValueAtTime');
  }

  linearRampToValueAtTime(value: number, _endTime: number): void {
    this.value = value;
    this.calls.push('linearRampToValueAtTime');
  }

  exponentialRampToValueAtTime(value: number, _endTime: number): void {
    this.value = value;
    this.calls.push('exponentialRampToValueAtTime');
  }

  cancelScheduledValues(_cancelTime: number): void {
    this.calls.push('cancelScheduledValues');
  }

  setTargetAtTime(target: number, _startTime: number, _timeConstant: number): void {
    this.value = target;
    this.calls.push('setTargetAtTime');
  }
}

class FakeAudioNode implements AudioNodeLike {
  connectedTo: FakeAudioNode[] = [];
  disconnected = false;

  connect(destination: AudioNodeLike): void {
    this.connectedTo.push(destination as FakeAudioNode);
  }

  disconnect(): void {
    this.disconnected = true;
    this.connectedTo = [];
  }
}

class FakeGainNode extends FakeAudioNode implements GainNodeLike {
  readonly gain = new FakeAudioParam();
}

class FakeOscillatorNode extends FakeAudioNode implements OscillatorNodeLike {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  started: number[] = [];
  stopped: number[] = [];
  onended: ((event: Event) => void) | null = null;

  start(when = 0): void {
    this.started.push(when);
  }

  stop(when = 0): void {
    this.stopped.push(when);
  }
}

class FakeBiquadFilterNode extends FakeAudioNode implements BiquadFilterNodeLike {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
}

class FakeAudioBuffer implements AudioBufferLike {
  private readonly channelData: Float32Array;

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channelData = new Float32Array(length);
  }

  getChannelData(_channel: number): Float32Array {
    return this.channelData;
  }
}

class FakeAudioBufferSourceNode extends FakeAudioNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  started: number[] = [];
  stopped: number[] = [];
  onended: ((event: Event) => void) | null = null;

  start(when = 0): void {
    this.started.push(when);
  }

  stop(when = 0): void {
    this.stopped.push(when);
  }
}

export interface FakeAudioContextCounts {
  gains: number;
  oscillators: number;
  filters: number;
  buffers: number;
  bufferSources: number;
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  sampleRate = 44100;
  state: AudioContextStateLike = 'suspended';
  readonly destination = new FakeAudioNode();
  readonly counts: FakeAudioContextCounts = {
    gains: 0,
    oscillators: 0,
    filters: 0,
    buffers: 0,
    bufferSources: 0,
  };
  closed = false;

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    this.closed = true;
    return Promise.resolve();
  }

  createGain(): GainNodeLike {
    this.counts.gains += 1;
    return new FakeGainNode();
  }

  createOscillator(): OscillatorNodeLike {
    this.counts.oscillators += 1;
    return new FakeOscillatorNode();
  }

  createBiquadFilter(): BiquadFilterNodeLike {
    this.counts.filters += 1;
    return new FakeBiquadFilterNode();
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBufferLike {
    this.counts.buffers += 1;
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource(): AudioBufferSourceNodeLike {
    this.counts.bufferSources += 1;
    return new FakeAudioBufferSourceNode();
  }
}

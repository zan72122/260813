import { describe, expect, it } from 'vitest';
import { MasterBus, MASTER_COMPRESSOR_SETTINGS } from '../../src/audio/masterBus';
import type { MinimalAudioContext } from '../../src/audio/context';

/**
 * A minimal fake WebAudio node graph — real `AudioContext`/`AudioParam`
 * scheduling (jsdom has neither, and this repo's frozen `environment:'node'`
 * vitest config has no jsdom anyway — see tests/unit/game-input.test.ts's
 * own doc comment on the same constraint) is unavailable here, so this fake
 * `.value`-settable `AudioParam`-shaped object and `.connect()`-tracking
 * node exercise MasterBus's real production code path (real `createGain`/
 * `createDynamicsCompressor` call sites, real field assignments) instead of
 * a real GPU/audio-thread graph.
 */
interface FakeParam {
  value: number;
  cancelScheduledValues(t: number): void;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
}

function fakeParam(initial: number): FakeParam {
  const p: FakeParam = {
    value: initial,
    cancelScheduledValues() {
      /* no scheduling to cancel in this fake */
    },
    setValueAtTime(v) {
      p.value = v;
    },
    linearRampToValueAtTime(v) {
      p.value = v;
    },
  };
  return p;
}

interface FakeGainNode {
  gain: FakeParam;
  connectedTo?: unknown;
  disconnected: boolean;
  connect(dest: unknown): unknown;
  disconnect(): void;
}

function fakeGainNode(): FakeGainNode {
  const node: FakeGainNode = {
    gain: fakeParam(1),
    disconnected: false,
    connect(dest) {
      node.connectedTo = dest;
      return dest;
    },
    disconnect() {
      node.disconnected = true;
    },
  };
  return node;
}

interface FakeCompressorNode {
  threshold: FakeParam;
  knee: FakeParam;
  ratio: FakeParam;
  attack: FakeParam;
  release: FakeParam;
  connectedTo?: unknown;
  disconnected: boolean;
  connect(dest: unknown): unknown;
  disconnect(): void;
}

function fakeCompressorNode(): FakeCompressorNode {
  const node: FakeCompressorNode = {
    threshold: fakeParam(0),
    knee: fakeParam(0),
    ratio: fakeParam(0),
    attack: fakeParam(0),
    release: fakeParam(0),
    disconnected: false,
    connect(dest) {
      node.connectedTo = dest;
      return dest;
    },
    disconnect() {
      node.disconnected = true;
    },
  };
  return node;
}

function fakeContext(): {
  ctx: MinimalAudioContext;
  gainNode: FakeGainNode;
  compressorNode: FakeCompressorNode;
  destination: object;
} {
  const destination = { __brand: 'destination' };
  const gainNode = fakeGainNode();
  const compressorNode = fakeCompressorNode();
  const ctx = {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination,
    createGain: () => gainNode,
    createDynamicsCompressor: () => compressorNode,
    createOscillator: () => {
      throw new Error('not exercised by MasterBus');
    },
    createBiquadFilter: () => {
      throw new Error('not exercised by MasterBus');
    },
    createBufferSource: () => {
      throw new Error('not exercised by MasterBus');
    },
    createBuffer: () => {
      throw new Error('not exercised by MasterBus');
    },
    createWaveShaper: () => {
      throw new Error('not exercised by MasterBus');
    },
    resume: () => Promise.resolve(undefined),
    suspend: () => Promise.resolve(undefined),
    close: () => Promise.resolve(undefined),
  } as unknown as MinimalAudioContext;
  return { ctx, gainNode, compressorNode, destination };
}

describe('MasterBus — F7 gentle master limiter', () => {
  it('routes gain -> compressor -> destination (compressor sits before destination, not bypassed)', () => {
    const { ctx, gainNode, compressorNode, destination } = fakeContext();
    // Constructed purely for its wiring side effects, inspected via the fakes above.
    void new MasterBus(ctx);

    expect(gainNode.connectedTo).toBe(compressorNode);
    expect(compressorNode.connectedTo).toBe(destination);
  });

  it('applies the documented conservative compressor settings', () => {
    const { ctx, compressorNode } = fakeContext();
    void new MasterBus(ctx);

    expect(compressorNode.threshold.value).toBe(MASTER_COMPRESSOR_SETTINGS.thresholdDb);
    expect(compressorNode.knee.value).toBe(MASTER_COMPRESSOR_SETTINGS.kneeDb);
    expect(compressorNode.ratio.value).toBe(MASTER_COMPRESSOR_SETTINGS.ratio);
    expect(compressorNode.attack.value).toBe(MASTER_COMPRESSOR_SETTINGS.attackSeconds);
    expect(compressorNode.release.value).toBe(MASTER_COMPRESSOR_SETTINGS.releaseSeconds);

    // Conservative, "glue"-style values, not a hard brick-wall limiter or an
    // effect audible on ordinary single-voice playback.
    expect(MASTER_COMPRESSOR_SETTINGS.thresholdDb).toBeLessThan(-12);
    expect(MASTER_COMPRESSOR_SETTINGS.ratio).toBeLessThanOrEqual(6);
    expect(MASTER_COMPRESSOR_SETTINGS.attackSeconds).toBeLessThan(0.02);
  });

  it('setEnabled/setSuspended still ramp the gain node toward the correct target, unaffected by the new compressor stage', () => {
    const { ctx, gainNode } = fakeContext();
    const bus = new MasterBus(ctx, 0.5);
    expect(gainNode.gain.value).toBe(0.5);

    bus.setEnabled(false);
    expect(gainNode.gain.value).toBe(0);

    bus.setEnabled(true);
    expect(gainNode.gain.value).toBe(0.5);

    bus.setSuspended(true);
    expect(gainNode.gain.value).toBe(0);

    bus.setSuspended(false);
    expect(gainNode.gain.value).toBe(0.5);
  });

  it('dispose() disconnects both the gain and compressor nodes', () => {
    const { ctx, gainNode, compressorNode } = fakeContext();
    const bus = new MasterBus(ctx);

    bus.dispose();

    expect(gainNode.disconnected).toBe(true);
    expect(compressorNode.disconnected).toBe(true);
  });
});

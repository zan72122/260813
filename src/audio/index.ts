// src/audio/index.ts — UX module (owner: UX, src/audio/**).
// 100% WebAudio synthesis, no samples/network. Subscribes to the bus for
// one-shot SFX and to the store for continuous, state-driven param
// automation (steam hiss, chug rate, forge crackle, cooling sizzle). Every
// node graph is scheduled on the AudioContext clock and disposed after use
// so 20 replays leave no dangling nodes.

import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';
import type { GameState } from '../contracts/types';
import { generateCrackleGate, generateWhiteNoise } from './noise';
import {
  anvilRingFrequency,
  chugIntervalSeconds,
  coolingSizzleGain,
  forgeCrackleGain,
  hammerPitchForHit,
  slingWhipBendRatio,
  steamHissGain,
} from './params';

export interface AudioHandle {
  unlock(): Promise<void>;
  dispose(): void;
}

const NOISE_SEED = 0x5eed01;
const NOISE_DURATION_S = 2;
const AMBIENT_GAIN = 0.05;

export function createAudio(o: { bus: EventBus; store: GameStore }): AudioHandle {
  const { bus, store } = o;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let crackleBuffer: AudioBuffer | null = null;

  let ambientSource: AudioBufferSourceNode | null = null;
  let ambientGain: GainNode | null = null;

  let climbHissSource: AudioBufferSourceNode | null = null;
  let climbHissGain: GainNode | null = null;
  let climbHissFilter: BiquadFilterNode | null = null;

  let forgeSource: AudioBufferSourceNode | null = null;
  let forgeGain: GainNode | null = null;
  let forgeFilter: BiquadFilterNode | null = null;

  let sizzleSource: AudioBufferSourceNode | null = null;
  let sizzleGain: GainNode | null = null;

  let nextChugAt = 0;
  let chugScheduled = false;

  let lastPhase: GameState['phase'] | null = null;
  let lastMuted = false;

  function ensureContext(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = store.get().audio.muted ? 0 : 1;
      master.connect(ctx.destination);
      noiseBuffer = bufferFromSamples(ctx, generateWhiteNoise(ctx.sampleRate * NOISE_DURATION_S, NOISE_SEED));
      crackleBuffer = bufferFromSamples(
        ctx,
        generateCrackleGate(ctx.sampleRate * NOISE_DURATION_S, NOISE_SEED + 1, 0.03),
      );
    }
    return ctx;
  }

  function bufferFromSamples(context: AudioContext, samples: Float32Array): AudioBuffer {
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  // ---- one-shot synthesis helpers -----------------------------------------

  function playTone(opts: {
    freq: number;
    endFreq?: number;
    duration: number;
    type?: OscillatorType;
    gain: number;
    attack?: number;
  }): void {
    const context = ctx;
    const out = master;
    if (!context || !out) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.endFreq), now + opts.duration);
    }
    const attack = opts.attack ?? 0.005;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.gain, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + opts.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  function playNoiseBurst(opts: {
    duration: number;
    gain: number;
    filterType?: BiquadFilterType;
    filterFreq?: number;
    q?: number;
  }): void {
    const context = ctx;
    const out = master;
    if (!context || !out || !noiseBuffer) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = opts.filterType ?? 'bandpass';
    filter.frequency.value = opts.filterFreq ?? 1200;
    filter.Q.value = opts.q ?? 0.8;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(opts.gain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(now);
    source.stop(now + opts.duration + 0.02);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  function playMetallicSnap(): void {
    playTone({ freq: 1400, endFreq: 900, duration: 0.14, type: 'triangle', gain: 0.22, attack: 0.002 });
    playTone({ freq: 2600, endFreq: 2000, duration: 0.08, type: 'sine', gain: 0.1, attack: 0.001 });
  }

  function playBoltKachon(): void {
    playTone({ freq: 90, endFreq: 55, duration: 0.22, type: 'sine', gain: 0.35, attack: 0.001 });
    playTone({ freq: 1800, endFreq: 1500, duration: 0.16, type: 'triangle', gain: 0.14, attack: 0.001 });
  }

  function playTongTick(): void {
    playTone({ freq: 2200, duration: 0.05, type: 'square', gain: 0.08, attack: 0.001 });
  }

  function playHammerHit(hits: 1 | 2 | 3): void {
    const pitch = hammerPitchForHit(hits);
    playTone({ freq: pitch, endFreq: pitch * 0.9, duration: 0.09, type: 'square', gain: 0.2, attack: 0.001 });
    playTone({
      freq: anvilRingFrequency(hits),
      duration: 0.35,
      type: 'sine',
      gain: 0.1,
      attack: 0.001,
    });
    playNoiseBurst({ duration: 0.06, gain: 0.08, filterType: 'highpass', filterFreq: 3000 });
  }

  function playCoolingCreak(): void {
    playTone({ freq: 260, endFreq: 140, duration: 0.4, type: 'sawtooth', gain: 0.08, attack: 0.02 });
  }

  function playSlingWhip(): void {
    const context = ctx;
    if (!context) return;
    const bend = slingWhipBendRatio();
    playTone({ freq: 500, endFreq: 500 * bend, duration: 0.3, type: 'triangle', gain: 0.1, attack: 0.01 });
  }

  function playArrivalClunk(): void {
    playTone({ freq: 70, endFreq: 40, duration: 0.5, type: 'sine', gain: 0.4, attack: 0.001 });
    playTone({ freq: 220, endFreq: 90, duration: 0.3, type: 'triangle', gain: 0.2, attack: 0.001 });
    playNoiseBurst({ duration: 0.12, gain: 0.15, filterType: 'lowpass', filterFreq: 400 });
  }

  function playSuccessChime(): void {
    // A warm, struck-bell/mallet interval — two soft partials, not a modern app "ding".
    playTone({ freq: 523.25, duration: 1.1, type: 'sine', gain: 0.16, attack: 0.008 });
    playTone({ freq: 659.25, duration: 0.9, type: 'sine', gain: 0.1, attack: 0.01 });
    playTone({ freq: 392, duration: 1.3, type: 'sine', gain: 0.08, attack: 0.015 });
  }

  function playChugThump(atTime: number): void {
    const context = ctx;
    const out = master;
    if (!context || !out) return;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, atTime);
    osc.frequency.exponentialRampToValueAtTime(50, atTime + 0.12);
    gain.gain.setValueAtTime(0, atTime);
    gain.gain.linearRampToValueAtTime(0.28, atTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, atTime + 0.16);
    osc.connect(gain);
    gain.connect(out);
    osc.start(atTime);
    osc.stop(atTime + 0.18);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  // ---- continuous state-driven loops --------------------------------------

  function stopLoop(
    getters: () => [AudioBufferSourceNode | null, GainNode | null, BiquadFilterNode | null],
    clear: () => void,
  ): void {
    const [source, gain, filter] = getters();
    if (source) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    gain?.disconnect();
    filter?.disconnect();
    clear();
  }

  function ensureAmbient(): void {
    const context = ctx;
    const out = master;
    if (!context || !out || !noiseBuffer || ambientSource) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(AMBIENT_GAIN, context.currentTime + 1.2);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start();
    ambientSource = source;
    ambientGain = gain;
  }

  function ensureClimbHiss(): void {
    const context = ctx;
    const out = master;
    if (!context || !out || !noiseBuffer || climbHissSource) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start();
    climbHissSource = source;
    climbHissGain = gain;
    climbHissFilter = filter;
  }

  function stopClimbHiss(): void {
    stopLoop(
      () => [climbHissSource, climbHissGain, climbHissFilter],
      () => {
        climbHissSource = null;
        climbHissGain = null;
        climbHissFilter = null;
      },
    );
  }

  function ensureForgeCrackle(): void {
    const context = ctx;
    const out = master;
    if (!context || !out || !crackleBuffer || forgeSource) return;
    const source = context.createBufferSource();
    source.buffer = crackleBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.6;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start();
    forgeSource = source;
    forgeGain = gain;
    forgeFilter = filter;
  }

  function stopForgeCrackle(): void {
    stopLoop(
      () => [forgeSource, forgeGain, forgeFilter],
      () => {
        forgeSource = null;
        forgeGain = null;
        forgeFilter = null;
      },
    );
  }

  function ensureSizzle(): void {
    const context = ctx;
    const out = master;
    if (!context || !out || !noiseBuffer || sizzleSource) return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(out);
    source.start();
    sizzleSource = source;
    sizzleGain = gain;
  }

  function stopSizzle(): void {
    stopLoop(
      () => [sizzleSource, sizzleGain, null],
      () => {
        sizzleSource = null;
        sizzleGain = null;
      },
    );
  }

  function scheduleChugIfDue(state: GameState): void {
    const context = ctx;
    if (!context) return;
    const climbing = state.phase === 'climb' || state.phase === 'playClimb';
    if (!climbing) {
      chugScheduled = false;
      return;
    }
    if (!chugScheduled) {
      nextChugAt = context.currentTime + 0.05;
      chugScheduled = true;
    }
    const lookahead = 0.4;
    while (nextChugAt < context.currentTime + lookahead) {
      playChugThump(nextChugAt);
      nextChugAt += chugIntervalSeconds(state.climb.progress);
    }
  }

  function updateContinuous(state: GameState): void {
    if (!ctx) return;

    if (climbHissGain) {
      const climbing = state.phase === 'climb' || state.phase === 'playClimb';
      const target = climbing ? steamHissGain(state.climb.lever) : 0;
      climbHissGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      if (climbing) scheduleChugIfDue(state);
      else chugScheduled = false;
    } else if (state.phase === 'climb' || state.phase === 'playClimb') {
      ensureClimbHiss();
    }

    const heating = state.phase === 'rivetHeat' || (state.phase === 'playRivet' && state.rivet.temp < 1);
    if (heating) {
      ensureForgeCrackle();
      forgeGain?.gain.setTargetAtTime(forgeCrackleGain(state.rivet.temp), ctx.currentTime, 0.1);
    } else if (forgeSource) {
      forgeGain?.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      if ((forgeGain?.gain.value ?? 0) < 0.005) stopForgeCrackle();
    }

    const cooling =
      state.phase === 'rivetCool' ||
      (state.phase === 'playRivet' && state.rivet.inserted && state.rivet.hits >= 3);
    if (cooling) {
      ensureSizzle();
      sizzleGain?.gain.setTargetAtTime(coolingSizzleGain(state.rivet.cooled), ctx.currentTime, 0.15);
    } else if (sizzleSource) {
      sizzleGain?.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      if ((sizzleGain?.gain.value ?? 0) < 0.005) stopSizzle();
    }
  }

  // ---- bus wiring -----------------------------------------------------------

  const unsubscribers: Array<() => void> = [
    bus.on('snap:hook', () => playMetallicSnap()),
    bus.on('snap:align', () => playMetallicSnap()),
    bus.on('bolt:seated', () => playBoltKachon()),
    bus.on('rivet:handoff', () => playTongTick()),
    bus.on('rivet:hit', (payload) => playHammerHit(payload.hits)),
    bus.on('rivet:cooled', () => playCoolingCreak()),
    bus.on('sling:released', () => playSlingWhip()),
    bus.on('climb:locked', () => playArrivalClunk()),
    bus.on('reveal:done', () => playSuccessChime()),
    bus.on('phase:enter', (payload) => {
      if (payload.phase === 'rivetHeat') ensureForgeCrackle();
      if (payload.phase === 'climb' || payload.phase === 'playClimb') ensureClimbHiss();
    }),
  ];

  const unsubscribeStore = store.subscribe((state) => {
    if (!ctx) return;
    if (state.audio.muted !== lastMuted) {
      lastMuted = state.audio.muted;
      master?.gain.setTargetAtTime(state.audio.muted ? 0 : 1, ctx.currentTime, 0.05);
    }
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      if (state.phase !== 'climb' && state.phase !== 'playClimb') stopClimbHiss();
    }
    updateContinuous(state);
  });

  // ---- lifecycle: unlock / visibility / dispose ------------------------------

  function onVisibilityChange(): void {
    if (!ctx) return;
    if (document.hidden) {
      void ctx.suspend();
    } else if (store.get().audio.unlocked) {
      void ctx.resume();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  function onStateChange(): void {
    // iOS Safari can interrupt/suspend the context outside of visibilitychange
    // (e.g. Siri, phone call, Silent-switch-adjacent quirks); re-resume when
    // we come back and the tab is actually visible.
    if (ctx && ctx.state === 'suspended' && !document.hidden && store.get().audio.unlocked) {
      void ctx.resume();
    }
  }

  async function unlock(): Promise<void> {
    const context = ensureContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
    context.addEventListener('statechange', onStateChange);
    const audio = store.get().audio;
    store.set({ audio: { ...audio, unlocked: true } });
    lastMuted = store.get().audio.muted;
    if (master) master.gain.value = lastMuted ? 0 : 1;
    ensureAmbient();
  }

  function dispose(): void {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const off of unsubscribers) off();
    unsubscribeStore();
    stopClimbHiss();
    stopForgeCrackle();
    stopSizzle();
    if (ambientSource) {
      try {
        ambientSource.stop();
      } catch {
        /* already stopped */
      }
      ambientSource.disconnect();
      ambientSource = null;
    }
    ambientGain?.disconnect();
    ambientGain = null;
    if (ctx) {
      ctx.removeEventListener('statechange', onStateChange);
      void ctx.close();
      ctx = null;
    }
    master = null;
    noiseBuffer = null;
    crackleBuffer = null;
  }

  return { unlock, dispose };
}

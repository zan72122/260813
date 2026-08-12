/**
 * Individual procedural voices. Each "play*" function is a one-shot: it
 * builds a small, self-cleaning node graph (oscillators/noise → filter →
 * envelope gain → `dest`) and disconnects everything once its envelope
 * finishes (via `onended`/a scheduled cleanup), so replaying a leg or
 * looping never accumulates dangling nodes. Each "start*" function returns
 * a small controller for a continuous voice (sand loop, near-target swell,
 * ambient bed) that the caller must `stop()` explicitly.
 */
import type { MinimalAudioContext } from './context';
import { createNoiseBuffer } from './noise';
import { mulberry32 } from '../contracts/rng';

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function makeEnvelope(
  ctx: MinimalAudioContext,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.001, 0.0001), t0 + attack + decay);
  return g;
}

/** Transient wood creak — gate handle moving. Intensity (0..1) sets loudness/brightness. */
export function playGateCreak(ctx: MinimalAudioContext, dest: AudioNode, intensity: number): void {
  const amt = clamp01(intensity);
  if (amt <= 0.02) return;
  const noiseBuf = createNoiseBuffer(ctx, 0.18, 'pink', Math.floor(ctx.currentTime * 1000) ^ 0x9e37);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 500 + amt * 900;
  filter.Q.value = 3.5;
  const env = makeEnvelope(ctx, 0.18 * amt, 0.01, 0.16);
  src.connect(filter);
  filter.connect(env);
  env.connect(dest);
  src.start();
  const end = ctx.currentTime + 0.2;
  src.stop(end);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    } catch {
      /* already disconnected */
    }
  };
}

export interface LoopController {
  setIntensity(rate01: number, brightness01: number): void;
  stop(): void;
}

/** Continuous filtered-noise sand grain loop; rate/brightness follow `sandFlow`. */
export function startSandLoop(ctx: MinimalAudioContext, dest: AudioNode, seed: number): LoopController {
  const buf = createNoiseBuffer(ctx, 2, 'brown', seed);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start();

  return {
    setIntensity(rate01, brightness01) {
      const r = clamp01(rate01);
      const b = clamp01(brightness01);
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(r * 0.22, now + 0.15);
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(filter.frequency.value, now);
      filter.frequency.linearRampToValueAtTime(400 + b * 2400, now + 0.15);
    },
    stop() {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    },
  };
}

/** Jack pump: air/oil hiss + a metallic clank, pitch shifted per leg scenario. */
export function playJackPump(ctx: MinimalAudioContext, dest: AudioNode, pitchShift: number): void {
  const pitchMul = Math.pow(2, clampSigned(pitchShift) / 6); // ±1 → roughly a minor third
  const now = ctx.currentTime;

  // Hiss
  const hissBuf = createNoiseBuffer(ctx, 0.12, 'white', Math.floor(now * 1000) ^ 0x51ed);
  const hiss = ctx.createBufferSource();
  hiss.buffer = hissBuf;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'highpass';
  hissFilter.frequency.value = 2200;
  const hissEnv = makeEnvelope(ctx, 0.08, 0.005, 0.08);
  hiss.connect(hissFilter);
  hissFilter.connect(hissEnv);
  hissEnv.connect(dest);
  hiss.start();
  hiss.stop(now + 0.14);
  hiss.onended = () => {
    try {
      hiss.disconnect();
      hissFilter.disconnect();
      hissEnv.disconnect();
    } catch {
      /* noop */
    }
  };

  // Metallic clank: two slightly detuned short sine bursts.
  for (const ratio of [1, 2.01]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 260 * pitchMul * ratio;
    const env = makeEnvelope(ctx, ratio === 1 ? 0.14 : 0.06, 0.002, 0.1);
    osc.connect(env);
    env.connect(dest);
    osc.start();
    osc.stop(now + 0.13);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }
}

function clampSigned(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/** Rising metal resonance swell as the leg nears target — intensity follows 1 - error/ASSIST_RADIUS. */
export function startNearTargetSwell(ctx: MinimalAudioContext, dest: AudioNode): LoopController {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const oscillators: OscillatorNode[] = [];
  for (const ratio of [1, 2, 3]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 220 * ratio;
    osc.connect(gain);
    osc.start();
    oscillators.push(osc);
  }
  gain.connect(dest);

  return {
    setIntensity(rate01) {
      const v = clamp01(rate01);
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(v * v * 0.1, now + 0.2);
    },
    stop() {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.25);
      for (const osc of oscillators) {
        osc.stop(now + 0.3);
        osc.onended = () => {
          try {
            osc.disconnect();
          } catch {
            /* noop */
          }
        };
      }
      setTimeout(() => {
        try {
          gain.disconnect();
        } catch {
          /* noop */
        }
      }, 400);
    },
  };
}

/** Weighty "KA-KON": low thunk + short metallic ring. Deliberately NOT a cheerful jingle. */
export function playSnap(ctx: MinimalAudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;

  // KA — low thunk (filtered noise burst).
  const thumpBuf = createNoiseBuffer(ctx, 0.1, 'brown', Math.floor(now * 1000) ^ 0x1234);
  const thump = ctx.createBufferSource();
  thump.buffer = thumpBuf;
  const thumpFilter = ctx.createBiquadFilter();
  thumpFilter.type = 'lowpass';
  thumpFilter.frequency.value = 180;
  const thumpEnv = makeEnvelope(ctx, 0.5, 0.001, 0.09);
  thump.connect(thumpFilter);
  thumpFilter.connect(thumpEnv);
  thumpEnv.connect(dest);
  thump.start();
  thump.stop(now + 0.11);
  thump.onended = () => {
    try {
      thump.disconnect();
      thumpFilter.disconnect();
      thumpEnv.disconnect();
    } catch {
      /* noop */
    }
  };

  // KON — short metallic ring, slightly delayed.
  const ringDelay = 0.06;
  for (const [ratio, peak] of [
    [1, 0.22],
    [2.76, 0.12],
    [4.1, 0.06],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 140 * ratio;
    const env = makeEnvelope(ctx, peak, 0.002, 0.35);
    osc.connect(env);
    env.connect(dest);
    osc.start(now + ringDelay);
    osc.stop(now + ringDelay + 0.4);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }
}

/** Wedge sliding into its seat — dry friction noise, brightening as it seats. */
export function playWedgeSlide(ctx: MinimalAudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const buf = createNoiseBuffer(ctx, 0.3, 'pink', Math.floor(now * 1000) ^ 0x7777);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(300, now);
  filter.frequency.linearRampToValueAtTime(1400, now + 0.28);
  const env = makeEnvelope(ctx, 0.16, 0.02, 0.26);
  src.connect(filter);
  filter.connect(env);
  env.connect(dest);
  src.start();
  src.stop(now + 0.32);
  src.onended = () => {
    try {
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    } catch {
      /* noop */
    }
  };
}

/** Hammer impact: deep thud + wood/iron crack. */
export function playHammerImpact(ctx: MinimalAudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;

  const thudBuf = createNoiseBuffer(ctx, 0.15, 'brown', Math.floor(now * 1000) ^ 0x2468);
  const thud = ctx.createBufferSource();
  thud.buffer = thudBuf;
  const thudFilter = ctx.createBiquadFilter();
  thudFilter.type = 'lowpass';
  thudFilter.frequency.value = 140;
  const thudEnv = makeEnvelope(ctx, 0.6, 0.001, 0.13);
  thud.connect(thudFilter);
  thudFilter.connect(thudEnv);
  thudEnv.connect(dest);
  thud.start();
  thud.stop(now + 0.16);
  thud.onended = () => {
    try {
      thud.disconnect();
      thudFilter.disconnect();
      thudEnv.disconnect();
    } catch {
      /* noop */
    }
  };

  const crackBuf = createNoiseBuffer(ctx, 0.05, 'white', Math.floor(now * 1000) ^ 0x1357);
  const crack = ctx.createBufferSource();
  crack.buffer = crackBuf;
  const crackFilter = ctx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.value = 1800;
  const crackEnv = makeEnvelope(ctx, 0.25, 0.001, 0.04);
  crack.connect(crackFilter);
  crackFilter.connect(crackEnv);
  crackEnv.connect(dest);
  crack.start();
  crack.stop(now + 0.06);
  crack.onended = () => {
    try {
      crack.disconnect();
      crackFilter.disconnect();
      crackEnv.disconnect();
    } catch {
      /* noop */
    }
  };
}

const BASE_RESONANT_FREQ = 82.41; // low E2 — warm iron resonance root
/** Detune multipliers for revealBeat index 0..3, converging to 1.0 (in tune) by the 4th beat. */
const REVEAL_CONVERGENCE = [0.82, 0.91, 0.97, 1.0] as const;

/** One of the 4 finalReveal joint-glow strikes; pitch converges toward the resolved root by index 3. */
export function playRevealBeat(ctx: MinimalAudioContext, dest: AudioNode, index: 0 | 1 | 2 | 3): void {
  const now = ctx.currentTime;
  const freq = BASE_RESONANT_FREQ * REVEAL_CONVERGENCE[index];

  const impactBuf = createNoiseBuffer(ctx, 0.08, 'brown', Math.floor(now * 1000) ^ (0x4000 + index));
  const impact = ctx.createBufferSource();
  impact.buffer = impactBuf;
  const impactFilter = ctx.createBiquadFilter();
  impactFilter.type = 'lowpass';
  impactFilter.frequency.value = 220;
  const impactEnv = makeEnvelope(ctx, 0.3, 0.001, 0.07);
  impact.connect(impactFilter);
  impactFilter.connect(impactEnv);
  impactEnv.connect(dest);
  impact.start();
  impact.stop(now + 0.09);
  impact.onended = () => {
    try {
      impact.disconnect();
      impactFilter.disconnect();
      impactEnv.disconnect();
    } catch {
      /* noop */
    }
  };

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const env = makeEnvelope(ctx, 0.24, 0.004, 0.55);
  osc.connect(env);
  env.connect(dest);
  osc.start();
  osc.stop(now + 0.6);
  osc.onended = () => {
    try {
      osc.disconnect();
      env.disconnect();
    } catch {
      /* noop */
    }
  };
}

/** The resolved chord on `settled` — root/fifth/octave sustained softly. */
export function playSettleChord(ctx: MinimalAudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  for (const ratio of [1, 1.5, 2]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = BASE_RESONANT_FREQ * ratio;
    const env = makeEnvelope(ctx, 0.18, 0.02, 1.4);
    osc.connect(env);
    env.connect(dest);
    osc.start();
    osc.stop(now + 1.6);
    osc.onended = () => {
      try {
        osc.disconnect();
        env.disconnect();
      } catch {
        /* noop */
      }
    };
  }
}

/** Very quiet ambient construction-site bed: filtered noise + sparse distant clangs. Deterministic (seeded), pausable via `stop`/restart from the engine. */
export function startAmbientBed(ctx: MinimalAudioContext, dest: AudioNode, seed: number): LoopController {
  const buf = createNoiseBuffer(ctx, 4, 'pink', seed);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  const gain = ctx.createGain();
  gain.gain.value = 0.03;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start();

  const rng = mulberry32(seed ^ 0xabcd);
  let clangTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleClang = (): void => {
    const delay = 4000 + rng() * 7000;
    clangTimer = setTimeout(() => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 300 + rng() * 400;
      const env = makeEnvelope(ctx, 0.025, 0.005, 0.3);
      osc.connect(env);
      env.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      osc.onended = () => {
        try {
          osc.disconnect();
          env.disconnect();
        } catch {
          /* noop */
        }
      };
      scheduleClang();
    }, delay);
  };
  scheduleClang();

  return {
    setIntensity() {
      /* ambient bed intensity is fixed — present for LoopController shape symmetry only */
    },
    stop() {
      if (clangTimer !== undefined) clearTimeout(clangTimer);
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          /* noop */
        }
      };
    },
  };
}

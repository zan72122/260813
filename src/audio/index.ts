// src/audio/index.ts
// Real AudioDirector implementation (src/audio/**), replacing the Wave 1
// no-op stub in src/app/audioStub.ts. 100% Web Audio synthesis — no external
// samples, per MASTER_SPEC / ASSET_MANIFEST. See docs/CONTRACTS.md for the
// exact AudioDirector shape this must implement.

import type { AudioCue, AudioDirector } from '../contracts';
import { NoiseLoopVoice } from './loopVoice';
import { rampGain } from './dsp';
import { playWhistle } from './cues/whistle';
import { playUiTap, playValveResist } from './cues/uiTapAndResist';
import { createValveCreakVoice } from './cues/valveCreak';
import { createPipeRushVoice } from './cues/pipeRush';
import { createSplashVoice, type SplashKind } from './cues/splash';
import { createAmbientVoice, type AmbientVoice } from './cues/ambient';
import { playFinaleChord } from './cues/finale';

type AudioContextCtor = typeof AudioContext;

function resolveAudioContextCtor(): AudioContextCtor | null {
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

class WebAudioDirector implements AudioDirector {
  private readonly ctx: AudioContext | null;
  private readonly muteGain: GainNode | null;
  private _muted = false;

  private valveCreakVoice: NoiseLoopVoice | null = null;
  private pipeRushVoice: NoiseLoopVoice | null = null;
  private splashVoices: Partial<Record<SplashKind, NoiseLoopVoice>> = {};
  private ambientVoice: AmbientVoice | null = null;

  constructor() {
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) {
      // No Web Audio available (unsupported environment) — director degrades
      // to a harmless no-op rather than throwing, so the app still boots.
      this.ctx = null;
      this.muteGain = null;
      return;
    }
    const ctx = new Ctor();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(compressor);

    const muteGain = ctx.createGain();
    muteGain.gain.value = 1;
    muteGain.connect(master);
    this.muteGain = muteGain;
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(v: boolean) {
    this._muted = v;
    if (!this.ctx || !this.muteGain) return;
    rampGain(this.muteGain.gain, v ? 0 : 1, this.ctx, 0.03);
  }

  async unlock(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        // Some browsers reject resume() outside a "fresh" gesture tick;
        // a later unlock() call (next gesture) will retry harmlessly.
      }
    }
  }

  play(cue: AudioCue, opts?: { gain?: number; rate?: number }): void {
    if (!this.ctx || !this.muteGain) return;
    const ctx = this.ctx;
    const dest = this.muteGain;
    switch (cue) {
      case 'whistle':
        playWhistle(ctx, dest, opts);
        return;
      case 'ui-tap':
        playUiTap(ctx, dest, opts);
        return;
      case 'valve-resist':
        playValveResist(ctx, dest, opts);
        return;
      case 'finale-chord':
        playFinaleChord(ctx, dest, opts);
        return;
      case 'valve-creak':
        this.getValveCreak().start();
        return;
      case 'pipe-rush':
        this.getPipeRush().start();
        return;
      case 'fountain-splash-fan':
        this.getSplash('fan').start();
        return;
      case 'fountain-splash-ring':
        this.getSplash('ring').start();
        return;
      case 'fountain-splash-crown':
        this.getSplash('crown').start();
        return;
      case 'ambient-morning':
        this.getAmbient().start();
        return;
      default: {
        const exhaustive: never = cue;
        void exhaustive;
      }
    }
  }

  setIntensity(cue: AudioCue, v: number): void {
    if (!this.ctx) return;
    switch (cue) {
      case 'valve-creak':
        this.getValveCreak().setIntensity(v);
        return;
      case 'pipe-rush':
        this.getPipeRush().setIntensity(v);
        return;
      case 'fountain-splash-fan':
        this.getSplash('fan').setIntensity(v);
        return;
      case 'fountain-splash-ring':
        this.getSplash('ring').setIntensity(v);
        return;
      case 'fountain-splash-crown':
        this.getSplash('crown').setIntensity(v);
        return;
      case 'ambient-morning':
        this.getAmbient().setIntensity(v);
        return;
      // One-shot cues have no continuous intensity — ignored gracefully.
      case 'whistle':
      case 'ui-tap':
      case 'valve-resist':
      case 'finale-chord':
        return;
      default: {
        const exhaustive: never = cue;
        void exhaustive;
      }
    }
  }

  private getValveCreak(): NoiseLoopVoice {
    if (!this.valveCreakVoice) {
      this.valveCreakVoice = createValveCreakVoice(this.ctx as AudioContext, this.muteGain as GainNode);
    }
    return this.valveCreakVoice;
  }

  private getPipeRush(): NoiseLoopVoice {
    if (!this.pipeRushVoice) {
      this.pipeRushVoice = createPipeRushVoice(this.ctx as AudioContext, this.muteGain as GainNode);
    }
    return this.pipeRushVoice;
  }

  private getSplash(kind: SplashKind): NoiseLoopVoice {
    let voice = this.splashVoices[kind];
    if (!voice) {
      voice = createSplashVoice(this.ctx as AudioContext, this.muteGain as GainNode, kind);
      this.splashVoices[kind] = voice;
    }
    return voice;
  }

  private getAmbient(): AmbientVoice {
    if (!this.ambientVoice) {
      this.ambientVoice = createAmbientVoice(this.ctx as AudioContext, this.muteGain as GainNode);
    }
    return this.ambientVoice;
  }
}

/** Builds the real, fully-synthesized AudioDirector. See docs/CONTRACTS.md. */
export function createAudioDirector(): AudioDirector {
  return new WebAudioDirector();
}

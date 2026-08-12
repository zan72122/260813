// src/app/audioStub.ts
// No-op AudioDirector so the app can bootstrap before Worker B implements the
// real Web Audio backend under src/audio/**. main.ts wires this in by default;
// swap in the real implementation there once available.
// Owned by Integrator (src/app/**).

import type { AudioCue, AudioDirector } from '../contracts';

export function createSilentAudioDirector(): AudioDirector {
  return {
    muted: false,
    async unlock(): Promise<void> {
      // no-op: real implementation resumes a Web Audio AudioContext here.
    },
    play(_cue: AudioCue, _opts?: { gain?: number; rate?: number }): void {
      // no-op
    },
    setIntensity(_cue: AudioCue, _v: number): void {
      // no-op
    },
  };
}

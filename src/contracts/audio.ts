// src/contracts/audio.ts
// Implementation owned by Worker B (rendering-audio: src/audio/**).
// Do not edit outside src/contracts/** (see docs/OWNERSHIP.md).

export type AudioCue =
  | 'whistle'
  | 'valve-creak'
  | 'valve-resist'
  | 'pipe-rush'
  | 'fountain-splash-fan'
  | 'fountain-splash-ring'
  | 'fountain-splash-crown'
  | 'ambient-morning'
  | 'finale-chord'
  | 'ui-tap';

export interface AudioDirector {
  /** Must be called from within the first user gesture to unlock AudioContext. */
  unlock(): Promise<void>;
  play(cue: AudioCue, opts?: { gain?: number; rate?: number }): void;
  /** Sets the intensity (0..1) of a continuous cue, e.g. running water. */
  setIntensity(cue: AudioCue, v: number): void;
  muted: boolean;
}

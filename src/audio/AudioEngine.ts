import type { AudioCue, AudioEngine } from '../core';

/**
 * Null-object stub — owner B (rendering-audio) replaces this wholesale with
 * real WebAudio procedural synthesis per docs/CONTRACTS_ADDENDUM.md. Creates
 * no AudioContext yet (avoids autoplay warnings before a real user gesture)
 * and no-ops cue playback.
 */
export class NullAudioEngine implements AudioEngine {
  private muted = false;
  private unlocked = false;

  async unlock(): Promise<void> {
    // TODO(owner B): create/resume AudioContext on first user gesture.
    this.unlocked = true;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  play(_cue: AudioCue): void {
    // TODO(owner B): one-shot procedural synthesis (knock3, lockClick, settleThud, ...).
  }

  setContinuous(_cue: AudioCue, _velocity: number): void {
    // TODO(owner B): continuous cue synthesis (ropeCreak/pulleySpin/woodClatter/flatSlide); silent at velocity 0.
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    // TODO(owner B): close AudioContext, disconnect nodes.
  }
}

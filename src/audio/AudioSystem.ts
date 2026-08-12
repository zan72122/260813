/**
 * STUB — owner B (rendering-audio) owns src/audio/**.
 * Real responsibility: WebAudio procedural synthesis for every AudioCue,
 * velocity-modulated continuous cues, unlock-on-first-gesture, mute.
 * This placeholder creates no AudioContext yet (avoids any autoplay/console
 * warnings before a real user gesture) and no-ops cue playback.
 */
import type { AudioCue } from '../core';

export class AudioSystem {
  private muted = false;
  private unlocked = false;

  async unlock(): Promise<void> {
    // TODO(owner B): create/resume AudioContext on first user gesture.
    this.unlocked = true;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  playCue(_cue: AudioCue, _velocity?: number): void {
    // TODO(owner B): procedural synthesis playback.
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

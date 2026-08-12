// src/game/hintTimer.ts
// Generic idle timer: fires a callback after 3-5s of no relevant activity in
// an interactive phase (whistle-cue / valve-turn / replay-choice), per
// MASTER_SPEC's non-verbal hint requirement. Re-arms with a fresh random
// threshold after each fire so the hint keeps gently repeating while idle.

import { HINT_MAX_SEC, HINT_MIN_SEC } from './timing';

export class HintTimer {
  private idleFor = 0;
  private threshold = HintTimer.randomThreshold();
  private armed = false;

  private static randomThreshold(): number {
    return HINT_MIN_SEC + Math.random() * (HINT_MAX_SEC - HINT_MIN_SEC);
  }

  /** Start (or restart) idle tracking, e.g. when entering an interactive phase. */
  arm(): void {
    this.idleFor = 0;
    this.threshold = HintTimer.randomThreshold();
    this.armed = true;
  }

  /** Stop tracking, e.g. when leaving the phase this timer covers. */
  disarm(): void {
    this.armed = false;
  }

  /** Call on any relevant user activity to postpone the next hint. */
  notifyActivity(): void {
    this.idleFor = 0;
    this.threshold = HintTimer.randomThreshold();
  }

  /** Advance by dt; returns true (once) each time the idle threshold is crossed. */
  tick(dt: number): boolean {
    if (!this.armed) return false;
    this.idleFor += dt;
    if (this.idleFor >= this.threshold) {
      this.idleFor = 0;
      this.threshold = HintTimer.randomThreshold();
      return true;
    }
    return false;
  }
}

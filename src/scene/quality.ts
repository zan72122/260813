/**
 * Adaptive render quality: caps DPR at 2, and steps it down (2 -> 1.5 -> 1)
 * if frame time stays above 40ms for a sustained window. Never steps back
 * up automatically (avoids thrashing) — a fresh page load re-evaluates.
 */
export class AdaptiveQuality {
  private steps: number[];
  private stepIndex = 0;
  private badFrameStreak = 0;
  private readonly badFrameThresholdMs = 40;
  private readonly sustainedBadFrames = 20;

  constructor(deviceDpr: number) {
    const cap = Math.min(deviceDpr, 2);
    this.steps = [cap, 1.5, 1].filter((v, i, arr) => i === 0 || v < arr[i - 1]!);
    if (this.steps[0]! > cap) this.steps[0] = cap;
  }

  get dpr(): number {
    return this.steps[this.stepIndex] ?? 1;
  }

  /** Feed the last frame's duration in milliseconds; returns true if DPR just changed. */
  sampleFrame(frameMs: number): boolean {
    if (frameMs > this.badFrameThresholdMs) {
      this.badFrameStreak++;
    } else {
      this.badFrameStreak = 0;
    }
    if (this.badFrameStreak >= this.sustainedBadFrames && this.stepIndex < this.steps.length - 1) {
      this.stepIndex++;
      this.badFrameStreak = 0;
      return true;
    }
    return false;
  }
}

/**
 * Free-running requestAnimationFrame loop (no fixed timestep accumulator —
 * the transform is progress-driven, not physics-driven, so a variable dt is
 * correct here). dt is delivered in seconds and clamped to avoid spiral-of-death
 * after a tab is backgrounded.
 */
const MAX_DT_SECONDS = 0.25;

export type FrameCallback = (dtSeconds: number, elapsedSeconds: number) => void;

export class RafLoop {
  private handle: number | null = null;
  private lastTimeMs: number | null = null;
  private elapsedSeconds = 0;

  constructor(private readonly callback: FrameCallback) {}

  start(): void {
    if (this.handle !== null) return;
    const tick = (nowMs: number): void => {
      const lastTimeMs = this.lastTimeMs;
      const rawDt = lastTimeMs === null ? 0 : (nowMs - lastTimeMs) / 1000;
      this.lastTimeMs = nowMs;
      const dt = Math.min(Math.max(rawDt, 0), MAX_DT_SECONDS);
      this.elapsedSeconds += dt;
      this.callback(dt, this.elapsedSeconds);
      this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.handle !== null) {
      cancelAnimationFrame(this.handle);
      this.handle = null;
    }
    this.lastTimeMs = null;
  }
}

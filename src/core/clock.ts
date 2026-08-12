/**
 * Wall-clock dt inference for the render side of the app. The fixed-step
 * sim loop lives in `src/app/loop.ts` (integrator-owned) and only ever
 * hands `SceneWorld.updateFromSnapshot(snapshot, alpha)` an interpolation
 * factor, not a dt — so the renderer/visual owner infers its own per-frame
 * dt from successive `updateFromSnapshot`/render calls, exactly like the
 * Wave-2 `StubSceneWorld` placeholder already does for its idle spin.
 * Used to step tweens (`CameraDirector`) and interior springs on the same
 * cadence the frames actually arrive in, clamped so a stalled tab (or the
 * first frame) never injects a huge dt.
 */

/**
 * Longest dt fed to any per-frame tween/spring in one call, seconds (stall
 * guard). Matches `src/app/App.ts`'s own `MAX_FRAME_DELTA_S` so a slow
 * frame (device hitch, not a backgrounded-tab stall) still advances tweens
 * by roughly its real duration instead of silently falling behind.
 */
const MAX_FRAME_DT_S = 0.25;

export class FrameClock {
  private lastMs: number | null = null;

  /** Report the current time (ms, `performance.now()`-shaped) and get back a clamped dt in seconds. */
  tick(nowMs: number): number {
    const previous = this.lastMs;
    this.lastMs = nowMs;
    if (previous === null) return 0;
    const deltaS = (nowMs - previous) / 1000;
    if (!(deltaS >= 0)) return 0;
    return Math.min(deltaS, MAX_FRAME_DT_S);
  }

  /** Forget the last timestamp so the next `tick()` returns 0 (e.g. after a pause/resume gap). */
  reset(): void {
    this.lastMs = null;
  }
}

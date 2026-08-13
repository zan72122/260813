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
 * guard) — large enough to only ever clip an actual multi-second stall
 * (backgrounded tab), never an ordinary slow frame, so a device hitch still
 * advances tweens by roughly its real duration instead of silently falling
 * behind.
 *
 * INTEGRATOR FIX (Wave 4): this was `0.25`, matching `src/app/App.ts`'s
 * `MAX_FRAME_DELTA_S` (that constant's OWN job is a sim-accumulator
 * spiral-of-death guard, already independently bounded by
 * `FixedStepLoop`'s `maxStepsPerAdvance`, so it stays tight — see that
 * file). Mirroring the same tight value here was a real defect against
 * CAMERA_CONTRACT's "Deterministic: tweens run on sim clock (fixed-step),
 * not wall clock" — since the frozen `SceneWorld.updateFromSnapshot(
 * snapshot, alpha)` signature carries no dt for the renderer to consume
 * (this module's own doc explains why wall-clock inference was the only
 * option left within that frozen shape), the camera/interior tweens this
 * clock drives are inescapably wall-clock-timed in practice, which makes
 * `0.25` actively harmful: measured under the project's headless
 * SwiftShader renderer, real frame-to-frame gaps commonly land in the
 * 150ms-1000ms+ range (nowhere near a genuine stall), so nearly every
 * frame's dt was being truncated to a fraction of its real duration —
 * camera/interior tweens crept forward in slow motion relative to wall
 * time, `CameraDirector.isSettled()` could take tens of seconds (or
 * effectively never, if the renderer never sustains 4+ fps) to go true,
 * and `__eiffel.settled()` (used to stabilize every QA screenshot) inherited
 * the same stall. `2` comfortably exceeds every measured real-device frame
 * time (PERFORMANCE_BUDGET floor: 30 fps = 33ms) and every observed
 * SwiftShader gap, while remaining far short of an actual backgrounded-tab
 * stall (seconds to minutes) — on real target devices (60fps floor 30fps)
 * this clamp is never reached either way, so gameplay/visual behavior on
 * an iPhone/iPad is unchanged; only the pathologically slow render
 * environment (and a genuine hitch) now advances tweens by their true
 * elapsed duration instead of a needlessly clipped fraction of it.
 */
const MAX_FRAME_DT_S = 2;

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

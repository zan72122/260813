/**
 * Integrator-owned debug hooks — deliberately NOT part of the frozen
 * `contracts/testing.ts` `TestApi` surface. Both are additive-only
 * `declare global` augmentations (matching contracts/testing.ts's own
 * pattern), never referenced by production wiring logic itself.
 *
 * `__eiffelContextLost`: `RenderSystem.contextLost()` (src/render/index.ts)
 * has no equivalent in `TestApi`, but tests/e2e/full-loop.spec.ts's WebGL
 * context-loss/recovery scenario needs to observe it deterministically
 * (polling pixels alone can't distinguish "still lost" from "restored but
 * not yet redrawn").
 *
 * `__eiffelFastForward`: a game-logic-only bulk ticker, bypassing
 * `render.stepFrames`. `TestApi.step(frames)` deliberately keeps its
 * documented "fixed logical+render steps" pairing intact (see
 * src/app/testApi.ts) for any consumer that relies on that contract text
 * literally — real per-frame rendering, one WebGL draw per logical step.
 * That pairing is exactly what makes bulk-advancing something like a full
 * sand-depletion phase (several hundred fixed steps, no shortcut — see
 * legModel.ts's monotonic, dt-integrated design) prohibitively slow in
 * *this* environment specifically (headless/software-GL: empirically
 * ~50-170ms per real draw call here, vs. sub-millisecond for the pure-JS
 * state-machine tick alone). Game LOGIC correctness never depends on
 * rendering, so tests/e2e's bulk phases use this to advance state at the
 * real FIXED_DT rate (identical ticks to production — never a larger,
 * artificial dt) without paying a draw call for every single one, then
 * call the real `step()` a handful of times afterward to let the
 * render-owned camera/pulse/effect animations (which genuinely do need
 * individually-rendered frames to ease/decay correctly) catch up before any
 * visual or `settled()` assertion. No production code path ever calls this.
 */
declare global {
  interface Window {
    __eiffelContextLost?: () => boolean;
    __eiffelFastForward?: (frames: number) => void;
  }
}

export function exposeContextLostDebug(fn: () => boolean): void {
  window.__eiffelContextLost = fn;
}

export function exposeFastForwardDebug(fn: (frames: number) => void): void {
  window.__eiffelFastForward = fn;
}

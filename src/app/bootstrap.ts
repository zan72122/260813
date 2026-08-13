/**
 * Wave 4 integration bootstrap — the ONLY place every owner domain gets
 * constructed and wired together. Per ARCHITECTURE_CONTRACT.md's module
 * boundary table, src/app is "組み立て・配線のみ" (assembly/wiring only): every
 * behavior below is a direct call into an owner's public API
 * (src/{render,game,input,ui,audio}/index.ts) or the frozen contracts —
 * nothing here reimplements owner logic.
 *
 * ## Bootstrap order
 * 1. `index.html`'s inline critical CSS has already painted `#boot-loading`
 *    before this module even starts executing (zero-JS, instant paint).
 * 2. WebGL2 capability check — fail closed into `showErrorFallback` before
 *    touching any owner module that assumes WebGL2 exists.
 * 3. Construct bus/handles/game/audio/ui/render, then wire every
 *    cross-domain callback (replay, pause, sound, visibility, reduced
 *    motion) and `attachInput`. `ui.showLoading(1)` is called the moment
 *    render construction returns — every asset is procedurally generated
 *    synchronously at construction (no async loading to report partial
 *    progress for), so "loading" is complete by definition at that point;
 *    this is what reveals the start badge and arms its first-tap handler.
 * 4. Start the frame loop(s) — see "Engine loop ownership" below — and
 *    resolve `window.__eiffel.ready` on the first real rendered frame.
 * 5. `ui.ready()` (first user tap) → `audio.unlock()` → the `advance`
 *    Intent that actually leaves `boot` for `establish`.
 *
 * ## Engine loop ownership (no double RAF)
 * `src/render/index.ts`'s own doc comment draws the line precisely: its
 * internal `core/engineLoop.ts` instance is for RENDER-side work only
 * (camera easing, effect pulses, the actual draw call) and explicitly
 * defers driving `game.tick` to "whatever mechanism [the integrator]
 * chooses... their own use of core/engineLoop.ts". Two constraints make the
 * composition here the only one that actually works:
 *
 *   - `RenderSystem.stepFrames()` is a no-op unless the RenderSystem's
 *     *internal* loop was itself constructed in fixedStep mode, which is
 *     decided by reading `?fixedStep=1` from `location.search` *inside*
 *     `createRenderSystem` — `RenderSystemOptions` has no override for it.
 *     So in production (no `?fixedStep=1`), `RenderSystem.start()` is the
 *     only way to ever get a frame drawn — its self-driving RAF is
 *     unavoidable and untouchable from outside.
 *   - `GameController.tick(dt)` never self-schedules anything (by design —
 *     see src/game/index.ts's doc comment); some external caller must call
 *     it once per fixed step.
 *
 *   Given those two facts, the composition is mode-dependent:
 *
 *   - **`?fixedStep=1` (test) mode**: NEITHER loop self-runs.
 *     `RenderSystem.start()` is called (per its own doc, this is a no-op
 *     mode toggle here — it does not schedule anything), and this module
 *     never creates its own self-driving loop either. The ONLY thing that
 *     ever advances time is `TestApi.step(frames)` (src/app/testApi.ts),
 *     which calls `game.tick(FIXED_DT)` then `render.stepFrames(1)` once
 *     per frame, `frames` times, fully synchronously. This satisfies "in
 *     `?fixedStep=1` mode nothing self-advances" exactly.
 *   - **normal mode**: `RenderSystem.start()` owns the ONE rendering RAF
 *     (camera/effects/draw — this module never reimplements or shadows any
 *     part of it). This module additionally creates exactly one more
 *     `core/engineLoop.ts` instance — reusing the same generic primitive
 *     the render owner itself is built on, never a hand-rolled
 *     `requestAnimationFrame` call of our own — whose *only* job is
 *     `tick(dt) => game.tick(dt)` with an empty `render()` callback (all
 *     drawing stays exclusively inside RenderSystem's own loop). That is
 *     two independent, single-purpose self-driving loops, each owning
 *     exactly one concern with zero overlap: neither ever ticks game logic
 *     twice for the same frame, and neither ever issues a second draw call
 *     for the same frame. `core/engineLoop.ts`'s own hidden-tab handling
 *     (accumulator freeze on `visibilitychange`, no catch-up burst on
 *     resume) applies independently and for free to both.
 *
 * ## `window.__eiffel.ready` semantics
 * contracts/testing.ts: "True once the scene has completed its first
 * render." — deliberately independent of `ui.ready()`'s first-tap gate, so
 * Playwright can start driving (`drive.advance()`, `step()`) immediately
 * without ever touching the DOM loading screen. In fixedStep mode this is
 * synchronous and exact: `render.stepFrames(1)` is called once at the end
 * of bootstrap and `ready` flips true immediately after. In normal mode,
 * `RenderSystem.start()`'s internal RAF callback isn't observable from
 * here, so a double-`requestAnimationFrame` is used instead — a standard,
 * reliable "wait for one frame to have actually been presented" technique:
 * by the time the *second* rAF callback fires, every rAF callback
 * registered before it for the current frame cycle (including
 * RenderSystem's own internal one, registered earlier by `.start()`) has
 * already run. This is a one-shot readiness probe, not a persistent loop —
 * it does not conflict with the single-purpose-loop rule above.
 */
import { TypedEventBus } from '../contracts/events';
import { DefaultHandleRegistry } from '../contracts/handles';
import type { GameState } from '../contracts/types';
import { FIXED_DT } from '../contracts/constants';
import { createEngineLoop } from '../core';
import { createGame } from '../game';
import { attachInput } from '../input';
import { createRenderSystem } from '../render';
import { createAudio } from '../audio';
import { createUI, showErrorFallback } from '../ui';
import { supportsWebGL2 } from './webgl';
import { readFixedStepParam } from './url';
import { buildTestApi, buildUnavailableTestApi } from './testApi';
import { exposeContextLostDebug, exposeFastForwardDebug } from './debug';

function requireElement<T extends Element>(id: string, guard: (el: Element) => el is T): T {
  const el = document.getElementById(id);
  if (!el || !guard(el)) {
    // index.html is Integrator-owned and always provides these elements —
    // this only guards against a genuinely broken document (e.g. a
    // misconfigured test harness), never expected to trigger in production.
    throw new Error(`missing required element #${id}`);
  }
  return el;
}

const isCanvas = (el: Element): el is HTMLCanvasElement => el instanceof HTMLCanvasElement;
const isDiv = (el: Element): el is HTMLDivElement => el instanceof HTMLDivElement;

/** Runs the full bootstrap sequence described in this module's doc comment. Call once, at startup. */
export function bootstrap(): void {
  const appRoot = requireElement('app', isDiv);
  const canvas = requireElement('scene', isCanvas);
  const bootLoading = document.getElementById('boot-loading');

  if (!supportsWebGL2()) {
    bootLoading?.remove();
    canvas.remove();
    showErrorFallback(appRoot, 'webgl');
    window.__eiffel = buildUnavailableTestApi();
    return;
  }

  const fixedStepMode = readFixedStepParam();
  const reducedMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bus = new TypedEventBus();
  const handles = new DefaultHandleRegistry();
  const game = createGame({ bus, reducedMotion });
  const getState = (): GameState => game.getState();

  const audio = createAudio({ bus, getState });

  const ui = createUI({
    root: appRoot,
    bus,
    handles,
    getState,
    onReplay: () => {
      game.replay();
    },
    onPauseChange: (paused) => {
      if (paused) game.pause();
      else game.resume();
    },
    onSoundChange: (on) => {
      audio.setEnabled(on);
      game.setSound(on);
    },
    reducedMotion,
  });

  // The richer, progress-driven loading screen (created above) now owns the
  // loading experience — the zero-JS pre-paint placeholder has done its job.
  bootLoading?.remove();

  const render = createRenderSystem({ canvas, bus, handles, getState });

  // Every asset here is procedurally generated at construction time — there
  // is no async loading to report partial progress for — so "loading" is
  // simply complete the moment scene construction above returns. This is
  // what reveals src/ui's pulsing start badge (loadingScreen.ts's
  // `setProgress(1)` → `showStart()`) and wires its first-tap handler;
  // without this call the loading screen would show its tower-silhouette
  // art forever and the game could never be started by a real player.
  ui.showLoading(1);

  attachInput({ root: canvas, handles, sink: game, getState });

  // PRODUCT_SPEC "visibilitychange含む" pause: auto-pause on backgrounding,
  // never auto-resume (a returning player taps the resume badge — the same
  // deliberate gesture as a manual pause, matching invariant §7's "no state
  // lost" without ever resuming gameplay behind the player's back).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
  });

  const { api, markReady } = buildTestApi({ game, render, fixedStepMode });
  window.__eiffel = api;
  exposeContextLostDebug(() => render.contextLost());
  if (fixedStepMode) {
    // Debug-only bulk ticker for tests/e2e — see src/app/debug.ts's doc
    // comment for why this exists alongside (never instead of) the real
    // `TestApi.step()`. Guarded to fixedStepMode for the same reason
    // `step()` itself is: outside it, game logic is already being driven by
    // the self-driving loop below, so an external bulk-tick would double-
    // drive it.
    exposeFastForwardDebug((frames) => {
      for (let i = 0; i < frames; i++) game.tick(FIXED_DT);
    });
  }

  if (!fixedStepMode) {
    // The one additional self-driving loop for game logic — see this
    // module's doc comment "Engine loop ownership" for why this, and only
    // this, is safe alongside RenderSystem's own self-driving loop.
    createEngineLoop({
      tick: (dt) => {
        game.tick(dt);
      },
      render: () => undefined,
    }).start();
  }

  render.start();

  if (fixedStepMode) {
    render.stepFrames(1);
    markReady();
  } else {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        markReady();
      });
    });
  }

  void ui.ready().then(async () => {
    await audio.unlock();
    game.applyIntent({ type: 'advance' });
  });
}

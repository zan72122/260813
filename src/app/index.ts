// src/app/index.ts
// Wires every owner module together and drives the single rAF loop.
// Owned by Foundation (skeleton, Wave 2) / Integrator (final wiring, Wave 4).
// FROZEN during Wave 3 — parallel owners must not edit this file.

import { createAnchorRegistry } from '../contracts/anchors';
import { createAudio } from '../audio';
import { createEventBus } from '../contracts/bus';
import { createGame } from '../game';
import { advance, createInitialState } from '../contracts/machine';
import { createRenderer } from '../core';
import { createStore } from '../contracts/store';
import { createUi } from '../ui';
import type { Anchor, GamePhase } from '../contracts/types';

interface GameTestApi {
  getState: () => ReturnType<typeof createInitialState>;
  dispatch: (to: GamePhase) => boolean;
  setPhase: (to: GamePhase) => void;
  sceneReady: boolean;
  settled: () => boolean;
  stats: () => { drawCalls: number; triangles: number; fps: number };
  seed: number;
  // ---- Integrator (Wave 4) additions below: append-only, non-breaking. ----
  // See docs/ARCHITECTURE_CONTRACT.md "テスト可能性契約" and tests/e2e/*.
  /** Every anchor currently published by the renderer (screen-space px), so
   *  E2E can drive real pointer gestures at the actual on-screen target. */
  anchors: () => Anchor[];
  /** Total EventBus listener count (contracts/bus.ts), for leak.spec.ts. */
  listenerCount: () => number;
  /** Net outstanding window.setTimeout timers app-wide, for leak.spec.ts. */
  timerCount: () => number;
}

declare global {
  interface Window {
    __game?: GameTestApi;
  }
}

interface ParsedParams {
  seed: number;
  test: boolean;
  reducedMotion: boolean;
}

function parseParams(): ParsedParams {
  const url = new URL(window.location.href);
  const seedParam = url.searchParams.get('seed');
  const parsedSeed = seedParam !== null && seedParam !== '' ? Number(seedParam) : NaN;
  const seed = Number.isFinite(parsedSeed) ? parsedSeed : Math.floor(Math.random() * 1_000_000);
  const test = url.searchParams.get('test') === '1';
  const reducedParam = url.searchParams.get('reduced') === '1';
  const prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { seed, test, reducedMotion: reducedParam || prefersReduced };
}

const FIXED_STEP_MS = 1000 / 60;
const RESIZE_DEBOUNCE_MS = 200;

/**
 * Integrator (Wave 4) instrumentation: wraps window.setTimeout/clearTimeout to
 * track the net count of outstanding timers app-wide, exposed via
 * window.__game.timerCount() for tests/e2e/leak.spec.ts. Every owner's timer
 * usage already goes through window.setTimeout (src/ui/index.ts and this
 * file's own resize debounce) — this is a passive counter, not a behavior
 * change, and every call still delegates to the native implementation.
 */
function installTimerCounter(): () => number {
  let count = 0;
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);

  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
    count += 1;
    const id = nativeSetTimeout(
      (...cbArgs: unknown[]) => {
        count = Math.max(0, count - 1);
        if (typeof handler === 'function') handler(...cbArgs);
      },
      timeout,
      ...args,
    );
    return id as unknown as number;
  }) as typeof window.setTimeout;

  window.clearTimeout = ((id?: Parameters<typeof window.clearTimeout>[0]): void => {
    if (id !== undefined && id !== null) count = Math.max(0, count - 1);
    nativeClearTimeout(id);
  }) as typeof window.clearTimeout;

  return () => count;
}

/** UX's pause overlay (docs/handoffs/ux.md "Pause contract") sets this side-
 * channel flag since createUi()'s frozen signature has no way to reach the
 * shared rAF loop directly. The app is the one place that *does* own that
 * loop, so this is where pause is actually honored (see frame() below). */
function isUiPaused(): boolean {
  return (window as unknown as { __uiPaused?: boolean }).__uiPaused === true;
}

export function createApp(): void {
  const { seed, test, reducedMotion } = parseParams();

  const getTimerCount = installTimerCounter();

  const bus = createEventBus();
  const store = createStore(createInitialState(seed, { reducedMotion }));
  const anchors = createAnchorRegistry();

  const appRoot = document.querySelector<HTMLElement>('[data-testid="app-root"]');
  const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="game-canvas"]');
  const uiRoot = document.getElementById('ui');
  if (!appRoot || !canvas || !uiRoot) {
    throw new Error('app: required DOM nodes are missing from index.html');
  }

  const renderer = createRenderer({ canvas, store, bus, anchors });
  const game = createGame({ store, bus, anchors, element: appRoot });
  const ui = createUi({ root: uiRoot, store, bus, anchors });
  const audio = createAudio({ bus, store });

  installErrorOverlay(appRoot);

  // Audit finding #3: the 'lever' anchor the renderer publishes during
  // 'title' is a decorative 3D object's screen projection (src/scene/
  // index.ts's startLever), which does not track the actual clickable
  // target — the title-start button is a plain DOM element positioned by
  // CSS flex layout (src/styles/components.css's .screen-title), entirely
  // independent of the 3D camera framing. Nothing in Input/Gameplay ever
  // hit-tests 'lever' during title: the button owns its own click listener
  // and bypasses the anchor system entirely (src/ui/index.ts), and
  // hintForPhase() returns null for 'title' (src/ui/hints.ts). So the
  // registry entry is only ever read as a diagnostic, via
  // window.__game.anchors() — the fix is scoped to that read-only surface
  // rather than the shared AnchorRegistry itself, which the renderer keeps
  // writing to every frame regardless of this override; mutating the
  // registry in place here would just get overwritten again on core's very
  // next independent rAF tick (two separate rAF loops racing over the same
  // map entry), which isn't worth taking on for a read-only diagnostic.
  // While 'title' is the active phase, splice the DOM button's own live
  // center into the published list in its place, so window.__game.anchors()
  // always reflects a real, currently-clickable on-screen target — in every
  // phase, title included.
  const titleStartButton = uiRoot.querySelector<HTMLElement>('[data-testid="title-start"]');
  function publishedAnchors(): Anchor[] {
    const list = anchors.all();
    if (store.get().phase !== 'title' || !titleStartButton) return list;
    const rect = titleStartButton.getBoundingClientRect();
    const domLever: Anchor = {
      id: 'lever',
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      r: Math.max(rect.width, rect.height) / 2,
      active: true,
    };
    const idx = list.findIndex((a) => a.id === 'lever');
    if (idx === -1) return [...list, domLever];
    const next = list.slice();
    next[idx] = domLever;
    return next;
  }

  window.__game = {
    getState: () => store.get(),
    dispatch: (to) => advance(store, bus, to),
    setPhase: (to) => {
      const from = store.get().phase;
      store.set({ phase: to });
      bus.emit('phase:enter', { phase: to, from });
    },
    sceneReady: false,
    settled: () => renderer.isSettled(),
    stats: () => renderer.getStats(),
    seed,
    anchors: () => publishedAnchors(),
    listenerCount: () => bus.listenerCount(),
    timerCount: () => getTimerCount(),
  };

  let running = false;
  let rendererReady = false;
  let rafId = 0;
  let lastTime = 0;

  function frame(now: number): void {
    if (!running) return;
    const dt = test ? FIXED_STEP_MS : Math.min(now - lastTime || FIXED_STEP_MS, 100);
    lastTime = now;
    // Honor UX's pause contract (docs/handoffs/ux.md): the pause overlay
    // already blocks input, but gameplay's own autonomous progress (e.g.
    // climb's "let go and it keeps climbing") is only actually halted by not
    // ticking game.update() at all. The renderer keeps its own loop running
    // so the dimmed scene behind the overlay stays visibly alive.
    if (!isUiPaused()) game.update(dt);
    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !rendererReady) return;
    running = true;
    lastTime = performance.now();
    renderer.start();
    rafId = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    renderer.stop();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  let resizeTimer = 0;
  function onResize(): void {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderer.resize(), RESIZE_DEBOUNCE_MS);
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  // Single-owner fix (audit finding #1): webglcontextlost/restored used to be
  // wired TWICE on `canvas` — once here and once inside src/core/index.ts's
  // createRenderer() (event.preventDefault() + its own `contextLost` flag +
  // resize()-on-restore). Per docs/ARCHITECTURE_CONTRACT.md ("webglcontext
  // lost/restored で復旧（core担当、app結線）"), core alone owns the actual
  // GL-level recovery — it already calls preventDefault() (required exactly
  // once for the browser to attempt automatic restoration; core's own call
  // satisfies that) and its own resize() internally on restore, so this
  // app-level pair added nothing but a second, redundant resize() pass and a
  // second no-op preventDefault(). "app結線" (app wires it up) is satisfied
  // by app simply constructing the renderer against `canvas` above — app has
  // no further recovery role to play here. There is also nothing for app's
  // own rAF loop to pause/resume for: `game.update()` (below) never touches
  // the WebGL context, so gameplay state safely keeps advancing through a
  // (typically brief) context loss and the resumed renderer just picks up
  // rendering the current state on the next frame — the one loop that *does*
  // need pausing around an external interruption is already handled by the
  // `visibilitychange` listener below, a separate concern. Verified this
  // removal doesn't regress tests/e2e/resilience.spec.ts's (e) WebGL
  // context-loss/restore scenario.

  window.addEventListener(
    'pointerdown',
    () => {
      void audio.unlock();
    },
    { once: true },
  );

  renderer.ready
    .then(() => {
      rendererReady = true;
      if (window.__game) window.__game.sceneReady = true;
      advance(store, bus, 'title');
      start();
    })
    .catch(() => {
      showErrorOverlay(appRoot);
    });

  window.addEventListener('beforeunload', () => {
    stop();
    game.dispose();
    ui.dispose();
    audio.dispose();
    renderer.dispose();
  });
}

function installErrorOverlay(root: HTMLElement): void {
  window.addEventListener('error', () => showErrorOverlay(root));
  window.addEventListener('unhandledrejection', () => showErrorOverlay(root));
}

function showErrorOverlay(root: HTMLElement): void {
  let overlay = root.querySelector<HTMLDivElement>('[data-testid="error-fallback"]');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'error-fallback');
    overlay.innerHTML =
      '<svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M12 7v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="12" cy="16.5" r="1.2" fill="currentColor"/>' +
      '</svg>' +
      '<button type="button" aria-label="reload">&#x21bb;</button>';
    const button = overlay.querySelector('button');
    button?.addEventListener('click', () => window.location.reload());
    root.appendChild(overlay);
  }
  overlay.classList.add('visible');
}

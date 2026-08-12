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
import type { GamePhase } from '../contracts/types';

interface GameTestApi {
  getState: () => ReturnType<typeof createInitialState>;
  dispatch: (to: GamePhase) => boolean;
  setPhase: (to: GamePhase) => void;
  sceneReady: boolean;
  settled: () => boolean;
  stats: () => { drawCalls: number; triangles: number; fps: number };
  seed: number;
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

export function createApp(): void {
  const { seed, test, reducedMotion } = parseParams();

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
  };

  let running = false;
  let rendererReady = false;
  let rafId = 0;
  let lastTime = 0;

  function frame(now: number): void {
    if (!running) return;
    const dt = test ? FIXED_STEP_MS : Math.min(now - lastTime || FIXED_STEP_MS, 100);
    lastTime = now;
    game.update(dt);
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

  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
    },
    false,
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      renderer.resize();
    },
    false,
  );

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

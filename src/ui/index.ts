// src/ui/index.ts — UX module (owner: UX, src/ui/**).
// DOM overlay: loading gauge, title plate, hint layer, success flashes,
// complete menu, pause overlay, sound toggle. Pure logic lives in
// hints.ts/pictograms.ts/storage.ts/layout.ts (unit-tested); this file wires
// it to the DOM/store/bus and is intentionally thin at the DOM-plumbing
// level per docs/ARCHITECTURE_CONTRACT.md's testability split.

import { advance, beamShapeFor, mulberry32 } from '../contracts/machine';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';
import type { AnchorId, GamePhase, GameState } from '../contracts/types';
import { placeHintNearAnchor, hintForPhase } from './hints';
import type { HintTarget } from './hints';
import { orientationClassName, selectOrientation } from './layout';
import {
  backArrowIcon,
  buildHintPictogram,
  buildSteamGaugeSvg,
  climbingCraneIcon,
  differentBeamIcon,
  glowingRivetIcon,
  leverIcon,
  pauseIcon,
  playIcon,
  sameBeamIcon,
  speakerIcon,
} from './pictograms';
import { readStoredMuted, writeStoredMuted } from './storage';

export interface UiHandle {
  dispose(): void;
}

const HINT_SIZE = { w: 88, h: 88 };
const CLICK_COOLDOWN_MS = 500;

/** Bus events that deserve a same-frame success ripple, and where to anchor it
 * (undefined => a full-screen warm wash instead of a localized ring). */
const SUCCESS_ANCHOR: Partial<Record<string, AnchorId>> = {
  'snap:hook': 'hook',
  'snap:align': 'ghost',
  'rivet:inserted': 'rivetHole',
  'rivet:formed': 'hammerSpot',
  'rivet:cooled': 'rivetHole',
  'sling:released': 'slingClasp',
};

export function createUi(o: {
  root: HTMLElement;
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
}): UiHandle {
  const { root, store, bus, anchors } = o;

  const testMode = new URLSearchParams(window.location.search).get('test') === '1';
  document.documentElement.classList.toggle('test-fast', testMode);
  document.documentElement.classList.toggle('reduced-motion', store.get().prefs.reducedMotion);

  const timers = new Set<number>();
  function after(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  function debounced(fn: () => void, cooldownMs = CLICK_COOLDOWN_MS): () => void {
    // -Infinity (not 0) so the very first call is never swallowed — a click
    // arriving within `cooldownMs` of navigation start would otherwise look
    // "too soon after time zero" against performance.now().
    let last = -Infinity;
    return () => {
      const now = performance.now();
      if (now - last < cooldownMs) return;
      last = now;
      fn();
    };
  }

  // ------------------------------------------------------------------ loading

  const loading = document.createElement('div');
  loading.setAttribute('data-testid', 'loading-screen');
  loading.className = 'screen screen-loading';
  loading.innerHTML =
    '<div class="loading-plate">' +
    `<div class="steam-gauge">${buildSteamGaugeSvg()}</div>` +
    `<div class="loading-label">${climbingCraneIcon()}</div>` +
    '</div>';
  root.appendChild(loading);

  // ------------------------------------------------------------------ title

  const title = document.createElement('div');
  title.setAttribute('data-testid', 'title-screen');
  title.className = 'screen screen-title';
  title.hidden = true;
  title.innerHTML =
    '<div class="logotype">エッフェル塔をのぼる<span class="logotype-sub">蒸気クレーン</span></div>';
  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.setAttribute('data-testid', 'title-start');
  startButton.setAttribute('aria-label', 'start');
  startButton.className = 'title-plate hit-area';
  startButton.innerHTML = leverIcon();
  title.appendChild(startButton);
  root.appendChild(title);

  const onStartClick = debounced(() => {
    advance(store, bus, 'opening');
  });
  startButton.addEventListener('click', onStartClick);

  // ------------------------------------------------------------------ sound toggle

  const soundToggle = document.createElement('button');
  soundToggle.type = 'button';
  soundToggle.setAttribute('data-testid', 'sound-toggle');
  soundToggle.setAttribute('aria-label', 'sound');
  soundToggle.className = 'corner-button sound-toggle hit-area';
  root.appendChild(soundToggle);

  let lastRenderedMuted: boolean | null = null;
  function renderSoundToggle(muted: boolean): void {
    if (muted === lastRenderedMuted) return;
    lastRenderedMuted = muted;
    soundToggle.innerHTML = speakerIcon(muted);
    soundToggle.classList.toggle('muted', muted);
  }

  const storedMuted = readStoredMuted();
  if (storedMuted !== null && storedMuted !== store.get().audio.muted) {
    const audio = store.get().audio;
    store.set({ audio: { ...audio, muted: storedMuted } });
  }
  renderSoundToggle(store.get().audio.muted);

  const onSoundToggle = debounced(() => {
    const audio = store.get().audio;
    const muted = !audio.muted;
    store.set({ audio: { ...audio, muted } });
    writeStoredMuted(muted);
  }, 250);
  soundToggle.addEventListener('click', onSoundToggle);

  // ------------------------------------------------------------------ pause

  const pauseToggle = document.createElement('button');
  pauseToggle.type = 'button';
  pauseToggle.setAttribute('data-testid', 'pause-toggle');
  pauseToggle.setAttribute('aria-label', 'pause');
  pauseToggle.className = 'corner-button pause-toggle hit-area';
  pauseToggle.innerHTML = pauseIcon();
  root.appendChild(pauseToggle);

  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'pause-overlay';
  pauseOverlay.hidden = true;
  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.setAttribute('aria-label', 'resume');
  resumeButton.className = 'pause-resume hit-area';
  resumeButton.innerHTML = playIcon();
  pauseOverlay.appendChild(resumeButton);
  root.appendChild(pauseOverlay);

  let paused = false;

  // The overlay is visually opaque and DOM-topmost, so it already intercepts
  // pointer hit-testing over the canvas. Gameplay may additionally attach its
  // pointer listeners on the shared `appRoot` element (an ancestor of this
  // overlay) rather than the canvas alone, so we also stop propagation on the
  // way up to be robust either way — see docs/handoffs/ux.md for the exact
  // contract this establishes for the Wave 4 integrator / Gameplay owner.
  function blockWhilePaused(event: Event): void {
    if (!paused) return;
    event.stopPropagation();
  }
  pauseOverlay.addEventListener('pointerdown', blockWhilePaused);
  pauseOverlay.addEventListener('pointerup', blockWhilePaused);
  pauseOverlay.addEventListener('pointermove', blockWhilePaused);
  pauseOverlay.addEventListener('click', blockWhilePaused);

  function setPaused(next: boolean): void {
    paused = next;
    pauseOverlay.hidden = !paused;
    pauseToggle.innerHTML = paused ? playIcon() : pauseIcon();
    pauseToggle.setAttribute('aria-label', paused ? 'resume' : 'pause');
    (window as unknown as { __uiPaused?: boolean }).__uiPaused = paused;
  }

  const onPauseToggle = debounced(() => setPaused(!paused), 300);
  pauseToggle.addEventListener('click', onPauseToggle);
  const onResume = debounced(() => setPaused(false), 300);
  resumeButton.addEventListener('click', onResume);

  const HIDE_PAUSE_ON: ReadonlySet<GamePhase> = new Set(['loading', 'title', 'complete']);

  // ------------------------------------------------------------------ back-to-complete

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.setAttribute('data-testid', 'back-to-complete');
  backButton.setAttribute('aria-label', 'back');
  backButton.className = 'back-button hit-area';
  backButton.innerHTML = backArrowIcon();
  root.appendChild(backButton);

  const onBack = debounced(() => {
    advance(store, bus, 'complete');
  });
  backButton.addEventListener('click', onBack);

  // ------------------------------------------------------------------ hint layer

  const hintLayer = document.createElement('div');
  hintLayer.setAttribute('data-testid', 'hint-layer');
  const hintPictogram = document.createElement('div');
  hintPictogram.className = 'hint-pictogram';
  hintLayer.appendChild(hintPictogram);
  root.appendChild(hintLayer);

  let currentHintTarget: HintTarget | null = null;
  let hintRaf = 0;
  let lastHintX = Number.NaN;
  let lastHintY = Number.NaN;

  function tickHint(): void {
    hintRaf = 0;
    if (!currentHintTarget) return;
    const anchor = anchors.get(currentHintTarget.anchor);
    if (anchor && anchor.active) {
      const viewport = { w: root.clientWidth || window.innerWidth, h: root.clientHeight || window.innerHeight };
      const pos = placeHintNearAnchor(anchor, viewport, HINT_SIZE);
      if (pos.x !== lastHintX || pos.y !== lastHintY) {
        hintPictogram.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        lastHintX = pos.x;
        lastHintY = pos.y;
      }
      hintPictogram.classList.add('visible');
    } else {
      hintPictogram.classList.remove('visible');
    }
    hintRaf = window.requestAnimationFrame(tickHint);
  }

  function setHintTarget(target: HintTarget | null): void {
    const changed =
      target?.anchor !== currentHintTarget?.anchor || target?.gesture !== currentHintTarget?.gesture;
    currentHintTarget = target;
    if (!changed) return;
    hintPictogram.classList.remove('amplify', 'demo');
    for (const cls of Array.from(hintPictogram.classList)) {
      if (cls.startsWith('gesture-')) hintPictogram.classList.remove(cls);
    }
    if (!target) {
      hintPictogram.classList.remove('visible');
      if (hintRaf) {
        window.cancelAnimationFrame(hintRaf);
        hintRaf = 0;
      }
      return;
    }
    hintPictogram.innerHTML = buildHintPictogram(target.gesture);
    hintPictogram.classList.add(`gesture-${target.gesture}`);
    lastHintX = Number.NaN;
    lastHintY = Number.NaN;
    if (!hintRaf) hintRaf = window.requestAnimationFrame(tickHint);
  }

  const offAssistBreathe = bus.on('assist:breathe', ({ anchor }) => {
    if (currentHintTarget?.anchor === anchor) hintPictogram.classList.add('amplify');
  });
  const offAssistPoint = bus.on('assist:point', ({ anchor }) => {
    if (currentHintTarget?.anchor !== anchor) return;
    hintPictogram.classList.remove('demo');
    // Force a reflow so re-adding the class restarts the animation even if
    // a previous demonstration is still finishing.
    void hintPictogram.offsetWidth;
    hintPictogram.classList.add('demo');
    const duration = testMode ? 320 : 1200;
    after(duration, () => hintPictogram.classList.remove('demo'));
  });

  // ------------------------------------------------------------------ success flash

  const flashLayer = document.createElement('div');
  flashLayer.className = 'success-flash-layer';
  root.appendChild(flashLayer);

  function flashLifetimeMs(): number {
    const reduced = store.get().prefs.reducedMotion;
    const base = reduced ? 500 : 1100;
    return testMode ? base * 0.25 : base;
  }

  function triggerFlash(anchorId?: AnchorId): void {
    const wash = document.createElement('div');
    wash.className = 'success-wash';
    flashLayer.appendChild(wash);
    after(flashLifetimeMs(), () => wash.remove());

    const anchor = anchorId ? anchors.get(anchorId) : undefined;
    if (anchor && anchor.active) {
      const ring = document.createElement('div');
      ring.className = 'success-ring';
      ring.style.left = `${anchor.x}px`;
      ring.style.top = `${anchor.y}px`;
      flashLayer.appendChild(ring);
      after(flashLifetimeMs(), () => ring.remove());
    }
  }

  const offSuccessListeners: Array<() => void> = [
    bus.on('snap:hook', () => triggerFlash(SUCCESS_ANCHOR['snap:hook'])),
    bus.on('snap:align', () => triggerFlash(SUCCESS_ANCHOR['snap:align'])),
    bus.on('bolt:seated', ({ index }) => triggerFlash(index === 0 ? 'hole0' : 'hole1')),
    bus.on('rivet:inserted', () => triggerFlash(SUCCESS_ANCHOR['rivet:inserted'])),
    bus.on('rivet:formed', () => triggerFlash(SUCCESS_ANCHOR['rivet:formed'])),
    bus.on('rivet:cooled', () => triggerFlash(SUCCESS_ANCHOR['rivet:cooled'])),
    bus.on('sling:released', () => triggerFlash(SUCCESS_ANCHOR['sling:released'])),
    bus.on('climb:locked', () => triggerFlash()),
    bus.on('reveal:done', () => triggerFlash()),
  ];

  // ------------------------------------------------------------------ complete menu

  const completeMenu = document.createElement('div');
  completeMenu.className = 'complete-menu';
  completeMenu.hidden = true;

  function menuButton(testId: string, label: string, icon: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-testid', testId);
    button.setAttribute('aria-label', label);
    button.className = 'menu-button hit-area';
    button.innerHTML = icon;
    return button;
  }

  const grid = document.createElement('div');
  grid.className = 'menu-grid';
  const replaySameBtn = menuButton('replay-same', 'replay same beam', sameBeamIcon());
  const replayNewBtn = menuButton('replay-new', 'replay new beam', differentBeamIcon());
  const playRivetBtn = menuButton('play-rivet', 'play rivet', glowingRivetIcon());
  const playClimbBtn = menuButton('play-climb', 'play climb', climbingCraneIcon());
  grid.append(replaySameBtn, replayNewBtn, playRivetBtn, playClimbBtn);
  completeMenu.appendChild(grid);
  root.appendChild(completeMenu);

  // Deterministic "new seed" generator: reseeded from the session's initial
  // seed, never Math.random, so ?test=1 stays reproducible even across
  // replay-new presses.
  const seedRand = mulberry32(store.get().seed ^ 0x51ed5eed);

  const onReplaySame = debounced(() => {
    advance(store, bus, 'opening');
  });
  const onReplayNew = debounced(() => {
    const nextSeed = Math.floor(seedRand() * 1_000_000);
    const { towerLevel } = store.get();
    store.set({ seed: nextSeed, beamShape: beamShapeFor(nextSeed, towerLevel) });
    advance(store, bus, 'opening');
  });
  const onPlayRivet = debounced(() => {
    advance(store, bus, 'playRivet');
  });
  const onPlayClimb = debounced(() => {
    advance(store, bus, 'playClimb');
  });
  replaySameBtn.addEventListener('click', onReplaySame);
  replayNewBtn.addEventListener('click', onReplayNew);
  playRivetBtn.addEventListener('click', onPlayRivet);
  playClimbBtn.addEventListener('click', onPlayClimb);

  // ------------------------------------------------------------------ orientation class

  function applyOrientationClass(): void {
    const orientation = selectOrientation(window.innerWidth, window.innerHeight);
    root.classList.remove('orientation-portrait', 'orientation-landscape');
    root.classList.add(orientationClassName(orientation));
  }
  applyOrientationClass();
  window.addEventListener('resize', applyOrientationClass);
  window.addEventListener('orientationchange', applyOrientationClass);

  // ------------------------------------------------------------------ phase-driven render

  function render(state: GameState): void {
    const { phase } = state;
    loading.hidden = phase !== 'loading';
    title.hidden = phase !== 'title';
    completeMenu.hidden = phase !== 'complete';
    backButton.hidden = phase !== 'playRivet' && phase !== 'playClimb';
    pauseToggle.hidden = HIDE_PAUSE_ON.has(phase);
    if (HIDE_PAUSE_ON.has(phase) && paused) setPaused(false);

    renderSoundToggle(state.audio.muted);

    const target = hintForPhase(phase, state);
    setHintTarget(target);
  }

  render(store.get());
  const unsubscribeStore = store.subscribe(render);

  // ------------------------------------------------------------------ dispose

  function dispose(): void {
    unsubscribeStore();
    offAssistBreathe();
    offAssistPoint();
    for (const off of offSuccessListeners) off();

    for (const id of timers) window.clearTimeout(id);
    timers.clear();
    if (hintRaf) window.cancelAnimationFrame(hintRaf);

    window.removeEventListener('resize', applyOrientationClass);
    window.removeEventListener('orientationchange', applyOrientationClass);

    startButton.removeEventListener('click', onStartClick);
    soundToggle.removeEventListener('click', onSoundToggle);
    pauseToggle.removeEventListener('click', onPauseToggle);
    resumeButton.removeEventListener('click', onResume);
    pauseOverlay.removeEventListener('pointerdown', blockWhilePaused);
    pauseOverlay.removeEventListener('pointerup', blockWhilePaused);
    pauseOverlay.removeEventListener('pointermove', blockWhilePaused);
    pauseOverlay.removeEventListener('click', blockWhilePaused);
    backButton.removeEventListener('click', onBack);
    replaySameBtn.removeEventListener('click', onReplaySame);
    replayNewBtn.removeEventListener('click', onReplayNew);
    playRivetBtn.removeEventListener('click', onPlayRivet);
    playClimbBtn.removeEventListener('click', onPlayClimb);

    loading.remove();
    title.remove();
    soundToggle.remove();
    pauseToggle.remove();
    pauseOverlay.remove();
    backButton.remove();
    hintLayer.remove();
    flashLayer.remove();
    completeMenu.remove();
  }

  return { dispose };
}

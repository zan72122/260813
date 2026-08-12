/**
 * Public entry point for the UX (DOM overlay) domain. Single factory:
 * `createUI`. Also re-exports `showErrorFallback`, a standalone helper for
 * the (pre-UI) WebGL-init-failure case — see its own doc comment.
 *
 * Styling: this module imports `../styles/base.css` and
 * `../styles/components.css` itself as side effects, so the integrator
 * does not need to import any CSS directly — just `import { createUI }
 * from './ui'` is enough to get full-viewport layout, safe-area padding,
 * portrait/landscape layouts, and the prefers-reduced-motion kill-switch.
 *
 * Usage (Wave 4 integration):
 * ```ts
 * import { createUI } from './ui';
 * import { createAudio } from './audio';
 *
 * const audio = createAudio({ bus, getState });
 * const ui = createUI({
 *   root: document.getElementById('app')!,
 *   bus, handles, getState,
 *   onReplay: () => bus.emit({ type: 'replayRequested' }), // integrator also drives the actual state reset
 *   onPauseChange: (paused) => { / * integrator calls stateMachine.setPaused + bus.emit({type:'pauseChanged',paused}) * / },
 *   onSoundChange: (on) => { audio.setEnabled(on); bus.emit({ type: 'soundToggled', on }); },
 *   reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
 * });
 *
 * // Drive the loading screen with real asset/scene-ready progress (0..1):
 * ui.showLoading(0.4);
 * ui.showLoading(1); // -> shows the pulsing start badge
 *
 * // Await the player's first tap before resuming the AudioContext and
 * // starting the RAF loop (both require a user gesture / are pointless
 * // before the player has engaged):
 * await ui.ready();
 * await audio.unlock();
 * // ... start the engine loop / emit the 'advance' intent past 'boot' ...
 * ```
 *
 * `onPauseChange`/`onSoundChange` are called from the HUD's own buttons;
 * `createUI` does NOT itself flip `GameState.paused`/`soundOn` — that
 * remains the state machine's job (contracts/stateMachine.ts `setPaused`).
 * `createUI` reflects `paused` back into its own pause overlay by
 * subscribing to the shared `pauseChanged` bus event, so it also stays
 * correct if pause is ever triggered from somewhere else (e.g.
 * `visibilitychange` handled by the integrator).
 */
import '../styles/base.css';
import '../styles/components.css';

import type { EventBus } from '../contracts/events';
import type { HandleRegistry } from '../contracts/handles';
import type { GameState } from '../contracts/types';

import { el } from './domUtil';
import { createLoadingScreen } from './loadingScreen';
import { createHud } from './hud';
import { createPauseOverlay } from './pauseOverlay';
import { createLegProgressOverlay } from './legProgressOverlay';
import { createHintOverlay } from './hintOverlay';
import { createCompletionMenu } from './completionMenu';

export interface CreateUIOptions {
  /** Element the overlay DOM tree is appended into (e.g. `#app`, the same root the renderer's canvas lives in). */
  root: HTMLElement;
  bus: EventBus;
  handles: HandleRegistry;
  getState: () => GameState;
  /** Called when the player taps the completion medallion's REPLAY pictogram. */
  onReplay: () => void;
  /** Called when the HUD pause button is tapped (true) or the pause overlay's resume badge is tapped (false). */
  onPauseChange: (paused: boolean) => void;
  /** Called when the HUD sound toggle changes state. */
  onSoundChange: (on: boolean) => void;
  reducedMotion: boolean;
}

export interface UIHandle {
  /** Drives the loading screen's draw-in animation; p=1 reveals the pulsing start badge. */
  showLoading(p: number): void;
  /** Resolves once the player taps the start badge (first user gesture — the right moment to resume the AudioContext). */
  ready(): Promise<void>;
  dispose(): void;
}

/**
 * Builds every DOM overlay piece (loading/start, HUD corners, pause
 * overlay, leg progress, hint system, completion menu) and wires them to
 * the shared `EventBus`/`HandleRegistry`. Nothing here touches Three.js or
 * any other owner's module directly — only `contracts/*`.
 */
export function createUI(opts: CreateUIOptions): UIHandle {
  const uiRoot = el('div', undefined, { id: 'eiffel-ui-root' });
  opts.root.appendChild(uiRoot);

  const gameLayer = el('div', 'eiffel-layer');
  uiRoot.appendChild(gameLayer);

  const initialState = opts.getState();
  const loading = createLoadingScreen(uiRoot, opts.reducedMotion);
  const hint = createHintOverlay(gameLayer, opts.handles, opts.bus, opts.reducedMotion);
  const pauseOverlay = createPauseOverlay(uiRoot, () => {
    opts.onPauseChange(false);
  });
  const hud = createHud(gameLayer, {
    initialSoundOn: initialState.soundOn,
    onSoundChange: opts.onSoundChange,
    onPauseTap: () => {
      opts.onPauseChange(true);
    },
  });
  const legProgress = createLegProgressOverlay(gameLayer, opts.bus);
  const completion = createCompletionMenu(gameLayer, opts.bus, opts.onReplay);

  const offPauseChanged = opts.bus.on('pauseChanged', (e) => {
    pauseOverlay.setVisible(e.paused);
    if (e.paused) {
      hint.pause();
    } else {
      hint.resume();
    }
  });

  return {
    showLoading(p) {
      loading.setProgress(p);
    },
    ready: () => loading.onStart,
    dispose() {
      offPauseChanged();
      loading.dispose();
      hint.dispose();
      pauseOverlay.dispose();
      hud.dispose();
      legProgress.dispose();
      completion.dispose();
      uiRoot.remove();
    },
  };
}

export { showErrorFallback } from './errorFallback';
export type { ErrorKind, ErrorFallbackHandle } from './errorFallback';

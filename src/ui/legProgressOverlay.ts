/**
 * DOM wrapper around the pure `legProgressReducer` (legProgress.ts):
 * renders 4 tiny leg pictograms and fills/locks each as `legLocked` events
 * arrive, resetting on `replayRequested`.
 */
import type { EventBus } from '../contracts/events';
import { el, setSvg } from './domUtil';
import { legIcon } from './svg';
import { INITIAL_LEG_LOCK_STATE, legProgressReducer } from './legProgress';
import type { LegLockState } from './legProgress';

export interface LegProgressOverlayHandle {
  dispose(): void;
}

export function createLegProgressOverlay(root: HTMLElement, bus: EventBus): LegProgressOverlayHandle {
  const container = el('div', 'eiffel-leg-progress eiffel-interactive', { 'aria-label': 'progress' });
  const icons: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const icon = el('div', 'eiffel-leg-icon');
    setSvg(icon, legIcon(false));
    container.appendChild(icon);
    icons.push(icon);
  }
  root.appendChild(container);

  let state: LegLockState = INITIAL_LEG_LOCK_STATE;

  function render(): void {
    for (let i = 0; i < state.length; i++) {
      const icon = icons[i];
      if (!icon) continue;
      const locked = state[i] ?? false;
      setSvg(icon, legIcon(locked));
      icon.classList.toggle('eiffel-locked', locked);
    }
  }

  const offLocked = bus.on('legLocked', (e) => {
    state = legProgressReducer(state, e);
    render();
  });
  const offReplay = bus.on('replayRequested', (e) => {
    state = legProgressReducer(state, e);
    render();
  });

  return {
    dispose() {
      offLocked();
      offReplay();
      container.remove();
    },
  };
}

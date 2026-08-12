/**
 * Completion menu: warm medallion panel shown after `settled`, with a
 * giant central REPLAY pictogram (>=120px touch target). No competing
 * buttons live here — sound/pause remain in their HUD corners.
 */
import type { EventBus } from '../contracts/events';
import { el, setSvg } from './domUtil';
import { replayIcon } from './svg';

export interface CompletionMenuHandle {
  dispose(): void;
}

export function createCompletionMenu(root: HTMLElement, bus: EventBus, onReplay: () => void): CompletionMenuHandle {
  const container = el('div', 'eiffel-completion', { 'aria-label': 'complete' });
  container.hidden = true;

  const panel = el('div', 'eiffel-completion-panel');
  const button = el('button', 'eiffel-completion-replay eiffel-primary-target eiffel-interactive', {
    'aria-label': 'replay',
    type: 'button',
  });
  setSvg(button, replayIcon());
  panel.appendChild(button);
  container.appendChild(panel);
  root.appendChild(container);

  button.addEventListener('click', () => {
    container.hidden = true;
    onReplay();
  });

  const offSettled = bus.on('settled', () => {
    container.hidden = false;
  });
  const offReplay = bus.on('replayRequested', () => {
    container.hidden = true;
  });

  return {
    dispose() {
      offSettled();
      offReplay();
      container.remove();
    },
  };
}

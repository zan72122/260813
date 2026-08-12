/**
 * Pause overlay: dimmed scene + one big resume badge. Visibility is driven
 * externally (createUI subscribes to the shared `pauseChanged` bus event
 * and calls `setVisible`) rather than owning its own pause state, so it
 * stays correct even if pause is triggered by something other than the
 * HUD button (e.g. `document.visibilitychange` handled elsewhere).
 */
import { el, setSvg } from './domUtil';
import { playIcon } from './svg';

export interface PauseOverlayHandle {
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createPauseOverlay(root: HTMLElement, onResumeTap: () => void): PauseOverlayHandle {
  const container = el('div', 'eiffel-pause-overlay', { 'aria-label': 'paused' });
  container.hidden = true;

  const badge = el('button', 'eiffel-resume-badge eiffel-primary-target', {
    'aria-label': 'resume',
    type: 'button',
  });
  setSvg(badge, playIcon());
  badge.addEventListener('click', () => {
    onResumeTap();
  });

  container.appendChild(badge);
  root.appendChild(container);

  return {
    setVisible(visible) {
      container.hidden = !visible;
    },
    dispose() {
      container.remove();
    },
  };
}

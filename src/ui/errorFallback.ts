/**
 * Error fallback: a friendly static pictographic scene (tower + tools) with
 * a reload button. No error text/jargon anywhere — `kind` only changes the
 * `aria-label` for assistive tech, never visible copy. Independent of
 * `createUI` — meant to be called instead of it when scene/renderer
 * initialization itself fails (e.g. WebGL unavailable), so it has no
 * dependency on EventBus/HandleRegistry/GameState.
 */
import { el, setSvg } from './domUtil';
import { errorScene, reloadIcon } from './svg';

export type ErrorKind = 'webgl' | 'generic';

export interface ErrorFallbackHandle {
  dispose(): void;
}

export function showErrorFallback(root: HTMLElement, kind: ErrorKind): ErrorFallbackHandle {
  const container = el('div', 'eiffel-error-fallback', {
    'aria-label': kind === 'webgl' ? 'graphics-unavailable' : 'error',
  });

  const scene = el('div', 'eiffel-error-scene');
  setSvg(scene, errorScene());

  const button = el('button', 'eiffel-error-reload eiffel-primary-target', {
    'aria-label': 'reload',
    type: 'button',
  });
  setSvg(button, reloadIcon());
  button.addEventListener('click', () => {
    window.location.reload();
  });

  container.appendChild(scene);
  container.appendChild(button);
  root.appendChild(container);

  return {
    dispose() {
      container.remove();
    },
  };
}

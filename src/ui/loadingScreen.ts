/**
 * Loading screen: warm paper-toned backdrop with a tower-silhouette
 * line-art that draws in as `setProgress` advances, then morphs into the
 * pulsing start badge once progress reaches 1. The first tap on the badge
 * resolves `onStart` (awaited by createUI's `ready()`) and fades the whole
 * screen out.
 */
import { el, setSvg } from './domUtil';
import { startBadge, towerSilhouette } from './svg';

export interface LoadingScreenHandle {
  setProgress(p: number): void;
  /** Resolves the first time the user taps the start badge. */
  onStart: Promise<void>;
  dispose(): void;
}

export function createLoadingScreen(root: HTMLElement, reducedMotion: boolean): LoadingScreenHandle {
  const container = el('div', 'eiffel-loading eiffel-interactive', { 'aria-label': 'loading' });
  const art = el('div', 'eiffel-loading-art');
  container.appendChild(art);
  root.appendChild(container);

  let resolveStart!: () => void;
  const onStart = new Promise<void>((resolve) => {
    resolveStart = resolve;
  });

  let started = false;
  let progress = 0;

  function renderTower(): void {
    setSvg(art, towerSilhouette(progress));
  }
  renderTower();

  function onTap(): void {
    if (started) return;
    started = true;
    art.removeEventListener('pointerdown', onTap);
    container.classList.add('eiffel-hidden');
    resolveStart();
    setTimeout(() => {
      container.remove();
    }, 450);
  }

  function showStart(): void {
    art.classList.add('eiffel-start-badge');
    setSvg(art, startBadge(!reducedMotion));
    container.setAttribute('aria-label', 'start');
    art.addEventListener('pointerdown', onTap);
  }

  let startShown = false;
  function setProgress(p: number): void {
    progress = Math.max(0, Math.min(1, p));
    if (progress >= 1) {
      if (!startShown) {
        startShown = true;
        showStart();
      }
    } else {
      renderTower();
    }
  }

  function dispose(): void {
    art.removeEventListener('pointerdown', onTap);
    container.remove();
  }

  return { setProgress, onStart, dispose };
}

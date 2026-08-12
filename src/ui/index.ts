// src/ui/index.ts — UX module (owner: UX, src/ui/**, src/audio/**, src/styles/**).
// Wave 2 note: MINIMAL-BUT-FUNCTIONAL skeleton — loading screen, title screen
// with a big circular start button, and a sound-toggle stub. Wave 3c UX
// replaces internals but MUST keep createUi()'s exported shape frozen.

import { advance } from '../contracts/machine';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';

export interface UiHandle {
  dispose(): void;
}

export function createUi(o: {
  root: HTMLElement;
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
}): UiHandle {
  const { root, store, bus } = o;

  const loading = document.createElement('div');
  loading.setAttribute('data-testid', 'loading-screen');
  loading.className = 'screen screen-loading';
  const gauge = document.createElement('div');
  gauge.className = 'steam-gauge';
  gauge.setAttribute('aria-hidden', 'true');
  loading.appendChild(gauge);
  root.appendChild(loading);

  const title = document.createElement('div');
  title.setAttribute('data-testid', 'title-screen');
  title.className = 'screen screen-title';
  title.hidden = true;

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.setAttribute('data-testid', 'title-start');
  startButton.setAttribute('aria-label', 'start');
  startButton.className = 'title-start';
  startButton.textContent = '▶';
  title.appendChild(startButton);
  root.appendChild(title);

  const soundToggle = document.createElement('button');
  soundToggle.type = 'button';
  soundToggle.setAttribute('data-testid', 'sound-toggle');
  soundToggle.setAttribute('aria-label', 'sound');
  soundToggle.className = 'sound-toggle';
  soundToggle.textContent = '♪';
  root.appendChild(soundToggle);

  function onStartClick(): void {
    advance(store, bus, 'opening');
  }
  startButton.addEventListener('click', onStartClick);

  function onSoundToggle(): void {
    const audio = store.get().audio;
    const muted = !audio.muted;
    store.set({ audio: { ...audio, muted } });
    soundToggle.classList.toggle('muted', muted);
  }
  soundToggle.addEventListener('click', onSoundToggle);

  function render(): void {
    const { phase } = store.get();
    loading.hidden = phase !== 'loading';
    title.hidden = phase !== 'title';
  }
  render();
  const unsubscribe = store.subscribe(render);

  function dispose(): void {
    unsubscribe();
    startButton.removeEventListener('click', onStartClick);
    soundToggle.removeEventListener('click', onSoundToggle);
    loading.remove();
    title.remove();
    soundToggle.remove();
  }

  return { dispose };
}

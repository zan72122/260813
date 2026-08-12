/**
 * Top-corner pause/resume and sound-toggle buttons (PRODUCT_SPEC "Modes &
 * settings"), both ≥72 CSS px.
 */

import { DATA_TESTID } from '../../contracts/testing.ts';
import { pauseGlyph, soundGlyph } from '../icons.ts';

export interface TopBarHandle {
  readonly root: HTMLElement;
  readonly pauseButton: HTMLElement;
  readonly soundButton: HTMLElement;
  setPaused(paused: boolean): void;
  setSoundEnabled(enabled: boolean): void;
}

export function createTopBar(): TopBarHandle {
  const root = document.createElement('div');
  root.className = 'eiffel-top-bar';

  const pauseButton = document.createElement('button');
  pauseButton.type = 'button';
  pauseButton.className = 'eiffel-control eiffel-chrome-button eiffel-pause-button';
  pauseButton.dataset.testid = DATA_TESTID.pauseButton;
  pauseButton.appendChild(pauseGlyph('pause'));

  const soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.className = 'eiffel-control eiffel-chrome-button eiffel-sound-button';
  soundButton.dataset.testid = DATA_TESTID.soundToggle;
  soundButton.appendChild(soundGlyph(true));

  root.append(pauseButton, soundButton);

  function setPaused(paused: boolean): void {
    pauseButton.replaceChildren(pauseGlyph(paused ? 'play' : 'pause'));
  }

  function setSoundEnabled(enabled: boolean): void {
    soundButton.replaceChildren(soundGlyph(enabled));
  }

  return { root, pauseButton, soundButton, setPaused, setSoundEnabled };
}

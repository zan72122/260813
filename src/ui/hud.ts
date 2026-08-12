/**
 * HUD corner controls: sound toggle (top-right) and pause (top-left). Both
 * are pictographic-only buttons carrying an `aria-label` for
 * accessibility; neither renders any visible text.
 */
import { el, setSvg } from './domUtil';
import { pauseIcon, speakerIcon } from './svg';

export interface HudOptions {
  initialSoundOn: boolean;
  onSoundChange: (on: boolean) => void;
  onPauseTap: () => void;
}

export interface HudHandle {
  setSoundOn(on: boolean): void;
  dispose(): void;
}

export function createHud(root: HTMLElement, opts: HudOptions): HudHandle {
  let soundOn = opts.initialSoundOn;

  const soundBtn = el('button', 'eiffel-corner-btn eiffel-corner-tr eiffel-interactive eiffel-hud-sound', {
    'aria-label': 'sound',
    type: 'button',
  });

  function renderSound(): void {
    setSvg(soundBtn, speakerIcon(soundOn));
    soundBtn.setAttribute('aria-pressed', String(soundOn));
  }
  renderSound();

  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    renderSound();
    opts.onSoundChange(soundOn);
  });

  const pauseBtn = el('button', 'eiffel-corner-btn eiffel-corner-tl eiffel-interactive eiffel-hud-pause', {
    'aria-label': 'pause',
    type: 'button',
  });
  setSvg(pauseBtn, pauseIcon());
  pauseBtn.addEventListener('click', () => {
    opts.onPauseTap();
  });

  root.appendChild(soundBtn);
  root.appendChild(pauseBtn);

  return {
    setSoundOn(on) {
      soundOn = on;
      renderSound();
    },
    dispose() {
      soundBtn.remove();
      pauseBtn.remove();
    },
  };
}

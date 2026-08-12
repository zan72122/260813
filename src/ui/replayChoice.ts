// src/ui/replayChoice.ts
// Picture-only replay-choice screen: three large (>=88px) buttons emitting
// ActionIntent 'choice'. Shown only while GamePhase === 'replay-choice'.

import type { AudioDirector, EventBus } from '../contracts';
import {
  createReplayFreeValveIcon,
  createReplayRestartIcon,
  createReplaySameIcon,
} from './icons';

export interface ReplayChoiceScreen {
  readonly element: HTMLElement;
  setVisible(visible: boolean): void;
  dispose(): void;
}

function makeChoiceButton(
  choice: 'same' | 'restart' | 'free-valve',
  icon: SVGSVGElement,
  bus: EventBus,
  audio: AudioDirector,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'vui-choice';
  btn.dataset.choice = choice;
  btn.setAttribute('aria-label', choice);
  btn.append(icon);
  btn.addEventListener('click', () => {
    audio.play('ui-tap', { gain: 0.6 });
    bus.emitIntent({ kind: 'choice', choice });
  });
  return btn;
}

export function createReplayChoiceScreen(bus: EventBus, audio: AudioDirector): ReplayChoiceScreen {
  const container = document.createElement('div');
  container.className = 'vui-replay';

  const row = document.createElement('div');
  row.className = 'vui-replay-row';
  row.append(
    makeChoiceButton('same', createReplaySameIcon(), bus, audio),
    makeChoiceButton('restart', createReplayRestartIcon(), bus, audio),
    makeChoiceButton('free-valve', createReplayFreeValveIcon(), bus, audio),
  );
  container.append(row);

  return {
    element: container,
    setVisible(visible: boolean): void {
      container.classList.toggle('vui-visible', visible);
    },
    dispose(): void {
      container.remove();
    },
  };
}

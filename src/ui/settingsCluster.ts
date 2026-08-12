// src/ui/settingsCluster.ts
// Corner settings cluster: mute toggle + dim-light toggle. Small (~46px) but
// >=44px touch targets, placed away from the main play area (child-proof:
// unlikely to be hit by accident during gameplay taps/drags).

import type { AudioDirector } from '../contracts';
import { createDimLightIcon, createMuteIcon } from './icons';
import { getAccessibilityState, subscribeAccessibility, toggleDimLight } from '../accessibility';

export interface SettingsCluster {
  readonly element: HTMLElement;
  dispose(): void;
}

export function createSettingsCluster(audio: AudioDirector): SettingsCluster {
  const container = document.createElement('div');
  container.className = 'vui-settings';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'vui-btn vui-mute';
  muteBtn.setAttribute('aria-label', 'mute');

  const dimBtn = document.createElement('button');
  dimBtn.type = 'button';
  dimBtn.className = 'vui-btn vui-dim';
  dimBtn.setAttribute('aria-label', 'dim light');

  function renderMuteIcon(): void {
    muteBtn.replaceChildren(createMuteIcon(audio.muted));
    muteBtn.setAttribute('aria-pressed', String(audio.muted));
  }

  function renderDimIcon(): void {
    const dim = getAccessibilityState().dimLight;
    dimBtn.replaceChildren(createDimLightIcon(dim));
    dimBtn.setAttribute('aria-pressed', String(dim));
  }

  function onMuteClick(): void {
    audio.muted = !audio.muted;
    renderMuteIcon();
    if (!audio.muted) audio.play('ui-tap', { gain: 0.5 });
  }

  function onDimClick(): void {
    toggleDimLight();
    audio.play('ui-tap', { gain: 0.5 });
  }

  muteBtn.addEventListener('click', onMuteClick);
  dimBtn.addEventListener('click', onDimClick);

  const unsubscribeAccessibility = subscribeAccessibility(renderDimIcon);

  renderMuteIcon();
  renderDimIcon();

  container.append(muteBtn, dimBtn);

  return {
    element: container,
    dispose(): void {
      muteBtn.removeEventListener('click', onMuteClick);
      dimBtn.removeEventListener('click', onDimClick);
      unsubscribeAccessibility();
      container.remove();
    },
  };
}

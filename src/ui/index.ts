// src/ui/index.ts
// Minimal DOM overlay: corner settings cluster + replay-choice screen. See
// docs/CONTRACTS.md wiring conventions ("Worker C: registerUI(ctx)").

import type { SceneContext } from '../contracts';
import { ensureUiStyles } from './styles';
import { createSettingsCluster } from './settingsCluster';
import { createReplayChoiceScreen } from './replayChoice';

const OVERLAY_ID = 'versailles-ui';

/**
 * Builds and wires the DOM overlay. Safe to call repeatedly: any previously
 * mounted overlay is removed first. Returns a cleanup function.
 */
export function registerUI(ctx: SceneContext): () => void {
  document.getElementById(OVERLAY_ID)?.remove();
  ensureUiStyles();

  const root = document.createElement('div');
  root.id = OVERLAY_ID;

  const settings = createSettingsCluster(ctx.audio);
  const replay = createReplayChoiceScreen(ctx.bus, ctx.audio);

  root.append(settings.element, replay.element);
  document.body.appendChild(root);

  replay.setVisible(false);
  const unsubscribe = ctx.bus.onEvent((event) => {
    if (event.kind === 'phase-changed') {
      replay.setVisible(event.phase === 'replay-choice');
    }
  });

  return () => {
    unsubscribe();
    settings.dispose();
    replay.dispose();
    root.remove();
  };
}

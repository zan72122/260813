import type { GameStateSnapshot } from '../core';

export interface StageDebugHook {
  getState(): GameStateSnapshot;
}

declare global {
  interface Window {
    __stageDebug?: StageDebugHook;
  }
}

/** Installs the window.__stageDebug hook used by Playwright e2e tests. */
export function installDebugHook(getState: () => GameStateSnapshot): void {
  window.__stageDebug = { getState };
}

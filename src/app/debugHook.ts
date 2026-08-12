import type { GameEvent, GamePhase, GameStateSnapshot } from '../core';

export interface StageDebugAudioState {
  contextState: 'uninitialized' | AudioContextState;
  muted: boolean;
}

export interface StageDebugHook {
  getState(): GameStateSnapshot;
  /**
   * Debug-only phase override for e2e tests: sets GameStateSnapshot.phase
   * directly via GameState, bypassing GameDirector's normal transition
   * rules. GameDirector's own transient timers (idle-hint clock, auto-advance
   * clock, applause-fired flag) are not reset, so a skip may cause the next
   * auto-advance to fire sooner than a full playthrough would — acceptable
   * for tests that only need to observe a specific phase's static state.
   */
  skipToPhase(phase: GamePhase): void;
  /** Most-recent GameEvent emissions (oldest first), capped ring buffer. Includes hintShown. */
  getRecentEvents(): readonly GameEvent[];
  getAudioState(): StageDebugAudioState;
}

declare global {
  interface Window {
    __stageDebug?: StageDebugHook;
  }
}

export interface DebugHookDeps {
  getState(): GameStateSnapshot;
  skipToPhase(phase: GamePhase): void;
  getRecentEvents(): readonly GameEvent[];
  getAudioState(): StageDebugAudioState;
}

/** Installs the window.__stageDebug hook used by Playwright e2e tests. */
export function installDebugHook(deps: DebugHookDeps): void {
  window.__stageDebug = { ...deps };
}

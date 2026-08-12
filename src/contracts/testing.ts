/**
 * Test-inspector contract. Exposed as `window.__eiffel` at runtime (wired
 * up by the Integrator in src/app + src/main.ts); Playwright drives the
 * game exclusively through `drive.*`, which must route through the same
 * Intent path as real gestures (input → Intent → stateMachine.transition)
 * — never a bypass — so no-softlock/assist/snap behavior under test is
 * provably the same code real players hit. See ARCHITECTURE_CONTRACT.md
 * § testing.ts.
 */

import type { LegId } from './types';
import type { GameState } from './types';

export interface TestApi {
  /** True once the scene has completed its first render. */
  ready: boolean;
  /** True once camera/animation are at rest (safe point for a screenshot). */
  settled(): boolean;
  /** Deep copy of the current GameState — callers must not be able to mutate live state through this. */
  state(): GameState;
  alignmentError(leg: LegId): number;
  locked(leg: LegId): boolean;
  /** Advances exactly `frames` fixed logical+render steps. Only meaningful when `?fixedStep=1`. */
  step(frames: number): void;
  drive: {
    setGate(open: number): void;
    pump(): void;
    dragWedge(p: number): void;
    releaseWedge(): void;
    hammer(): void;
    advance(): void;
    replay(): void;
  };
  renderInfo(): { geometries: number; textures: number; drawCalls: number };
}

declare global {
  interface Window {
    __eiffel: TestApi;
  }
}

// Empty export makes this file's `declare global` an augmentation instead
// of a global script, per standard TS module semantics.
export {};

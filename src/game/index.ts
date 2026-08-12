// src/game/index.ts
// Worker A (gameplay-camera) entry point. Owned per docs/OWNERSHIP.md.
// The Integrator wires this in at Wave 3 as `registerGame(ctx)` — see
// docs/CONTRACTS.md "配線規約".

import type { SceneContext } from '../contracts';
import { installDebugApi } from './debug';
import { GameDirector } from './director';
import { startInternalLoop } from './internalLoop';

export { GameDirector, type GameDirectorState } from './director';
export { installDebugApi, type VersaillesDebug } from './debug';
export { KingProcession } from './procession';
export { ValveModel } from './valve';
export * as gameTiming from './timing';

/** Registers the full garden-idle -> ... -> replay-choice phase flow driven
 * by the shared EventBus. Self-contained: starts its own per-frame loop and
 * never touches src/app/** or main.ts. */
export function registerGame(ctx: SceneContext): void {
  const director = new GameDirector(ctx);
  const disposeDebug = installDebugApi(ctx, director);
  const loop = startInternalLoop((dt) => director.update(dt));

  if (typeof window !== 'undefined') {
    window.addEventListener(
      'beforeunload',
      () => {
        loop.stop();
        disposeDebug();
        director.dispose();
      },
      { once: true },
    );
  }
}

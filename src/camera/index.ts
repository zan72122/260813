// src/camera/index.ts
// Worker A (gameplay-camera) entry point. The Integrator wires this in as
// `registerCamera(ctx)` — see docs/CONTRACTS.md "配線規約". Never touches
// src/app/** or main.ts; drives ctx.camera directly from its own loop.

import type { SceneContext } from '../contracts';
import { startInternalLoop } from '../game/internalLoop';
import { CinematicBeatPlayer } from './player';

export { CAMERA_BEATS, findBeat, REVEAL_BEAT_ID_BY_FOUNTAIN, REVEAL_CLOSE_SEC } from './beats';
export { CinematicBeatPlayer } from './player';

export function registerCamera(ctx: SceneContext): void {
  const player = new CinematicBeatPlayer(ctx);
  const loop = startInternalLoop((dt) => player.update(dt));

  if (typeof window !== 'undefined') {
    window.addEventListener(
      'beforeunload',
      () => {
        loop.stop();
        player.dispose();
      },
      { once: true },
    );
  }
}

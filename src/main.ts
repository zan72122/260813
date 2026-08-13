import { Game } from './game/game';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const unsupported = document.getElementById('unsupported');

function fail(reason: unknown): void {
  console.error('[hologram] boot failed', reason);
  if (unsupported) unsupported.hidden = false;
}

if (!canvas) {
  fail('missing canvas');
} else {
  try {
    const game = new Game(canvas);
    game.start();

    // Hooks for the E2E smoke test. Harmless in production, and the only way to
    // drive the game deterministically without faking touch physics.
    (globalThis as unknown as { __GAME__: unknown }).__GAME__ = {
      ready: true,
      state: () => game.debugState(),
      start: () => game.startRun(),
      chooseCard: (i: number) => game.chooseCard(i),
      choosePattern: (i: number) => game.choosePattern(i),
      press: () => {
        const s = game.debugState().rect as { x: number; y: number };
        game.doPress(s.x, s.y);
      },
      fillFoil: () => game.fillFoil(),
      tilt: (x: number, y: number) => game.debugTilt(x, y),
      releaseTilt: () => game.debugReleaseTilt(),
      sample: () => game.debugSample(),
      layout: () => game.layout(),
    };
  } catch (e) {
    fail(e);
  }
}

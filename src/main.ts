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
      chooseStamp: (i: number) => game.chooseStamp(i),
      press: (u?: number, v?: number) => game.debugPress(u, v),
      stroke: (pts: [number, number][], pitch?: number) => game.debugStroke(pts, pitch),
      fillFoil: () => game.fillFoil(),
      finishFoil: () => game.finishFoil(),
      toggleUv: () => game.toggleUv(),
      openAlbum: () => game.openAlbum(),
      tilt: (x: number, y: number) => game.debugTilt(x, y),
      releaseTilt: () => game.debugReleaseTilt(),
      sample: () => game.debugSample(),
      pixels: () => game.debugPixels(),
      layout: () => game.layout(),
    };
  } catch (e) {
    fail(e);
  }
}

import { Game } from './game/game';
import { STYLE } from './style';

const app = document.getElementById('app')!;
const game = new Game(app);

// E2E / screenshot mode: ?fast=1 → dpr 1, deterministic-friendly.
const params = new URLSearchParams(location.search);
const fast = params.get('fast') === '1';
if (fast) {
  game.stage.renderer.setPixelRatio(1);
}

// On a real device the dt clamp only smooths hiccups. Under SwiftShader
// (headless CI) real FPS can drop so low that the clamp would slow virtual
// time to a crawl — in fast mode, let logical time follow the wall clock.
const dtCap = fast ? 0.5 : 1 / 20;
let last = performance.now();
let framed = false;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, dtCap);
  last = now;
  game.tick(dt);
  if (!framed) {
    framed = true;
    testApi.ready = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Deterministic test API (see CLAUDE.md WebGL policy).
const testApi = {
  ready: false,
  version: STYLE.identity.title,
  getPhase: () => game.phase,
  getBraidStep: () => game.braidStep,
  /** Performs the currently expected gesture programmatically. */
  auto: () => game.autoAdvance(),
  /** Finish any camera glide instantly (deterministic screenshots). */
  snapCamera: () => game.rig.jumpTo(game.rig.shot),
  /** Runs the whole loop to a named phase. */
  async to(phase: string): Promise<void> {
    let guard = 40;
    while (game.phase !== phase && guard-- > 0) {
      await game.autoAdvance();
    }
  },
  game
};
declare global {
  interface Window {
    __whg: typeof testApi;
  }
}
window.__whg = testApi;

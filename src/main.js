import './style.css';
import { Game, STAGES } from './game.js';
import { FAST } from './config.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('stage'));
const hud = /** @type {HTMLElement} */ (document.getElementById('hud'));

const game = new Game(canvas, hud);
game.start();

// iOS reflows the viewport when the URL bar collapses; keep the canvas honest.
const revisit = () => game.view.resize();
window.visualViewport?.addEventListener('resize', revisit);
document.addEventListener('visibilitychange', revisit);

// ---------------------------------------------------------------------------
// Deterministic test surface. Everything the E2E suite needs to drive the game
// without pretending to measure GPU behaviour.
// ---------------------------------------------------------------------------
globalThis.__GAME__ = {
  game,
  fast: FAST,
  stages: STAGES,
  get stage() {
    return game.stage;
  },
  state() {
    const items = game.gummies.items;
    return {
      stage: game.stage,
      flatten: game.flatten,
      filled: game.cells.filter((c) => c.fill >= 1).length,
      cells: game.cells.length,
      dig: game.digProgress,
      gloss: game.gloss,
      gummies: items.length,
      revealed: items.filter((g) => g.found).length,
      /** every colour visible on screen right now (empty = achromatic world) */
      colorsVisible: [
        ...new Set(items.filter((g) => g.dust < 0.5 && g.fill > 0.05).map((g) => g.colorHex)),
      ],
      cameraShot: game.view.shot,
      cameraPos: game.view.camera.position.toArray(),
    };
  },
  /** Advance N frames of fixed logical time - no reliance on rAF pacing. */
  step(frames = 1, dt = 1 / 60) {
    for (let i = 0; i < frames; i++) game.update(dt);
  },
  /** Synthetic finger, in CSS pixels relative to the canvas. */
  drag(points, holdFrames = 2) {
    if (!points.length) return;
    game.pointer.inject('down', points[0][0], points[0][1]);
    game.update(1 / 60);
    for (const [x, y] of points.slice(1)) {
      game.pointer.inject('move', x, y);
      for (let i = 0; i < holdFrames; i++) game.update(1 / 60);
    }
    game.pointer.inject('up', points[points.length - 1][0], points[points.length - 1][1]);
    game.update(1 / 60);
  },
  press(x, y, frames = 30) {
    game.pointer.inject('down', x, y);
    for (let i = 0; i < frames; i++) game.update(1 / 60);
    game.pointer.inject('up', x, y);
    game.update(1 / 60);
  },
  setStage(name) {
    game.setStage(name);
  },
  /** Screen point whose brush contact lands on this spot of the mound. */
  aimAt(x, z) {
    return game.brushTargetScreen(x, z);
  },
  /** Park the render loop so a screenshot gets an idle main thread. */
  pause() {
    game.stop();
  },
  resume() {
    game.start();
  },
};

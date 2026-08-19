import { Game } from './game/Game';

/**
 * Entry point. Everything is generated in code, so "loading" is really just
 * building geometry and canvas textures - a few hundred milliseconds even on a
 * phone - and then we wait for the child to tap.
 */

const host = document.getElementById('app')!;
const ui = document.querySelector('#loadBar i') as HTMLElement;
ui.style.width = '20%';

const game = new Game(host);
ui.style.width = '100%';
game.frame();

// exposed for the automated playtests
(window as unknown as { __game: Game }).__game = game;

// deep-link a scene for testing: ?scene=reveal
const scene = new URLSearchParams(location.search).get('scene');
if (scene) {
  game.start().then(() => game.jumpTo(scene as never));
}

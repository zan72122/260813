import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('gl');
const game = new Game(canvas, { fast: params.get('fast') === '1' });
game.start();

// jump straight to a stage: ?stage=5 — used by the play-through tests
const jump = Number(params.get('stage'));
if (Number.isFinite(jump) && jump > 0) game.jumpTo(jump);

// iOS: keep the page from bouncing or zooming under small fingers
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

window.__game = game;

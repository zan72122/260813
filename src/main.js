import { createGame, attachTestHooks } from './game.js';

const root = document.getElementById('stage');
const game = createGame(root);
attachTestHooks(game);

// iOS Safari: ダブルタップの拡大と、スクロールによるずれを止める
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// タブへもどってきたときに時間が飛ばないように
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) game.last = performance.now();
});

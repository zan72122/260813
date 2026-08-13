import './style.css';
import { Game } from './game';
import { sound } from './audio';

const params = new URLSearchParams(location.search);
/** テストや非力な端末むけの軽量モード */
const reduced =
  params.get('fast') === '1' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const game = new Game(reduced);
if (reduced) sound.setEnabled(false);
game.start();

declare global {
  interface Window {
    __game?: ReturnType<Game['debugApi']>;
  }
}

// Playwright / 動作確認用
window.__game = game.debugApi();

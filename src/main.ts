import './style.css';
import { Game } from './game/game';

const params = new URLSearchParams(location.search);
const fast = params.get('fast') === '1' || params.get('e2e') === '1';
const seed = Number(params.get('seed') ?? 20260813) || 20260813;

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const hud = document.getElementById('hud');
if (!canvas || !hud) throw new Error('stage / hud not found');

const game = new Game(canvas, hud, { fast, seed });
game.start();

// iOS の Safari でアドレスバーが伸縮したときに描画サイズを合わせ直す
window.addEventListener('pageshow', () => game.resize());
window.visualViewport?.addEventListener('resize', () => game.resize());

declare global {
  interface Window {
    __lab?: Game;
  }
}
window.__lab = game;

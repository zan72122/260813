import { Game } from './game.js';
import { loadAssets, setBeanFallback } from './natto.js';
import { drawBean, BEAN_LOOK } from './art.js';
import { TitleScene } from './scenes/title.js';
import { SoakScene } from './scenes/soak.js';
import { SteamScene } from './scenes/steam.js';
import { SprayScene } from './scenes/spray.js';
import { PackScene } from './scenes/pack.js';
import { FermentScene } from './scenes/ferment.js';
import { FinaleScene } from './scenes/finale.js';
import { RevealScene } from './scenes/reveal.js';

const canvas = document.getElementById('stage');
const game = new Game(canvas);

// 焼き込みスプライトは非同期で届く。届くまではベクターで代替するので、
// 読み込み待ちの画面を挟まずにそのまま遊べる。
setBeanFallback((ctx, state, x, y, r, rot) => {
  drawBean(ctx, x, y, r, rot, BEAN_LOOK[state] || BEAN_LOOK.dry);
});
loadAssets('./assets/');

game.register('title', TitleScene);
game.register('soak', SoakScene);
game.register('steam', SteamScene);
game.register('spray', SprayScene);
game.register('pack', PackScene);
game.register('ferment', FermentScene);
game.register('finale', FinaleScene);
game.register('reveal', RevealScene);

const start = new URLSearchParams(location.search).get('scene') || 'title';
game.start(game.scenes.has(start) ? start : 'title');

// ---- E2E 用フック（決定的にシーンを進める / 論理時間を直接進める）----
window.__natto = {
  game,
  /** 現在の状態を素の値で返す（テストが内部構造に触れなくて済むように） */
  state() {
    const s = game.scene || {};
    return {
      scene: game.sceneName,
      transitioning: !!game.trans,
      portrait: game.portrait,
      w: game.W, h: game.H,
      phase: s.phase ?? null,
      fill: s.fill ?? null,
      gauge: s.gauge ?? null,
      sprays: s.sprays ?? null,
      prog: s.prog ?? null,
      openAmt: s.openAmt ?? null,
      sticky: s.sticky ?? null,
      threads: (s.webs ? s.webs.length : 0) + (s.tipThreads ? s.tipThreads.length : 0),
      lift: s.lift ?? null,
      liftPeak: s.liftPeak ?? null,
      wowCount: s.wowCount ?? null,
      showNext: s.showNext ?? null,
      placed: s.beans ? s.beans.filter((b) => b.state === 'set').length : null,
    };
  },
  goto(name) { game._swap(name); },
  /** 1 フレームあたりの更新＋描画にかかった時間（参考値） */
  perf() {
    const p = game.perf;
    return { frames: p.frames, avgMs: p.frames ? p.totalMs / p.frames : 0, slow: p.slow };
  },
  resetPerf() { game.perf = { frames: 0, totalMs: 0, slow: 0 }; },
  /** シーン内座標 → 画面座標（カメラを使うシーンのテスト用） */
  toScreen(x, y) {
    const s = game.scene;
    if (!s || !s.anchorY) return { x, y };
    return {
      x: (x - s.pk.x) * s.zoom + game.W / 2,
      y: (y - s.focusY) * s.zoom + s.anchorY,
    };
  },
  /** finale のパックが画面上でどこに見えているか */
  packScreen() {
    const s = game.scene;
    if (!s || !s.pk) return null;
    const c = this.toScreen(s.pk.x, s.pk.y);
    const z = s.anchorY ? s.zoom : 1;
    return { x: c.x, y: c.y, w: s.pk.w * z, h: s.pk.h * z, rimY: this.toScreen(s.pk.x, s.rimY).y };
  },
  /** rAF を待たずに論理時間を進める */
  advance(seconds) { game.advance(seconds); },
  /** 遷移が終わるまで一気に進める */
  settle() {
    let guard = 0;
    while (game.trans && guard++ < 400) game.advance(1 / 60);
  },
};

// 起動・入力・ループ。iOS Safari 想定。
import { Game } from './game.js';
import { sfx } from './audio.js';
import { clamp } from './util.js';
import { quality } from './quality.js';

const canvas = document.getElementById('back');      // 入力を受けるのは最下層
const boot = document.getElementById('boot');
quality.probe();
const game = new Game({
  back: canvas,
  gl: document.getElementById('gl'),
  front: document.getElementById('front'),
});

let last = performance.now();
let raf = 0;

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 1 / 20);
  last = now;
  game.update(dt);
  game.render();
  // 実測FPSを見て、重い効果から段階的に落とす
  if (quality.sample(dt)) game.dropTier();
}

// --- 入力 ---------------------------------------------------------------
let activeId = null;
const rect = () => canvas.getBoundingClientRect();

function pos(e) {
  const r = rect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

canvas.addEventListener('pointerdown', (e) => {
  if (activeId !== null) return;          // 一指操作。2本目以降は無視
  activeId = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const p = pos(e);
  game.onDown(p.x, p.y);
  e.preventDefault();
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activeId && activeId !== null) return;
  const p = pos(e);
  game.onMove(p.x, p.y);
  e.preventDefault();
}, { passive: false });

function end(e) {
  if (e.pointerId !== activeId) return;
  activeId = null;
  game.onUp();
  e.preventDefault();
}
canvas.addEventListener('pointerup', end, { passive: false });
canvas.addEventListener('pointercancel', end, { passive: false });
canvas.addEventListener('lostpointercapture', () => { if (activeId !== null) { activeId = null; game.onUp(); } });

// iOS のダブルタップ拡大・ピンチ・スクロールを止める
['gesturestart', 'gesturechange', 'gestureend'].forEach((n) =>
  document.addEventListener(n, (e) => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
window.addEventListener('contextmenu', (e) => e.preventDefault());

// --- 画面サイズ / 回転 ---------------------------------------------------
let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  game.resize();          // 即時反映（状態は保持される）
  // iOS は回転直後の innerWidth/Height が安定しないので、少し後にもう一度
  resizeTimer = setTimeout(() => game.resize(), 260);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { sfx.stopAllLoops(); game.onUp(); }
  else last = performance.now();
});

// --- 起動 ---------------------------------------------------------------
game.resize();
boot.classList.add('gone');
setTimeout(() => boot.remove(), 500);
raf = requestAnimationFrame(frame);

// --- テスト用フック（決定的に工程を進めるため） -------------------------
window.__nori = {
  game,
  get stage() { return game.stage; },
  get progress() { return game.p; },
  get orientation() { return game.layout.mode; },
  get audio() { return sfx.ctx ? sfx.ctx.state : 'none'; },
  get tier() { return quality.tier; },
  get fps() { return Math.round(quality.fps); },
  setTier(t) { quality.tier = t; quality.locked = (t === 0); game.dropTier(); },
  get made() { return game.made; },
  get state() {
    return {
      stage: game.stage, p: +game.p.toFixed(3), mode: game.layout.mode,
      coverage: +game.sheet.coverage().toFixed(3),
      evenness: +game.sheet.evenness().toFixed(3),
      wet: +game.sheet.avgWet().toFixed(3),
      dry: +game.sheet.dry.toFixed(3),
      peel: +game.peel.t.toFixed(3),
      hold: +game.hold.t.toFixed(3),
      made: game.made,
      revealDone: game.revealDone,
    };
  },
  // 現在「次に触ってほしい場所」をスクリーン座標で返す
  get target() {
    const h = game.hintTarget();
    if (!h) return null;
    const s = game.toScreen(h.x, h.y);
    return { x: s.x, y: s.y, r: h.r * game.cam.scale };
  },
  // 枠内の (u,v) をスクリーン座標へ
  frameAt(u, v) {
    const w = game.sheetQ(u, v);
    return game.toScreen(w.x, w.y);
  },
  // 論理時間だけを進める（描画なしで dt を積む）
  step(seconds, slice = 1 / 60) {
    let t = 0;
    while (t < seconds) { game.update(Math.min(slice, seconds - t)); t += slice; }
  },
  drag(pts, opts = {}) {
    const hold = opts.hold ?? 0;
    game.onDown(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      game.onMove(pts[i][0], pts[i][1]);
      game.update(opts.dt ?? 1 / 60);
    }
    if (hold) this.step(hold);
    game.onUp();
  },
  reset() { game.reset(true); game.snapCamera(); },
  jump(stage) { game.debugJump(stage); },
  // 光にかざす場面の状態を作る（見た目の確認用）
  setHold(k) {
    game.debugJump('hold');
    const b = game.layout.beam;
    game.hold.x = game.hold.tx = b.x;
    game.hold.y = game.hold.ty = b.y;
    game.hold.beam = k;
    game.hold.t = k;
  },
  // 剥がしの途中状態を作る（見た目の確認用）
  setPeel(t) {
    const fh = Math.abs(game.sheetQ(0, 1).y - game.sheetQ(0, 0).y);
    game.peel.pull = fh * 0.62 * t;
    game.peel.len = fh * t;
    game.peel.t = t;
    const H = game.sheetQ(0.5, 1 - t);
    game.peel.fx = game.pointer.x = H.x + fh * t * 0.35;
    game.peel.fy = game.pointer.y = H.y + fh * t * 1.05;
    game.peel.gx = game.peel.fx; game.peel.gy = game.peel.fy; game.peel.base = game.peel.pull;
    game.peel.grab = true;
    game.pointer.down = true;
  },
};

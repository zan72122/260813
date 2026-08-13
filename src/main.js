import * as THREE from 'three';
import { createGame } from './game.js';
import { stopFire, setMuted } from './audio.js';

const params = new URLSearchParams(location.search);
const FAST = params.get('fast') === '1' || window.__E2E_FAST === true;
const SEED = params.has('seed') ? Number(params.get('seed')) : null;

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !FAST,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true, // かざりだな用の絵をとるため
});
renderer.setClearColor(0x0d0716, 1);

// スマホの発熱をおさえる。E2E_FAST では 1 に固定。
const maxDPR = FAST ? 1 : 2;

function resize() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, maxDPR);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  game.camera.aspect = w / h;
  game.camera.updateProjectionMatrix();
}

const game = createGame({ renderer, canvas, fast: FAST, seed: SEED });
resize();

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopFire();
});

// iOS のダブルタップ拡大よけ
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);

let last = performance.now();
let running = true;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  // rAF のタイムスタンプが last より古いことがある。マイナスの dt を通すと
  // 進行度が逆もどりするので、必ず 0 以上にする。
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
  last = now;
  step(dt);
}

function step(dt) {
  game.update(dt);
  renderer.render(game.world.scene, game.camera);
  frames++;
}

requestAnimationFrame(frame);

/* ---------------- テスト用フック ---------------- */
window.__BISMUTH__ = {
  ready: true,
  fast: FAST,
  seed: SEED,
  state: () => game.debug.state(),
  setStage: (s) => game.debug.setStage(s, { snap: true }),
  begin: () => game.debug.begin(),
  reset: () => game.debug.reset(),
  codex: () => game.debug.codex(),
  clearCodex: () => game.debug.clearCodex(),
  forceRecipe: (patch) => game.debug.forceRecipe(patch),
  frames: () => frames,
  mute: (m = true) => setMuted(m),
  /**
   * 論理時間を まとめて進める（アニメ待ちをしない決定論テスト用）。
   * render=false にすると描画をとばすので、進行だけを確かめたいときに速い。
   */
  tick: (ms, stepMs = 33, render = true) => {
    running = false;
    const n = Math.max(1, Math.round(ms / stepMs));
    const dt = stepMs / 1000;
    for (let i = 0; i < n; i++) {
      if (render) step(dt);
      else game.update(dt);
    }
    running = true;
    last = performance.now();
  },
  pause: () => {
    running = false;
  },
  resume: () => {
    running = true;
    last = performance.now();
  },
  size: () => ({
    w: renderer.domElement.width,
    h: renderer.domElement.height,
    dpr: renderer.getPixelRatio(),
  }),
};

// レンダラが落ちたときも、まっ暗にしない
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  running = false;
});
canvas.addEventListener('webglcontextrestored', () => {
  running = true;
  last = performance.now();
});

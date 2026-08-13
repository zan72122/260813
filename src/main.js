// 起動処理。
// モバイル Safari で安定して動くことを最優先に、解像度・描画設定を控えめに固定する。
import * as THREE from 'three';
import { Game } from './game.js';

const canvas = document.getElementById('scene');
const boot = document.getElementById('boot');
const fallback = document.getElementById('fallback');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (err) {
  console.error(err);
  fallback.style.display = 'flex';
  boot.classList.add('gone');
  throw err;
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
// 彩度を保つトーンマッピング。鮮やかなピンクが灰色に転ばない。
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0xd9e4ea, 1);

// 端末の解像度が高すぎると発熱と電池消費が増えるので上限を設ける。
const maxDpr = 2;

const game = new Game(renderer, canvas);
window.__game = game; // 動作確認用

function sizeToWindow() {
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  game.resize(w, h);
}

sizeToWindow();
window.addEventListener('resize', sizeToWindow);
// iOS は回転直後にまだ古いサイズを返すことがあるので、少し遅らせてもう一度合わせる。
window.addEventListener('orientationchange', () => {
  sizeToWindow();
  setTimeout(sizeToWindow, 120);
  setTimeout(sizeToWindow, 420);
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', sizeToWindow);
}

let last = performance.now();
let started = false;

renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.render(game.scene, game.camera);

  if (!started) {
    started = true;
    // 最初のフレームが出てから読み込み画面を外す（真っ白を見せない）
    requestAnimationFrame(() => boot.classList.add('gone'));
  }
});

// タブが戻ってきたときに dt が飛ばないようにする
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = performance.now();
});

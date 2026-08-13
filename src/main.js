// にじいろ霧吹き — 指で霧をつくり、その霧の中から虹を育てる。
import { createContext, RenderTarget, createFullscreen, Program, FULLSCREEN_VS } from './glutil.js';
import { makeRng, randomSeed } from './rng.js';
import { Camera } from './camera.js';
import { Scene } from './scene.js';
import { Particles } from './particles.js';
import { Rainbow } from './rainbow.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import {
  MAX_DPR, MAX_PIXELS, STAGE, NOZZLE_OFFSET_Y,
  SPRAY_RATE_NEAR, SPRAY_RATE_FAR, DROPLET_RATE, MIST_DRAG,
} from './config.js';

const params = new URLSearchParams(location.search);
const FAST = params.has('fast') || params.get('e2e') === '1';
const DEBUG = params.has('debug');
const FIXED_SEED = params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : null;

const canvas = document.getElementById('stage');
const uiHint = document.getElementById('hint');
const uiAgain = document.getElementById('again');
const uiSound = document.getElementById('sound');
const uiDebug = document.getElementById('debug');

const gl = createContext(canvas);
if (!gl) {
  document.body.innerHTML =
    '<p style="color:#fff;font:16px/1.6 sans-serif;padding:2em">' +
    'このブラウザは WebGL2 に対応していません。<br>Safari / Chrome の新しいバージョンでお試しください。</p>';
  throw new Error('WebGL2 unavailable');
}

const camera = new Camera();
const scene = new Scene(gl);
const rainbow = new Rainbow(gl);
const post = new Post(gl);
const audio = new Audio();
const input = new Input(canvas);

let rng = makeRng(FIXED_SEED ?? randomSeed());
let roundIndex = 0;
const particles = new Particles(gl, rng);

const fullscreenVao = createFullscreen(gl);
const mainRT = new RenderTarget(gl, 8, 8, { float: true });
const bgRT = new RenderTarget(gl, 8, 8, { float: true });
const densityRT = new RenderTarget(gl, 8, 8, { float: false });

const blit = new Program(gl, FULLSCREEN_VS, `
in vec2 vUv; uniform sampler2D uTex;
void main(){ outColor = texture(uTex, vUv); }`, 'blit');

/* ---------------- 画面まわり ---------------- */

let cssW = 1, cssH = 1, dpr = 1;
const PINNED_Q = params.has('q') ? parseFloat(params.get('q')) : null;
let qualityScale = PINNED_Q ?? (FAST ? 0.75 : 1);

function resize() {
  const r = canvas.getBoundingClientRect();
  cssW = Math.max(1, Math.round(r.width || window.innerWidth));
  cssH = Math.max(1, Math.round(r.height || window.innerHeight));
  let d = Math.min(window.devicePixelRatio || 1, MAX_DPR) * qualityScale;
  if (FAST) d = Math.min(d, 1);
  const area = cssW * cssH * d * d;
  if (area > MAX_PIXELS) d *= Math.sqrt(MAX_PIXELS / area);
  d = Math.max(0.5, d);
  dpr = d;
  const bw = Math.round(cssW * d);
  const bh = Math.round(cssH * d);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  mainRT.resize(bw, bh);
  bgRT.resize(Math.max(2, Math.round(bw * 0.5)), Math.max(2, Math.round(bh * 0.5)));
  densityRT.resize(Math.max(2, Math.round(bw * 0.25)), Math.max(2, Math.round(bh * 0.25)));
  post.resize(bw, bh);
  camera.resize(cssW, cssH);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

/* ---------------- 1ラウンド ---------------- */

const state = {
  time: 0,
  power: 0,          // 噴霧の強さ 0..1
  wet: 0,            // 葉や花の濡れ具合
  stage: STAGE.EMPTY,
  bestStage: STAGE.EMPTY,
  flash: 0,
  fade: 1,
  resetting: 0,
  rewardTimer: 0,
  seed: 0,
  accNear: 0, accFar: 0, accDrop: 0,
  sparkBudget: 0,
  noteIndex: 0,
  noteCooldown: 0,
  bandedNow: 0,
  hold: 0,
};

function newRound(seed) {
  state.seed = seed;
  rng = makeRng(seed);
  particles.rng = rng;
  const round = scene.build(rng);
  // 毎回すこしだけ違う虹：位置・太さ・主役の色・霧の流れ
  const sunAz = rng.range(-70, 70);
  const heroHue = rng.range(0.12, 0.88);
  const thickness = rng.range(0.86, 1.2);
  camera.setRound(sunAz);
  rainbow.setRound({ sunAzWorld: sunAz, heroHue, thickness });
  particles.setWind(rng.range(-26, 26));
  state.stage = STAGE.EMPTY;
  state.bestStage = STAGE.EMPTY;
  state.wet = 0;
  state.noteIndex = 0;
  state.round = round;
}

function resetRound() {
  if (state.resetting > 0) return;
  state.resetting = 0.5;
  state.flash = Math.max(state.flash, 0.55);
  rainbow.fade = 0;
  audio.drop(0, 0.05);
  // きらきらっと消える
  for (let i = 0; i < 26; i++) {
    const pt = rainbow.sampleArcPoint(camera, rng);
    if (!pt) break;
    const w = camera.screenToWorld(pt.x, pt.y);
    particles.emitSparkle(w[0], w[1], pt.hue, 1, rng, 1.5);
  }
}

newRound(FIXED_SEED ?? randomSeed());
resize();

/* ---------------- 操作 → 霧 ---------------- */

const aim = {
  fx: 0, fy: 0, dirX: 0, dirY: -1, bodyX: 0, bodyY: -1,
  tipX: 0, tipY: 0, angle: 0, targetX: 0, targetY: 0, reach: 240,
  nozzle: NOZZLE_OFFSET_Y, lim: 0,
};
const restPos = { x: 0, y: 0 };
let sprayerX = 0, sprayerY = 0, sprayerInit = false;

/**
 * 弧のうち、霧吹きを下に置いてねらえる範囲（対日点からの左右の幅）。
 * 横画面は上下が狭く、弧の足もとの下にノズルを置く場所が無いので、
 * そこは最初からねらう対象にしない（完成の判定からも外す）。
 */
function reachableArcHalfWidth(nozPx, floorY) {
  const R = camera.radius;
  const need = camera.antisolar[1] - (floorY - nozPx - 46);
  if (need <= 0) return R * 0.94;
  if (need >= R) return R * 0.3;
  return Math.min(R * 0.94, Math.sqrt(R * R - need * need));
}

function updateAim(dt) {
  restPos.x = cssW * 0.5;
  restPos.y = cssH * 0.84 - Math.sin(state.time * 1.1) * 4;
  // ノズル先端を指より上へ出すぶんの高さ。上下が狭い画面では控えめにする。
  aim.nozzle = Math.min(NOZZLE_OFFSET_Y, (cssH * 0.26) / camera.scale);

  const targetSX = input.down ? input.x : restPos.x;
  const targetSY = input.down ? input.y : restPos.y;
  if (!sprayerInit) { sprayerX = targetSX; sprayerY = targetSY; sprayerInit = true; }
  const k = 1 - Math.exp(-dt / (input.down ? 0.045 : 0.35));
  sprayerX += (targetSX - sprayerX) * k;
  sprayerY += (targetSY - sprayerY) * k;
  // 画面のふちでも霧吹きが切れないように、ボトルの半分だけ内側にとどめる。
  // 割合ではなく実寸で止めるので、横画面では端まで手がとどく。
  const margin = Math.min(cssW * 0.16, aim.nozzle * 0.62 * camera.scale * 1.05);
  sprayerX = Math.max(margin, Math.min(cssW - margin, sprayerX));

  // ここが「4歳児に角度を合わせさせない」ための仕掛け。
  // 指のま上あたりの弧を目標にして、噴霧の向きと勢いをこっそり寄せる。
  // 子どもは左右にふるだけでよく、狙いはゲームが引き受ける。
  const nozPx = aim.nozzle * camera.scale;
  const floorY = cssH * 0.95;
  const lim = reachableArcHalfWidth(nozPx, floorY);
  aim.lim = lim;
  const dxs = Math.max(-lim, Math.min(lim, sprayerX - camera.antisolar[0]));
  aim.targetX = camera.antisolar[0] + dxs;
  aim.targetY = camera.antisolar[1] - Math.sqrt(Math.max(0, camera.radius * camera.radius - dxs * dxs));

  // 霧吹きはいつも虹より下（庭の中）に立たせる。
  // 横画面では弧の端がぐっと下がってくるので、これが無いと
  // ノズル先端が虹より上に出てしまい、霧が虹の外側へ飛んでいってしまう。
  const minY = Math.min(floorY, aim.targetY + nozPx + 40);
  sprayerY = Math.max(minY, Math.min(floorY, sprayerY));

  // 画面の左右どちら側にいるかで、自然に噴霧が外へ向く。
  // → 左右スワイプするだけで、虹の弧をなぞれる。
  let tilt = ((sprayerX - cssW * 0.5) / (cssW * 0.37)) * 0.82;
  tilt += Math.max(-0.5, Math.min(0.5, input.vx * 0.0013));
  tilt = Math.max(-1.15, Math.min(1.15, tilt));
  const len = Math.hypot(tilt, 1);
  const nx = tilt / len, ny = -1 / len;

  const tx = aim.targetX - sprayerX;
  const ty = Math.min(-30, aim.targetY - sprayerY);
  const tl = Math.hypot(tx, ty) || 1;
  const ASSIST = 0.72;
  let mx = nx * (1 - ASSIST) + (tx / tl) * ASSIST;
  let my = ny * (1 - ASSIST) + (ty / tl) * ASSIST;
  const ml = Math.hypot(mx, my) || 1;
  aim.dirX = mx / ml;
  aim.dirY = my / ml;
  // 届く勢いで噴く（遠いほど強く）
  aim.reach = tl / camera.scale;

  const full = Math.atan2(aim.dirX, -aim.dirY);
  // 霧はしっかり外へ向くが、ボトルは倒れて見えないよう控えめに傾ける
  aim.angle = full * 0.55;
  aim.bodyX = Math.sin(aim.angle);
  aim.bodyY = -Math.cos(aim.angle);

  const w = camera.screenToWorld(sprayerX, sprayerY);
  aim.fx = w[0];
  aim.fy = w[1];
  // ノズル先端は指よりずっと上。指で虹が隠れない。
  aim.tipX = aim.fx + aim.bodyX * aim.nozzle;
  aim.tipY = aim.fy + aim.bodyY * aim.nozzle;
}

// 弧まで“ちょうど届く”勢い。空気抵抗があるので到達距離 ≈ 速度 / 抵抗。
function sprayStrength() {
  return Math.max(320, Math.min(880, aim.reach * MIST_DRAG * 1.02));
}

function updateSpray(dt) {
  const want = input.down ? 1 : 0;
  const tau = want ? 0.16 : 0.10;
  state.power += (want - state.power) * (1 - Math.exp(-dt / tau));
  if (state.power < 0.004) state.power = 0;

  const p = state.power;
  // 解像度は落としても、霧の量はあまり落とさない（絵の印象が変わってしまう）
  const q = 0.62 + 0.38 * qualityScale;
  if (p > 0.01) {
    state.accNear += SPRAY_RATE_NEAR * q * p * dt;
    state.accFar += SPRAY_RATE_FAR * q * p * dt;
    state.accDrop += DROPLET_RATE * p * dt;
    const n = Math.floor(state.accNear); state.accNear -= n;
    const f = Math.floor(state.accFar); state.accFar -= f;
    const d = Math.floor(state.accDrop); state.accDrop -= d;
    const sp = sprayStrength();
    if (n) particles.emitMist(aim.tipX, aim.tipY, aim.dirX, aim.dirY, n, 0.55 + 0.45 * p, rng, sp);
    if (f) particles.emitFar(aim.tipX, aim.tipY, aim.dirX, aim.dirY, f, 0.55 + 0.45 * p, rng, sp);
    if (d) particles.emitDroplets(aim.tipX, aim.tipY, aim.dirX, aim.dirY, d, 0.6 + 0.4 * p, rng, sp * 0.62);
    state.wet = Math.min(1, state.wet + p * dt * 0.42);
  }

  // 短いタップ：ぽふっと少しだけ
  if (input.consumeTap()) {
    const sp = sprayStrength();
    particles.emitMist(aim.tipX, aim.tipY, aim.dirX, aim.dirY, 18, 0.72, rng, sp);
    particles.emitFar(aim.tipX, aim.tipY, aim.dirX, aim.dirY, 7, 0.7, rng, sp);
    particles.emitDroplets(aim.tipX, aim.tipY, aim.dirX, aim.dirY, 3, 0.8, rng, sp * 0.62);
    state.wet = Math.min(1, state.wet + 0.06);
    audio.drop(state.noteIndex++, 0.035);
  }

  state.wet *= Math.exp(-dt / 9.0);
}

/* ---------------- 進行 ---------------- */

function updateProgress(dt) {
  const cov = rainbow.updateCoverage(camera, aim.lim);
  const mx = rainbow.max;
  let stage = STAGE.EMPTY;
  if (particles.near.n > 6 || state.power > 0.05) stage = STAGE.MIST;
  if (mx > 0.20) stage = STAGE.FAINT;
  if (cov > 0.42 && mx > 0.45) stage = STAGE.GROWING;
  if (cov > 0.80 && mx > 0.70) stage = STAGE.BIG;
  state.stage = stage;

  if (stage > state.bestStage) {
    const prev = state.bestStage;
    state.bestStage = stage;
    if (stage === STAGE.FAINT) {
      audio.fanfare(0);
      state.flash = Math.max(state.flash, 0.12);
    } else if (stage === STAGE.GROWING) {
      audio.fanfare(1);
      state.flash = Math.max(state.flash, 0.18);
    } else if (stage === STAGE.BIG) {
      audio.fanfare(2);
      state.flash = Math.max(state.flash, 0.32);
      state.rewardTimer = 3.2;
      camera._shotHold = -99;
    }
    if (prev < STAGE.FAINT && stage >= STAGE.FAINT) hideHint();
  }

  // ごほうび：虹の粒がぱらぱら生まれる
  if (state.rewardTimer > 0) {
    state.rewardTimer -= dt;
    const n = Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const pt = rainbow.sampleArcPoint(camera, rng);
      if (!pt) break;
      const w = camera.screenToWorld(pt.x, pt.y);
      particles.emitSparkle(w[0], w[1], pt.hue, 1, rng, 1.35);
    }
    state.noteCooldown -= dt;
    if (state.noteCooldown <= 0) {
      state.noteCooldown = 0.22;
      audio.drop(state.noteIndex++, 0.045);
    }
  }

  // カメラ：3つの構図だけ。因果の途中では切り替えない。
  let shot = 'wide';
  if (state.bestStage >= STAGE.BIG) shot = 'reveal';
  else if (input.down || particles.near.n > 30) shot = 'spray';
  camera.request(shot, state.time);

  uiAgain.classList.toggle('show', state.bestStage >= STAGE.GROWING && state.resetting <= 0);
  // 噴霧中に「もういちど」を押してしまわないように
  uiAgain.style.pointerEvents = input.down ? 'none' : '';
}

/* ---------------- おしえてくれる手 ---------------- */

let hintShown = false;
function showHint() {
  if (hintShown) return;
  hintShown = true;
  uiHint.classList.add('show');
}
function hideHint() {
  if (!hintShown) return;
  hintShown = false;
  uiHint.classList.remove('show');
}
input.onFirstTouch = () => {
  hideHint();
  audio.unlock();
};
setTimeout(() => { if (!input.everTouched) showHint(); }, 900);

uiAgain.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
uiAgain.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  resetRound();
});
uiSound.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
uiSound.addEventListener('click', (e) => {
  e.stopPropagation();
  audio.unlock();
  const m = !audio.muted;
  audio.setMuted(m);
  uiSound.classList.toggle('muted', m);
});

/* ---------------- 描画 ---------------- */

const SUN_TINT = [1.02, 1.005, 0.97];    // 背後の太陽に照らされた霧の芯
const SHADE_TINT = [0.84, 0.90, 0.99];   // ふちに残る空の青

function render() {
  const bw = canvas.width, bh = canvas.height;

  gl.disable(gl.BLEND);

  // 背景（半解像度）
  bgRT.bind();
  gl.bindVertexArray(fullscreenVao);
  scene.drawBackground(camera, state.time, state.wet);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  mainRT.bind();
  blit.use().set('uTex', bgRT.uniform);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied

  scene.drawProps(camera, state.time, state.wet);

  // 霧の濃度（虹が出る場所を決める）
  densityRT.bind([0, 0, 0, 0]);
  gl.blendFunc(gl.ONE, gl.ONE);
  particles.drawDensity(camera);

  // 本描画
  mainRT.bind();
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  particles.drawMist(camera, SUN_TINT, SHADE_TINT);

  gl.bindVertexArray(fullscreenVao);
  rainbow.draw(camera, densityRT.texture, state.time, state.fade);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);

  particles.drawDroplets(camera, SUN_TINT, Math.min(1, rainbow.max * 1.2));
  particles.drawSparkles(camera);

  // 本体の中心は指の少し先。先端（ノズル）がちょうど霧の出る点に来る。
  const bodyOff = aim.nozzle * 0.42 * camera.scale;
  scene.drawSprayer(camera, {
    center: [sprayerX + aim.bodyX * bodyOff, sprayerY + aim.bodyY * bodyOff],
    size: aim.nozzle * 0.62 * camera.scale,
    angle: aim.angle,
    press: state.power,
    time: state.time,
    water: state.power,
  });

  post.run(gl, fullscreenVao, mainRT, bw, bh, 0.26 + 0.22 * Math.min(1, rainbow.max), state.flash);
}

/* ---------------- ループ ---------------- */

let last = performance.now() / 1000;
let frameAvg = 16.7;
let qualityCheck = 0;
let fpsAcc = 0, fpsCount = 0, fps = 60;

function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  let dt = t - last;
  last = t;
  if (dt > 1 / 15) dt = 1 / 15;
  if (dt <= 0) dt = 1 / 60;
  state.time += dt;

  if (canvas.width !== Math.round(cssW * dpr)) resize();

  input.update(dt);
  updateAim(dt);
  updateSpray(dt);
  particles.update(dt, state.time);
  camera.update(dt, aim.fx * 0.35, state.time);

  // 霧 → 弧に色を貯める（ここが因果の中心）
  state.sparkBudget += dt * 15;
  // 噴きはじめは、まだ水滴のきらめきだけ。
  // 霧がたまってから、はじめて色が生まれる。
  if (state.power > 0.3) state.hold += dt; else state.hold = Math.max(0, state.hold - dt * 2.5);
  const arcRamp = Math.min(1, Math.max(0, (state.hold - 0.25) / 0.55));
  const banded = rainbow.accumulate(
    [{ pool: particles.near, weight: 1.0 }, { pool: particles.far, weight: 0.5 }],
    dt,
    (x, y, w) => {
      if (state.sparkBudget < 1) return;
      state.sparkBudget -= 1;
      particles.emitSparkle(x, y, rng(), Math.min(1, rainbow.max * 1.6), rng, 0.9 + w * 0.6);
    },
    arcRamp,
  );
  state.bandedNow = banded;

  updateProgress(dt);

  // リセット演出：ぱっと光って、庭も虹も新しくなる
  if (state.resetting > 0) {
    state.resetting -= dt;
    state.fade = Math.max(0, state.fade - dt / 0.4);
    if (state.resetting <= 0.22 && !state._swapped) {
      state._swapped = true;
      rainbow.reset();
      particles.reset();
      roundIndex++;
      newRound(FIXED_SEED !== null ? (FIXED_SEED + roundIndex) >>> 0 : randomSeed());
      camera._shotHold = -99;
      camera.request('wide', state.time);
      uiAgain.classList.remove('show');
    }
    if (state.resetting <= 0) {
      state.resetting = 0;
      state._swapped = false;
      rainbow.fade = 1;
    }
  } else {
    state.fade = Math.min(1, state.fade + dt / 0.45);
  }
  state.flash = Math.max(0, state.flash - dt * 1.8);

  audio.setSpray(state.power, Math.min(1, banded * 0.05));

  // ずっと触っていない子には、もう一度おしえる
  if (!input.everTouched && state.time > 1.2) showHint();
  else if (input.idle > 15 && state.bestStage < STAGE.FAINT && !input.down) showHint();

  render();

  // 重い端末では静かに解像度を落とす
  frameAvg += (dt * 1000 - frameAvg) * 0.05;
  fpsAcc += dt; fpsCount++;
  if (fpsAcc >= 0.5) { fps = fpsCount / fpsAcc; fpsAcc = 0; fpsCount = 0; }
  qualityCheck += dt;
  if (!FAST && PINNED_Q === null && qualityCheck > 2.5) {
    qualityCheck = 0;
    if (frameAvg > 26 && qualityScale > 0.62) {
      qualityScale = Math.max(0.62, qualityScale - 0.16);
      resize();
    } else if (frameAvg < 15 && qualityScale < 1) {
      qualityScale = Math.min(1, qualityScale + 0.1);
      resize();
    }
  }

  if (DEBUG) {
    uiDebug.hidden = false;
    const c = particles.counts;
    uiDebug.textContent =
      `fps ${fps.toFixed(0)}  dpr ${dpr.toFixed(2)} q ${qualityScale.toFixed(2)}\n` +
      `stage ${state.stage} best ${state.bestStage}\n` +
      `arc max ${rainbow.max.toFixed(3)} cov ${rainbow.coverage.toFixed(2)}\n` +
      `band ${banded.toFixed(1)} wet ${state.wet.toFixed(2)}\n` +
      `p ${c.near}/${c.far}/${c.drop}/${c.spark}\n` +
      `${cssW}x${cssH} seed ${state.seed}`;
  }
}

canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });
canvas.addEventListener('webglcontextrestored', () => location.reload());

requestAnimationFrame(frame);

/* ---------------- テスト用のフック ---------------- */

window.__game = {
  stats: () => ({
    fps,
    stage: state.stage,
    bestStage: state.bestStage,
    arcMax: rainbow.max,
    coverage: rainbow.coverage,
    visibleBins: rainbow.visibleBins,
    gainScale: rainbow.gainScale,
    banded: state.bandedNow,
    wet: state.wet,
    particles: particles.counts,
    cssW, cssH, dpr,
    shot: camera.shot,
    seed: state.seed,
    horizonY: camera.horizonY,
    antisolar: camera.antisolar.slice(),
    radius: camera.radius,
    againVisible: uiAgain.classList.contains('show'),
  }),
  reset: () => resetRound(),
  // 実機の指の代わり（自動テスト用）
  hold: (x, y) => { input.down = true; input.x = x; input.y = y; input.everTouched = true; hideHint(); },
  release: () => { input.down = false; input.pointerId = null; },
};

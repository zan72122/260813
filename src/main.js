// ネオンサイン職人 — 4歳向けモバイルWebゲーム
// 熱する→柔らかくなる→曲げる→形が残る→暗くする→光る の因果を一本道で体験する。
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildShape, gradColorAt } from './shapes.js';
import { NeonTube } from './neonTube.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { initAudio, popSound, hissOn, hissOff, igniteSound, chime } from './audio.js';

// ---------- 基本セットアップ ----------
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141021);
scene.fog = new THREE.FogExp2(0x141021, 0.085);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
camera.position.set(0, 1.5, 3.2);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.55, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const world = new World(scene);
const tube = new NeonTube(scene);
const fx = new FX(scene);
fx.sparks.mat.uniforms.uPR.value = renderer.getPixelRatio();
fx.twinkles.mat.uniforms.uPR.value = renderer.getPixelRatio();

const SIGN = new THREE.Vector3(0, 1.38, -0.32);

// ---------- カメラリグ（自動カメラ鎖・自由カメラなし） ----------
function fitDist(radius, margin = 1.25) {
  const vF = (camera.fov * Math.PI) / 180;
  const hF = 2 * Math.atan(Math.tan(vF / 2) * camera.aspect);
  const f = Math.min(vF, hF);
  return (margin * radius) / Math.tan(f / 2);
}
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

const POSES = {
  overview(time) {
    const d = clamp(fitDist(1.5), 2.3, 5.2);
    const a = 0.10 * Math.sin(time * 0.09);
    const dir = new THREE.Vector3(Math.sin(a) + 0.16, 0.30, Math.cos(a)).normalize();
    const look = new THREE.Vector3(0, 1.18, -0.25);
    return { pos: look.clone().addScaledVector(dir, d), look };
  },
  heatClose() {
    const bp = tube.shape ? tube.bendPointWorld() : SIGN.clone();
    const d = clamp(fitDist(0.30), 0.52, 1.05);
    const dir = new THREE.Vector3(0.48, 0.30, 1).normalize();
    return { pos: bp.clone().addScaledVector(dir, d), look: bp };
  },
  bendView() {
    const d = clamp(fitDist(0.62), 1.0, 2.6);
    const look = new THREE.Vector3(0, 1.40, -0.32);
    const dir = new THREE.Vector3(0.02, 0.15, 1).normalize();
    return { pos: look.clone().addScaledVector(dir, d), look };
  },
  completeView() {
    const d = clamp(fitDist(0.9), 1.5, 3.4);
    const look = new THREE.Vector3(0, 1.30, -0.3);
    const dir = new THREE.Vector3(-0.16, 0.26, 1).normalize();
    return { pos: look.clone().addScaledVector(dir, d), look };
  },
  igniteClose() {
    const d = clamp(fitDist(0.56), 0.95, 2.0);
    const look = SIGN.clone();
    const dir = new THREE.Vector3(0.26, 0.10, 1).normalize();
    return { pos: look.clone().addScaledVector(dir, d), look };
  },
  admire(time) {
    const d = clamp(fitDist(1.0), 1.6, 3.2);
    const a = 0.24 * Math.sin(time * 0.14);
    const look = new THREE.Vector3(0, 1.34, -0.3);
    const dir = new THREE.Vector3(Math.sin(a) + 0.04, 0.20 + 0.04 * Math.sin(time * 0.1), Math.cos(a)).normalize();
    return { pos: look.clone().addScaledVector(dir, d), look };
  },
};

class Rig {
  constructor() {
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.poseFn = POSES.overview;
    const p = this.poseFn(0);
    this.pos.copy(p.pos); this.look.copy(p.look);
    this.trans = null;
  }
  goTo(poseFn, dur = 1.6) {
    return new Promise((resolve) => {
      this.trans = {
        fromPos: this.pos.clone(), fromLook: this.look.clone(),
        toFn: poseFn, t: 0, dur, resolve,
      };
      this.poseFn = poseFn;
    });
  }
  update(dt, time) {
    if (this.trans) {
      const tr = this.trans;
      tr.t += dt / tr.dur;
      const k = smooth(clamp(tr.t, 0, 1));
      const target = tr.toFn(time);
      this.pos.lerpVectors(tr.fromPos, target.pos, k);
      this.look.lerpVectors(tr.fromLook, target.look, k);
      if (tr.t >= 1) { this.trans = null; tr.resolve(); }
    } else if (this.poseFn) {
      const target = this.poseFn(time);
      const k = Math.min(1, dt * 2.2);
      this.pos.lerp(target.pos, k);
      this.look.lerp(target.look, k);
    }
    // かすかな手持ち感
    const bx = Math.sin(time * 0.7) * 0.006, by = Math.sin(time * 0.9 + 2) * 0.005;
    camera.position.set(this.pos.x + bx, this.pos.y + by, this.pos.z);
    camera.lookAt(this.look);
  }
}
const rig = new Rig();

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const ui = {
  title: $('title'), darkBtn: $('darkBtn'), powerBtn: $('powerBtn'),
  againBtn: $('againBtn'), hand: $('hand'),
};
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

// 長押しボタン（リングが満ちたら発火）
function holdButton(el, seconds, onComplete) {
  const ring = el.querySelector('.ringFill');
  let raf = 0, start = 0, active = false;
  const reset = () => { if (ring) ring.style.strokeDashoffset = 302; cancelAnimationFrame(raf); active = false; };
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    try { el.setPointerCapture?.(e.pointerId); } catch (err) { /* 合成イベント等 */ }
    initAudio();
    active = true; start = performance.now();
    const step = () => {
      if (!active) return;
      const f = Math.min((performance.now() - start) / (seconds * 1000), 1);
      if (ring) ring.style.strokeDashoffset = 302 * (1 - f);
      if (f >= 1) { reset(); onComplete(); return; }
      raf = requestAnimationFrame(step);
    };
    step();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
    el.addEventListener(ev, () => {
      // 低フレームレート環境でrAFが遅れても、押していた時間で完了判定
      const done = active && (performance.now() - start) >= seconds * 1000;
      reset();
      if (done) onComplete();
    }));
}

// 手のヒント
const handState = { mode: 'hidden', world: new THREE.Vector3() };
function setHand(mode) {
  if (mode === handState.mode) return;
  handState.mode = mode;
  if (mode === 'hidden') { hide(ui.hand); ui.hand.classList.remove('press'); }
  else {
    show(ui.hand);
    ui.hand.classList.toggle('press', mode === 'press');
  }
}
const _proj = new THREE.Vector3();
function worldToScreen(v) {
  _proj.copy(v).project(camera);
  return {
    x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
    y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
    behind: _proj.z > 1,
  };
}
function updateHand(time) {
  if (handState.mode === 'hidden') return;
  let wp;
  if (handState.mode === 'press') {
    wp = tube.bendPointWorld(new THREE.Vector3());
  } else {
    // ガイド上を先へなぞるループアニメ
    const cyc = (time % 1.6) / 1.6;
    const s = Math.min(game.t + 0.015 + cyc * 0.11, 1);
    wp = tube.pointWorldAt(s, new THREE.Vector3());
  }
  const sp = worldToScreen(wp);
  const w = ui.hand.offsetWidth;
  ui.hand.style.transform =
    `translate(${sp.x - w * 0.5}px, ${sp.y - w * 0.33}px)`;
}

// ---------- ゲーム状態機械 ----------
const game = {
  state: 'TITLE',
  shape: null,
  t: 0,          // 曲げ進捗 0..1
  soft: 0,       // 柔らかさ 0..1
  heat: 0,       // 加熱ゲージ 0..1
  pressing: false,
  pointerId: null,
  darkness: 0,
  igniteT: 0,
  neon: 0,
  stateT: 0,
  hintTimer: 0,
};

const raycaster = new THREE.Raycaster();
const signPlane = new THREE.Plane();
function updateSignPlane() {
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(tube.group.quaternion);
  signPlane.setFromNormalAndCoplanarPoint(n, tube.group.position);
}
updateSignPlane();

function pointerToWorldOnPlane(x, y) {
  const nx = (x / window.innerWidth) * 2 - 1;
  const ny = -(y / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera({ x: nx, y: ny }, camera);
  const out = new THREE.Vector3();
  return raycaster.ray.intersectPlane(signPlane, out) ? out : null;
}

function setState(s) {
  game.state = s;
  game.stateT = 0;
}

// 点灯フリッカーのキーフレーム（本物のネオンの「ジジッ…パッ」）
const FLICK = [
  [0.00, 0], [0.50, 0], [0.56, 1], [0.64, 0.12], [0.88, 0.06],
  [0.95, 0.95], [1.05, 0.18], [1.28, 0.10], [1.36, 1],
];
function flickerValue(t) {
  if (t >= FLICK[FLICK.length - 1][0]) return 1;
  let v = 0;
  for (const [kt, kv] of FLICK) { if (t >= kt) v = kv; else break; }
  return v;
}

// --- 状態遷移 ---
async function selectShape(name) {
  if (game.state !== 'TITLE') return;
  initAudio(); popSound();
  game.shape = buildShape(name);
  tube.setShape(game.shape);
  game.t = 0; game.soft = 0; game.heat = 0; game.neon = 0;
  hide(ui.title);
  setState('INTRO');
  await rig.goTo(POSES.overview, 1.4);        // 全景
  await wait(0.5);
  await rig.goTo(POSES.heatClose, 1.7);       // 加熱接写
  setState('HEAT');
}

function wait(sec) {
  return new Promise((r) => setTimeout(r, sec * 1000));
}

async function onHeatComplete(first) {
  if (game.state !== 'HEAT' && game.state !== 'REHEAT') return;
  setState('SOFTEN'); // 遷移中の多重発火を防ぐ
  chime();
  game.soft = 1;
  game.heat = 0;
  hissOff();
  fx.setFlame(null, 0);
  if (first) {
    tube.showGuide(1);
    await rig.goTo(POSES.bendView, 1.6);       // 曲げビューへ
  }
  setState('BEND');
}

async function onBendComplete() {
  setState('FINALIZE');
  hissOff();
  fx.setFlame(null, 0);
  tube.finalize();
  tube.showGuide(0);
  chime();
  // 完成のきらめき
  fx.burstTwinkles(
    (s) => tube.pointWorldAt(s, new THREE.Vector3()),
    26,
    (s) => gradColorAt(game.shape, s).multiplyScalar(0.9)
  );
  await rig.goTo(POSES.completeView, 2.0);     // 完成全景
  await wait(0.9);
  show(ui.darkBtn);
  setState('WAIT_DARK');
}

async function onDarkPressed() {
  hide(ui.darkBtn);
  popSound();
  setState('DARKEN');
  // tick内で darkness を 1 へ
}

async function onPowerPressed() {
  hide(ui.powerBtn);
  setState('IGNITE_CAM');
  igniteSound();
  await rig.goTo(POSES.igniteClose, 1.3);      // 点灯接写
  game.igniteT = 0;
  setState('IGNITE');
}

async function onIgnited() {
  // 全点灯の瞬間
  fx.burstTwinkles(
    (s) => tube.pointWorldAt(s, new THREE.Vector3()),
    44,
    (s) => gradColorAt(game.shape, s)
  );
  fx.setDustTint(game.shape.avg.clone().lerp(new THREE.Color(1, 1, 1), 0.4), 0.3);
  setState('ADMIRE');
  rig.goTo(POSES.admire, 5.0);                 // 鑑賞（ゆっくり漂う）
  await wait(3.2);
  show(ui.againBtn);
}

async function onAgain() {
  hide(ui.againBtn);
  popSound();
  setState('RESET');
  // 作品を壁のギャラリーへ
  try {
    const pts = tube.snapshotPoints();
    if (pts) {
      world.addGalleryPiece(pts, game.shape.grad, null, 0.85);
      saveGallery(pts, game.shape);
    }
  } catch (e) { /* gallery is best-effort */ }
  tube.hide(); // ベンチ上の作品は壁に移した
  game.neon = 0;
  await rig.goTo(POSES.overview, 1.8);
  setState('TITLE');
  show(ui.title);
}

// ギャラリーの永続化
function saveGallery(pts, shape) {
  try {
    const key = 'neon-gallery-v1';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.push({ pts, grad: shape.grad.map((g) => [g.stop, g.color.getHex()]) });
    while (list.length > 4) list.shift();
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) { /* private mode等では保存しない */ }
}
function loadGallery() {
  try {
    const list = JSON.parse(localStorage.getItem('neon-gallery-v1') || '[]');
    for (const item of list) {
      world.addGalleryPiece(
        item.pts,
        item.grad.map(([stop, hex]) => ({ stop, color: new THREE.Color(hex) })),
        null, 0.85
      );
    }
  } catch (e) { /* ignore */ }
}
loadGallery();

// ---------- 入力（一指のみ・強い補正） ----------
let lastDragWorld = null;
function onPointerDown(e) {
  if (game.pointerId !== null) return; // 2本目以降は無視
  game.pointerId = e.pointerId;
  game.pressing = true;
  initAudio();
  if (game.state === 'HEAT' || game.state === 'REHEAT') hissOn();
  if (game.state === 'BEND') lastDragWorld = pointerToWorldOnPlane(e.clientX, e.clientY);
}
function onPointerMove(e) {
  if (e.pointerId !== game.pointerId) return;
  if (game.state === 'BEND' && game.pressing) {
    const wp = pointerToWorldOnPlane(e.clientX, e.clientY);
    if (wp) lastDragWorld = wp;
  }
}
function onPointerUp(e) {
  if (e.pointerId !== game.pointerId) return;
  game.pointerId = null;
  game.pressing = false;
  lastDragWorld = null;
  hissOff();
}
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);

// ボタン
document.querySelectorAll('.shapeBtn').forEach((btn) => {
  btn.addEventListener('pointerup', () => selectShape(btn.dataset.shape));
});
holdButton(ui.darkBtn, 0.45, onDarkPressed);
holdButton(ui.powerBtn, 0.55, onPowerPressed);
ui.againBtn.addEventListener('pointerup', onAgain);

// ---------- 毎フレームの状態更新 ----------
const HEAT_RATE = 0.85;
const HEAT_DECAY = 0.35;
const SOFT_PER_PROGRESS = 2.7;   // 1回の加熱で進める割合 ≈ 0.37
const MAX_BEND_RATE = 0.30;      // 進捗/秒の上限（暴れ防止）

function tick(dt, time) {
  game.stateT += dt;
  const st = game.state;

  // トーチと加熱の共通処理
  const heatingState = st === 'HEAT' || st === 'REHEAT';
  if (heatingState) {
    const bp = tube.bendPointWorld(new THREE.Vector3());
    world.aimTorch(bp, dt);
    const tip = world.torchTipWorld();
    if (game.pressing) {
      game.heat = Math.min(1, game.heat + dt * HEAT_RATE);
      fx.setFlame(tip, 1);
      if (Math.random() < 0.6) fx.burstSparks(bp, 2);
      setHand('hidden');
    } else {
      game.heat = Math.max(0, game.heat - dt * HEAT_DECAY);
      fx.setFlame(tip, 0.18); // 種火
      setHand('press');
    }
    tube.setHeat(Math.max(game.heat, game.soft * 0.75));
    if (game.heat >= 1) onHeatComplete(st === 'HEAT');
  } else if (st === 'BEND') {
    world.restTorch(dt);
    fx.setFlame(world.torchTipWorld(), 0.12);
    // 柔らかさの自然冷却はごく緩やか（急かさない）
    game.soft = Math.max(0, game.soft - dt * 0.012);
    tube.setHeat(game.soft * 0.75);

    if (game.pressing && lastDragWorld) {
      const res = tube.projectToGuide(lastDragWorld, 0.18);
      if (res && res.dist < 0.5) {
        const softFactor = clamp(game.soft / 0.1, 0, 1);
        const step = clamp(res.s - game.t, 0, MAX_BEND_RATE * dt * softFactor);
        if (step > 0) {
          game.t = Math.min(1, game.t + step);
          tube.setProgress(game.t);
          game.soft = Math.max(0, game.soft - step * SOFT_PER_PROGRESS);
          tube.addWobble(res.lateral * 0.55);
          if (Math.random() < 0.25) {
            fx.softTwinkle(
              (s) => tube.bendPointWorld(new THREE.Vector3()),
              () => new THREE.Color(0xffd9a0)
            );
          }
        }
      }
      setHand('hidden');
    } else {
      setHand('drag');
    }
    if (game.t >= 0.993) { onBendComplete(); }
    else if (game.soft <= 0.02) { game.heat = 0; setState('REHEAT'); }
  } else if (st === 'DARKEN') {
    game.darkness = Math.min(1, game.darkness + dt / 2.0);
    world.setDarkness(smooth(game.darkness));
    fx.setDustTint(new THREE.Color(0xbfd0ff), 0.10);
    if (game.darkness >= 1) {
      show(ui.powerBtn);
      setState('WAIT_POWER');
    }
  } else if (st === 'IGNITE') {
    game.igniteT += dt;
    const v = flickerValue(game.igniteT);
    game.neon = v;
    if (game.igniteT >= 1.45 && !game._ignDone) {
      game._ignDone = true;
      onIgnited();
    }
  } else if (st === 'ADMIRE') {
    // 点灯後のかすかな明滅（生きている光）
    game.neon = 1 + Math.sin(time * 9) * 0.025 + Math.sin(time * 23.7) * 0.015;
    if (Math.random() < dt * 2.2) {
      fx.softTwinkle(
        (s) => tube.pointWorldAt(s, new THREE.Vector3()),
        (s) => gradColorAt(game.shape, s).multiplyScalar(0.8)
      );
    }
  } else if (st === 'TITLE') {
    world.restTorch(dt);
    fx.setFlame(world.torchTipWorld(), 0.12);
    setHand('hidden');
    if (game.darkness > 0) {
      game.darkness = Math.max(0, game.darkness - dt / 1.6);
      world.setDarkness(smooth(game.darkness));
      game.neon = Math.max(0, game.neon - dt * 2);
      if (game.darkness <= 0) {
        fx.setDustTint(new THREE.Color(0xfff2d8), 0.35);
        game._ignDone = false;
      }
    }
  } else {
    setHand('hidden');
    if (st !== 'WAIT_DARK' && st !== 'WAIT_POWER') {
      world.restTorch(dt);
    }
  }

  // ネオン描画の反映
  if (game.shape) {
    tube.setNeon(game.neon, game.shape.avg);
    world.setNeonLight(clamp(game.neon, 0, 1), game.shape, tube);
  }
  bloom.strength = 0.22 + game.darkness * 0.13 + clamp(game.neon, 0, 1.1) * 0.42;
}

// ---------- ループ ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05) * (window.__neonTimeScale || 1);
  const time = clock.elapsedTime;
  tick(dt, time);
  rig.update(dt, time);
  world.update(dt, time);
  tube.update(time);
  fx.update(dt, time);
  updateHand(time);
  composer.render();
}

// ---------- リサイズ（縦横両対応） ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));
resize();
loop();

// ---------- テスト用デバッグAPI ----------
window.__neon = {
  get state() { return game.state; },
  get t() { return game.t; },
  get soft() { return game.soft; },
  get neon() { return game.neon; },
  get darkness() { return game.darkness; },
  guideScreen(s) {
    const wp = tube.pointWorldAt(s, new THREE.Vector3());
    return worldToScreen(wp);
  },
  bendScreen() {
    return worldToScreen(tube.bendPointWorld(new THREE.Vector3()));
  },
  selectShape,
  _refs: { bloom, world, tube, fx, game, scene, renderer, rig, POSES },
  // 再レンダ直後に輝度を測る（preserveDrawingBuffer無しでも読めるように同期で）
  luma() {
    composer.render();
    const t = document.createElement('canvas');
    t.width = 64; t.height = 64;
    const ctx = t.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0, mx = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      sum += v; mx = Math.max(mx, v);
    }
    return { avg: sum / (d.length / 4), max: mx };
  },
};

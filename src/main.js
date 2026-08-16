// ぺちゃんこフィールド — 4歳向けモバイルWeb 3Dゲーム
//
// 固有動作鎖:
//   フィールドを重ねる → 押し続ける → ギューッと潰れる → ペラペラになる
//   → 隙間をスルッと通す → 指を離す → ポン！と元に戻る
//
// 操作は一本指のみ:
//   指を置く/動かす = フィールドが指に付いてくる
//   物の上で押さえる = ぺちゃんこになっていく（動かすと潰れは進みにくい）
//   ぺちゃんこのまま引きずる = 一緒に移動
//   指を離す = ポン！と復元
//
// 文字・得点・失敗・制限時間なし。

import * as THREE from 'three';
import { Field } from './field.js';
import { buildThing, applySquash } from './things.js';
import { STAGES, PLAY, buildWall, canCrossWall } from './stages.js';
import { initFxTextures, Particles, makeGoalMat } from './fx.js';
import * as SFX from './audio.js';

const E2E = new URLSearchParams(location.search).has('e2e');

// ---------- 基本セットアップ ----------
const renderer = new THREE.WebGLRenderer({ antialias: !E2E, powerPreference: 'high-performance' });
renderer.setPixelRatio(E2E ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();

// 空: やわらかいグラデーション
{
  const c = document.createElement('canvas');
  c.width = 16; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#ffe3f2');
  grad.addColorStop(0.5, '#fff6e8');
  grad.addColorStop(1, '#d9f3ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);

// ライト（影はブロブ影で偽装するのでシャドウマップは使わない）
scene.add(new THREE.HemisphereLight(0xfff0f5, 0xd8c8a8, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(5, 12, 6);
scene.add(sun);

// 床: 手前があたたかい色、壁の向こうはミント色 → 「向こう側」が一目で分かる
{
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#c9ecd9');
  grad.addColorStop(0.47, '#d9f2e2');
  grad.addColorStop(0.53, '#ffeeda');
  grad.addColorStop(1, '#ffe3cf');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    g.fillStyle = ['#ffffff22', '#ffd6e622', '#c8f0ff22', '#fff3b022'][i % 4];
    const r = 8 + rnd() * 22;
    g.beginPath();
    g.arc(rnd() * 512, rnd() * 512, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 40),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

initFxTextures();
const particles = new Particles(scene, E2E ? 40 : 160);
const field = new Field(scene);

// ゴールマット（壁の向こうの目印）
const goalMat = makeGoalMat(1.7);
goalMat.position.set(0, 0, -4.4);
scene.add(goalMat);

// ---------- ゲーム状態 ----------
const game = {
  stageIndex: 0,
  stageDef: null,
  state: 'play',       // 'play' | 'clear'
  clearT: 0,
  wall: null,
  things: [],
  captured: null,
  time: 0,
  idleT: 0,
  blockedCoolT: 0,
  camMode: 'main',
  camHoldT: 0,
  camFocus: null
};

function clearStage() {
  if (game.wall) { scene.remove(game.wall); }
  for (const t of game.things) {
    scene.remove(t.group);
    scene.remove(t.shadow);
  }
  game.things = [];
  game.captured = null;
}

function loadStage(i) {
  clearStage();
  game.stageIndex = i;
  game.stageDef = STAGES[i];
  game.state = 'play';
  game.wall = buildWall(game.stageDef);
  scene.add(game.wall);
  goalMat.position.x = game.stageDef.gap.x;

  const spawn = (entry, isTarget) => {
    const t = buildThing(entry.kind, { isTarget });
    t.group.position.set(entry.pos[0], 0, entry.pos[1]);
    t.home.set(entry.pos[0], 0, entry.pos[1]);
    t.spawnT = 0; // ポップイン
    scene.add(t.group);
    scene.add(t.shadow);
    game.things.push(t);
  };
  for (const e of game.stageDef.things) spawn(e, true);
  for (const e of game.stageDef.decor) spawn(e, false);

  field.grow(game.stageDef.fieldRadius);
  field.target.set(0, 0, 4.6);
  if (i > 0) SFX.sfxGrow();
}

// ---------- 入力（一本指） ----------
const input = {
  down: false,
  pointerId: null,
  screen: new THREE.Vector2(),
  world: new THREE.Vector3(0, 0, 4),
  prevWorld: new THREE.Vector3(0, 0, 4),
  speed: 0,
  isTouch: false
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function screenToGround(cx, cy, out) {
  // 指による遮蔽対策: タッチ時は指先より少し上をつまむ
  const lift = input.isTouch ? Math.min(72, window.innerHeight * 0.09) : 0;
  ndc.set((cx / window.innerWidth) * 2 - 1, -((cy - lift) / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  if (Math.abs(d.y) < 1e-5) return false;
  const t = -o.y / d.y;
  if (t < 0) return false;
  out.set(o.x + d.x * t, 0, o.z + d.z * t);
  out.x = Math.min(Math.max(out.x, -PLAY.halfW + 0.3), PLAY.halfW - 0.3);
  out.z = Math.min(Math.max(out.z, PLAY.farZ + 0.4), PLAY.nearZ - 0.4);
  return true;
}

function onDown(e) {
  if (input.down) return; // 一本指のみ
  input.down = true;
  input.pointerId = e.pointerId;
  input.isTouch = e.pointerType === 'touch';
  SFX.unlockAudio();
  screenToGround(e.clientX, e.clientY, input.world);
  input.prevWorld.copy(input.world);
  SFX.sfxTouch();
}
function onMove(e) {
  if (!input.down || e.pointerId !== input.pointerId) return;
  screenToGround(e.clientX, e.clientY, input.world);
}
function onUp(e) {
  if (!input.down || e.pointerId !== input.pointerId) return;
  input.down = false;
  input.pointerId = null;
  releaseCaptured();
}
window.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
window.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

// ---------- 潰す・運ぶ・戻す ----------
const logicalHeight = t => {
  const flatRatio = t.flatHeight / t.height;
  const s = t.squash;
  const e = s * s * (3 - 2 * s);
  return t.height * (1 + (flatRatio - 1) * e);
};

function tryCapture() {
  if (game.captured) return;
  let best = null, bestD = Infinity;
  for (const t of game.things) {
    if (t.hopT >= 0 || t.pendingRestore || t.restoring || t.delivered) continue;
    const d = Math.hypot(t.group.position.x - field.pos.x, t.group.position.z - field.pos.z);
    const df = Math.hypot(t.group.position.x - input.world.x, t.group.position.z - input.world.z);
    // フィールドが覆っていて、かつ指がその物の上にある（通りすがりに引っかからない）
    if (d < field.radius * 0.95 + 0.25 && df < t.radius + 0.9 && d < bestD) {
      best = t; bestD = d;
    }
  }
  if (best) {
    game.captured = best;
    best.captured = true;
    SFX.sfxTouch();
  }
}

function releaseCaptured() {
  const t = game.captured;
  if (!t) return;
  game.captured = null;
  t.captured = false;
  if (t.squash < 0.03) return;

  const r = t.radius * (1 + 0.34 * t.squash);
  const band = PLAY.wallBand;
  if (Math.abs(t.group.position.z) < band + r * 0.55) {
    // 壁の下で離した → いったん近い側へスルッと出てからポン
    const side = t.group.position.z <= 0 ? -1 : 1;
    t.pendingRestore = true;
    t.nudgeZ = side * (band + r * 0.7 + 0.15);
  } else {
    startRestore(t);
  }
  // 復元の瞬間を見せるカメラ
  if (t.group.position.z < 0) {
    game.camMode = 'after';
    game.camFocus = t;
    game.camHoldT = 1.9;
  }
}

function startRestore(t) {
  t.pendingRestore = false;
  t.squash = 0;
  t.restoring = true;
  t.wobble = 0.9;
  t.lastStep = 0;
  SFX.sfxPon();
  particles.spawn(
    new THREE.Vector3(t.group.position.x, 0.25, t.group.position.z),
    { color: 0xffffff, n: E2E ? 4 : 14, speed: 2.6, up: 3.2, life: 0.6, size: 0.3 }
  );
}

function onRestored(t) {
  const r = t.radius;
  if (t.isTarget && !t.delivered && t.group.position.z < -(PLAY.wallBand + r * 0.4)) {
    t.delivered = true;
    t.hopT = 0;
    SFX.sfxDeliver();
    particles.spawn(
      new THREE.Vector3(t.group.position.x, t.height * 0.7, t.group.position.z),
      { color: 0xffd166, n: E2E ? 6 : 22, speed: 3.2, up: 4, life: 1.0, size: 0.34, star: true }
    );
    particles.spawn(
      new THREE.Vector3(t.group.position.x, t.height * 0.5, t.group.position.z),
      { color: 0xff8fab, n: E2E ? 4 : 14, speed: 2.4, up: 3, life: 0.9, size: 0.26 }
    );
    if (game.things.filter(x => x.isTarget).every(x => x.delivered)) {
      game.state = 'clear';
      game.clearT = 0;
    }
  }
}

// ---------- 更新 ----------
function step(dt) {
  game.time += dt;

  // 指の速度（動かしている間は潰れが進みにくい → 「押さえるとギューッ」が際立つ）
  const inst = input.world.distanceTo(input.prevWorld) / Math.max(dt, 1e-4);
  input.speed += (Math.min(inst, 8) - input.speed) * Math.min(1, 10 * dt);
  input.prevWorld.copy(input.world);

  // フィールドの目標: 捕まえている物があればその物に貼り付く。なければ指へ。
  if (input.down) {
    game.idleT = 0;
    if (game.captured) {
      field.setTarget(game.captured.group.position.x, game.captured.group.position.z);
    } else {
      field.setTarget(input.world.x, input.world.z);
    }
  } else {
    game.idleT += dt;
    if (game.idleT > 7) {
      // 退屈したら光ってさそう（文字なしのヒント）
      field.growFx = Math.max(field.growFx, 0.6);
      SFX.sfxTouch();
      game.idleT = 3.5;
    }
  }

  // 捕まえる判定
  if (input.down && game.state === 'play') tryCapture();

  const capt = game.captured;
  let squashing = false;

  if (capt && input.down) {
    // --- 潰す ---
    const still = Math.min(Math.max(1.18 - input.speed * 0.55, 0.1), 1);
    if (capt.squash < 1) {
      const before = capt.squash;
      capt.squash = Math.min(1, capt.squash + dt * 0.62 * still);
      squashing = still > 0.35;
      // ギュッ、ギュッ、と段階音
      const steps = [0.18, 0.42, 0.66, 0.88];
      for (let i = 0; i < steps.length; i++) {
        if (before < steps[i] && capt.squash >= steps[i] && capt.lastStep <= i) {
          capt.lastStep = i + 1;
          SFX.sfxSquish(i);
          particles.spawn(
            new THREE.Vector3(capt.group.position.x, 0.15, capt.group.position.z),
            { color: 0xffffff, n: E2E ? 2 : 5, speed: 1.6, up: 1.2, life: 0.4, size: 0.18 }
          );
          if (navigator.vibrate) navigator.vibrate(18);
        }
      }
      if (before < 1 && capt.squash >= 1) {
        // ペタッ！ 完全にぺちゃんこ
        SFX.sfxFlat();
        capt.wobble = 0.8;
        particles.spawn(
          new THREE.Vector3(capt.group.position.x, 0.12, capt.group.position.z),
          { color: 0xfff3b0, n: E2E ? 4 : 12, speed: 2.8, up: 0.9, gravity: -2, life: 0.5, size: 0.22 }
        );
        if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
      }
    }

    // --- 運ぶ（壁との判定込み） ---
    const p = capt.group.position;
    const r = capt.radius * (1 + 0.34 * capt.squash * 0.8);
    const h = logicalHeight(capt);
    const follow = Math.min(1, (2.5 + capt.squash * 8) * dt); // ぺちゃんこなほど軽く動く
    let nx = p.x + (input.world.x - p.x) * follow;
    let nz = p.z + (input.world.z - p.z) * follow;

    nx = Math.min(Math.max(nx, -PLAY.halfW + r * 0.7), PLAY.halfW - r * 0.7);
    nz = Math.min(Math.max(nz, PLAY.farZ + r * 0.6), PLAY.nearZ - r * 0.6);

    const band = PLAY.wallBand;
    const allowed = canCrossWall(game.stageDef, nx, h, r) && capt.squash >= 0.97;
    const wasSide = p.z >= 0 ? 1 : -1;
    const enteringBand = Math.abs(nz) < band + r * 0.5;

    if (enteringBand && !allowed) {
      // 厚くて通れない！（または隙間の位置ではない）
      nz = wasSide * (band + r * 0.5);
      const pushing = wasSide * (input.world.z - p.z) < -0.2;
      if (pushing && game.blockedCoolT <= 0) {
        game.blockedCoolT = 0.9;
        SFX.sfxBlocked();
        capt.wobble = Math.max(capt.wobble, 0.5);
        particles.spawn(
          new THREE.Vector3(nx, Math.min(h, 1.2) * 0.6, wasSide * band),
          { color: 0xffffff, n: E2E ? 2 : 6, speed: 1.4, up: 1.6, life: 0.45, size: 0.2 }
        );
      }
    } else if (enteringBand && allowed) {
      // 通過中は隙間の幅に収める
      const gap = game.stageDef.gap;
      const gmin = gap.x - (gap.halfW - Math.min(r * 0.25, 0.3));
      const gmax = gap.x + (gap.halfW - Math.min(r * 0.25, 0.3));
      nx = Math.min(Math.max(nx, gmin), gmax);
      if (!capt.crossing) {
        capt.crossing = true;
        SFX.sfxSlide();
      }
      particles.spawn(
        new THREE.Vector3(nx, 0.1, nz),
        { color: 0xc8f0ff, n: 1, speed: 0.5, up: 0.8, life: 0.35, size: 0.16 }
      );
    } else {
      capt.crossing = false;
    }

    p.x = nx; p.z = nz;
  }

  game.blockedCoolT = Math.max(0, game.blockedCoolT - dt);

  // 各物体の更新
  for (const t of game.things) {
    // ポップイン
    if (t.spawnT < 1) {
      t.spawnT = Math.min(1, t.spawnT + dt * 1.8);
      const e = 1 - Math.pow(1 - t.spawnT, 3);
      const over = 1 + Math.sin(t.spawnT * Math.PI) * 0.12;
      t.group.scale.setScalar(Math.max(e * over, 0.001));
    }
    // 壁の下で離した後のスルッと退出 → ポン
    if (t.pendingRestore) {
      const dz = t.nudgeZ - t.group.position.z;
      const stepz = Math.sign(dz) * Math.min(Math.abs(dz), 6 * dt);
      t.group.position.z += stepz;
      if (Math.abs(dz) < 0.04) startRestore(t);
    }
    const wasRestoring = t.restoring;
    applySquash(t, dt);
    if (wasRestoring && !t.restoring) onRestored(t);

    // お届けよろこびホップ
    if (t.hopT >= 0) {
      t.hopT += dt;
      const T = t.hopT;
      if (T < 1.1) {
        t.group.position.y = Math.abs(Math.sin(T * Math.PI * 2.4)) * 0.34 * (1 - T * 0.7);
        t.group.rotation.y = Math.sin(T * Math.PI) * 0.6;
      } else {
        t.group.position.y = 0;
        t.group.rotation.y = 0;
        t.hopT = -1;
      }
    }
  }

  // ステージクリア進行
  if (game.state === 'clear') {
    game.clearT += dt;
    if (game.clearT < 2.6) {
      if (Math.floor(game.clearT * 3) !== Math.floor((game.clearT - dt) * 3)) {
        const x = (Math.random() - 0.5) * 6;
        const z = -3 + (Math.random() - 0.5) * 4;
        particles.spawn(
          new THREE.Vector3(x, 2.5, z),
          { color: [0xffd166, 0xff8fab, 0x8ecae6, 0xb5e48c][Math.floor(Math.random() * 4)],
            n: E2E ? 3 : 10, speed: 2, up: 2.5, life: 1.1, size: 0.3, star: Math.random() > 0.5 }
        );
      }
      if (game.clearT - dt <= 0 && game.clearT > 0) SFX.sfxFanfare();
    } else {
      loadStage((game.stageIndex + 1) % STAGES.length);
    }
  }

  field.update(dt, input.down, squashing);
  particles.update(dt);
  goalMat.userData.star.rotation.z += dt * 0.4;
  const gpulse = 1 + Math.sin(game.time * 2.4) * 0.06;
  goalMat.scale.setScalar(gpulse);

  updateCamera(dt);
}

// ---------- カメラ ----------
// 通常: 3/4 俯瞰。隙間へ近づいたら低い横視点へ。通過後は少し引いて「ポン」を見せる。
const camPos = new THREE.Vector3(0, 11, 12);
const camLook = new THREE.Vector3(0, 0, 0);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();

function updateCamera(dt) {
  const aspect = window.innerWidth / window.innerHeight;
  const pf = aspect < 1 ? 1.32 : 1.0; // 縦画面は少し引く
  const zoomK = 0.82 + field.targetRadius * 0.14;
  const gap = game.stageDef.gap;
  const capt = game.captured;

  // モード決定
  let mode = 'main';
  let focus = game.camFocus;
  if (game.state === 'clear') {
    mode = 'overview';
  } else if (game.camHoldT > 0 && focus) {
    mode = 'after';
    game.camHoldT -= dt;
    if (game.camHoldT <= 0) game.camFocus = null;
  } else if (capt && capt.squash > 0.55 && capt.group.position.z < 2.3) {
    // 隙間へ近づいたら低い視点へ。壁を越えたら向こう側を見せる。
    mode = capt.group.position.z > -1.6 ? 'gap' : 'far';
  }
  game.camMode = mode;

  if (mode === 'gap') {
    // 低いななめ横視点（遊び場の内側から）:
    // 隙間の高さと、ぺちゃんこの薄さが同じ画面で分かる
    // 壁寄り・低めに構えて、手前の他の物体に遮られないようにする
    const side = gap.x > 0.5 ? -1 : 1;
    desiredPos.set(gap.x + side * 3.6 * pf, 1.3, 3.1 * pf);
    desiredLook.set(gap.x, 0.45, 0);
  } else if (mode === 'far') {
    // 壁越しに向こう側の対象を追う
    const f = capt.group.position;
    desiredPos.set(f.x * 0.5, 6.4 * pf, f.z + 6.8 * pf);
    desiredLook.set(f.x, 0.4, f.z);
  } else if (mode === 'after') {
    // 少し引いて「ポン！」を見せる
    const f = focus.group.position;
    desiredPos.set(f.x * 0.5, 7.2 * pf, f.z + 5.4 * pf);
    desiredLook.set(f.x, 0.6, f.z);
  } else if (mode === 'overview') {
    desiredPos.set(0, 12.5 * pf, 9.5 * pf);
    desiredLook.set(0, 0, -1.2);
  } else {
    // 3/4 俯瞰でフィールドをゆるく追う
    const near = aspect < 1 ? 1.0 : 0.86; // 横画面は少し寄る
    const fx = field.pos.x * 0.45;
    const fz = field.pos.z * 0.3;
    desiredPos.set(fx, 10.6 * pf * zoomK * near, 10.2 * pf * zoomK * near + fz);
    desiredLook.set(fx, 0, -0.6 + fz);
  }

  const k = Math.min(1, (mode === 'gap' || mode === 'far' ? 3.2 : 2.4) * dt);
  camPos.lerp(desiredPos, k);
  camLook.lerp(desiredLook, k);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ---------- リサイズ・縦横対応 ----------
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 60));

// ---------- ループ ----------
loadStage(0);
field.pos.set(0, 0, 4.6);

let lastT = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  let dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  if (!E2E) step(dt);
  renderer.render(scene, camera);
});

// ---------- E2E フック（?e2e=1 のときだけ論理時間を手動で進める） ----------
if (E2E) {
  window.__PF = {
    ready: true,
    tick(ms) {
      let remain = ms / 1000;
      while (remain > 0) {
        const dt = Math.min(remain, 1 / 60);
        step(dt);
        remain -= dt;
      }
    },
    down(x, z) {
      input.down = true;
      input.isTouch = false;
      input.world.set(x, 0, z);
      input.prevWorld.set(x, 0, z);
    },
    move(x, z) { input.world.set(x, 0, z); },
    up() {
      input.down = false;
      releaseCaptured();
    },
    state() {
      return {
        stage: game.stageIndex,
        mode: game.state,
        camMode: game.camMode,
        fieldPos: { x: field.pos.x, z: field.pos.z },
        fieldRadius: field.radius,
        captured: game.captured ? game.captured.id : null,
        things: game.things.map(t => ({
          id: t.id, kind: t.kind, isTarget: t.isTarget,
          x: t.group.position.x, z: t.group.position.z,
          squash: t.squash, height: logicalHeight(t),
          delivered: t.delivered
        }))
      };
    }
  };
}

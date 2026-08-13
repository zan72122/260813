import * as THREE from 'three';
import { createWorld } from './world.js';
import { buildClusterGeometry } from './crystal.js';
import { createUI, captureThumb } from './ui.js';
import { loadCodex, record, filled, CELL_COUNT } from './codex.js';
import {
  emptyRecipe,
  buildSpec,
  clampSeed,
  LABEL,
  MAX_SEEDS,
  MAX_CHUNKS,
  MIN_POUR,
} from './recipe.js';
import { sfx, unlock, startFire, stopFire, setMuted, isMuted } from './audio.js';

export const PLAY_STAGES = ['load', 'heat', 'seed', 'cool', 'tilt', 'lift', 'shine'];

/* ---- カメラの決め位置（自由カメラなし・ぜんぶ自動） ---- */
const SHOTS = {
  title: { target: [0, 0.5, 0], radius: 1.9, yaw: 0.22, pitch: 0.5, drift: 0.05 },
  load: { target: [0, 0.35, 0.42], radius: 1.85, yaw: 0, pitch: 0.6, drift: 0.02 },
  heat: { target: [0, 0.34, 0.05], radius: 1.35, yaw: 0.06, pitch: 0.66, drift: 0.02 },
  seed: { target: [0, 0.42, 0], radius: 0.95, yaw: 0, pitch: 0.95, drift: 0.01 },
  cool: { target: [0, 0.45, 0], radius: 1.0, yaw: -0.14, pitch: 0.72, drift: 0.03 },
  tilt: { target: [0.6, 0.42, 0], radius: 1.7, yaw: 0.34, pitch: 0.56, drift: 0.02 },
  lift: { target: [0, 0.7, 0], radius: 1.0, yaw: 0.05, pitch: 0.34, drift: 0.02 },
  shine: { target: [0, 2.55, 0], radius: 0.92, yaw: 0, pitch: 0.24, drift: 0.0 },
};

const SHINE_Y = 2.55;
const PULL_SWEEP = 14; // 引き上げ待ちのあいだに 色が ひとまわりする秒数
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function createGame({ renderer, canvas, fast = false, seed = null }) {
  const world = createWorld({ fast });
  const { scene, camera } = world;

  const state = {
    stage: 'title',
    t: 0,
    stageT: 0,
    idle: 0,
    lastAct: 0, // 最後に何かした時刻（かけら・たねの「もういい」判定に使う）
    heat: 0,
    grow: 0,
    meltLevel: 0,
    tilt: 0,
    poured: 0,
    pool: 0,
    lift: 0,
    grabbed: false,
    crystalTemp: 1, // 引き上げ待ちの温度＝いまの色
    spin: 0,
    spinVel: 0,
    charge: 0,
    rainbow: 0,
    finished: false,
    dim: 1,
    fanSum: 0, // あおいだ強さの合計
    fanTime: 0, // 冷やしていた時間
    recipe: emptyRecipe(1),
    spec: null,
    lastResult: null,
    made: 0,
  };

  let codex = loadCodex();
  const tweens = [];
  const timers = [];
  const tmpV = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const surfacePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** 論理時間で n 秒あとに実行する（テストの tick でも同じように進む） */
  const after = (sec, fn) => timers.push({ t: sec, fn });

  /* ---------------- UI ---------------- */
  const ui = createUI({
    onStart: () => {
      unlock();
      sfx.tap();
      begin();
    },
    onAgain: () => {
      unlock();
      sfx.tap();
      reset();
    },
    onCodex: () => {
      unlock();
      sfx.tap();
      ui.renderCodex(codex);
      ui.showCodexScreen(true);
      ui.setTools({ again: false, codex: false, sound: false });
    },
    onCodexClose: () => {
      sfx.tap();
      ui.showCodexScreen(false);
      ui.setTools({ again: state.stage === 'shine', codex: true });
    },
    onSound: () => {
      const m = !isMuted();
      setMuted(m);
      ui.setMuted(m);
      if (!m) {
        unlock();
        sfx.tap();
      }
    },
    onPickCell: (cell, entry) => {
      if (!entry) return;
      sfx.clink();
      ui.showCodexScreen(false);
      showFromCodex(entry);
      ui.setTools({ again: true, codex: true });
    },
  });
  rebuildCrystal(); // タイトルの時点でも spec を用意しておく
  ui.setStep(-1);
  ui.setTools({ again: false, codex: true });
  ui.showTitle(true);
  ui.setCodexCount(filled(codex), CELL_COUNT);

  /* ---------------- 入力（一本ゆび） ---------------- */
  const pointer = {
    down: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    dx: 0,
    dy: 0,
    moved: 0,
    downT: 0,
    tapped: false,
    tapX: 0,
    tapY: 0,
  };

  const localPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onDown(e) {
    unlock();
    const p = localPos(e);
    pointer.down = true;
    pointer.x = pointer.px = p.x;
    pointer.y = pointer.py = p.y;
    pointer.dx = pointer.dy = 0;
    pointer.moved = 0;
    pointer.downT = state.t;
    state.idle = 0;
    if (canvas.setPointerCapture && e.pointerId != null) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* 無視してよい */
      }
    }
  }

  function onMove(e) {
    if (!pointer.down) return;
    const p = localPos(e);
    pointer.dx += p.x - pointer.px;
    pointer.dy += p.y - pointer.py;
    pointer.moved += Math.abs(p.x - pointer.px) + Math.abs(p.y - pointer.py);
    pointer.px = pointer.x = p.x;
    pointer.py = pointer.y = p.y;
    state.idle = 0;
  }

  function onUp() {
    if (!pointer.down) return;
    pointer.down = false;
    if (pointer.moved < 22 && state.t - pointer.downT < 0.7) {
      pointer.tapped = true;
      pointer.tapX = pointer.x;
      pointer.tapY = pointer.y;
    }
    state.idle = 0;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------- カメラ ---------------- */
  const camPos = new THREE.Vector3(0, 2.4, 4.4);
  const camLook = new THREE.Vector3(0, 0.6, 0);

  function fitDistance(radius) {
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    return radius / Math.max(0.08, Math.sin(Math.min(vHalf, hHalf)));
  }

  function updateCamera(dt, snap = false) {
    const shot = SHOTS[state.stage] || SHOTS.title;
    const portrait = camera.aspect < 1;

    const wantFov = portrait ? 56 : 44;
    camera.fov = snap ? wantFov : damp(camera.fov, wantFov, 3, dt);

    const d = fitDistance(shot.radius);
    const yaw = shot.yaw + Math.sin(state.t * 0.22) * (shot.drift ?? 0);
    const pitch = shot.pitch + Math.sin(state.t * 0.17) * (shot.drift ?? 0) * 0.5;

    const tx = shot.target[0];
    // たてのときは少し下を見て、主役を画面の上のほうに置く（下のボタンとかぶらない）
    const ty = shot.target[1] - shot.radius * (portrait ? 0.16 : 0.1);
    const tz = shot.target[2] ?? 0;

    tmpV.set(
      tx + Math.sin(yaw) * Math.cos(pitch) * d,
      ty + Math.sin(pitch) * d,
      tz + Math.cos(yaw) * Math.cos(pitch) * d,
    );

    const rate = snap ? 1e6 : 2.6;
    camPos.set(
      damp(camPos.x, tmpV.x, rate, dt),
      damp(camPos.y, tmpV.y, rate, dt),
      damp(camPos.z, tmpV.z, rate, dt),
    );
    camLook.set(
      damp(camLook.x, tx, rate, dt),
      damp(camLook.y, ty, rate, dt),
      damp(camLook.z, tz, rate, dt),
    );
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
  }

  function project(v) {
    tmpV.copy(v).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: (tmpV.x * 0.5 + 0.5) * r.width, y: (-tmpV.y * 0.5 + 0.5) * r.height };
  }

  /** 画面のタップ位置を、るつぼの液面の上の座標に変換する */
  function tapToMelt(px, py, surfaceY) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1),
      camera,
    );
    surfacePlane.constant = -(world.crucibleGroup.position.y + surfaceY);
    const hit = raycaster.ray.intersectPlane(surfacePlane, new THREE.Vector3());
    if (!hit) return null;
    return clampSeed({ x: hit.x, z: hit.z });
  }

  function hintHalf() {
    return Math.min(window.innerWidth, window.innerHeight) * 0.12;
  }

  /* ---------------- 進行 ---------------- */
  function setStage(name, { snap = false } = {}) {
    state.stage = name;
    state.stageT = 0;
    state.idle = 0;
    state.lastAct = 0;
    pointer.tapped = false;
    ui.setStep(PLAY_STAGES.indexOf(name));
    ui.hideHint();
    ui.setTools({ again: name === 'shine', codex: true });
    if (name === 'title') ui.showTitle(true);
    onEnterStage(name);
    if (snap) updateCamera(0, true);
  }

  function onEnterStage(name) {
    switch (name) {
      case 'load':
        ui.showTitle(false);
        break;
      case 'heat':
        world.flame.visible = true;
        break;
      case 'seed':
        stopFire();
        world.flameMat.uniforms.uPower.value = 0;
        world.ringMat.uniforms.uPower.value = 0;
        world.flame.visible = false;
        break;
      case 'cool':
        // ここで はじめて 設計図が決まる（たねの数と位置が確定したので）
        rebuildCrystal();
        break;
      case 'lift':
        world.tongs.visible = true;
        world.tongs.position.set(0, 2.7, 0);
        world.setTongsGrip(0);
        state.crystalTemp = 1;
        break;
      case 'shine':
        world.beam.visible = true;
        world.lamp.visible = true;
        world.halo.visible = true;
        world.pedestal.visible = true;
        break;
      default:
        break;
    }
  }

  function begin() {
    reset();
  }

  function reset() {
    stopFire();
    Object.assign(state, {
      heat: 0,
      grow: 0,
      meltLevel: 0,
      tilt: 0,
      poured: 0,
      pool: 0,
      lift: 0,
      grabbed: false,
      crystalTemp: 1,
      spin: 0,
      spinVel: 0,
      charge: 0,
      rainbow: 0,
      finished: false,
      dim: 1,
      fanSum: 0,
      fanTime: 0,
      saidKaku: false,
      lastResult: null,
    });
    tweens.length = 0;
    timers.length = 0;

    const s = seed != null ? seed + state.made * 101 : Math.floor(Math.random() * 1e9);
    state.recipe = emptyRecipe(s);
    rebuildCrystal();

    const m = world.crystalMat.uniforms;
    m.uGrow.value = 0;
    m.uRainbow.value = 0;
    m.uSpin.value = 0;
    m.uSpotlight.value = 0;
    m.uMelt.value = 1;
    m.uFilmBase.value = 0;

    world.crucibleGroup.add(world.crystalHolder);
    world.crystalHolder.position.set(0, 0.09, 0);
    world.crystalHolder.rotation.set(0, 0, 0);
    world.crystalHolder.scale.setScalar(1);
    world.crystal.position.set(0, 0, 0);

    world.crucibleGroup.rotation.z = 0;
    world.setMeltLevel(0);
    world.setPoolLevel(0);
    world.showSeedMarks([], 0);
    world.tongs.visible = false;
    world.beam.visible = false;
    world.lamp.visible = false;
    world.halo.visible = false;
    world.pedestal.visible = false;
    world.haloMat.uniforms.uOpacity.value = 0;
    world.beamMat.uniforms.uOpacity.value = 0;
    world.sparks.visible = false;
    world.sparkMat.uniforms.uOpacity.value = 0;
    world.flame.visible = false;
    world.flameMat.uniforms.uPower.value = 0;
    world.ringMat.uniforms.uPower.value = 0;
    world.skyMat.uniforms.uNiji.value = 0;
    world.meltMat.uniforms.uHeat.value = 0;
    world.meltMat.uniforms.uRainbow.value = 0;
    world.glowMat.uniforms.uHeat.value = 0;

    for (const c of world.chunks) {
      c.visible = true;
      c.position.copy(c.userData.home);
      c.scale.setScalar(1);
      c.userData.inPot = false;
    }
    setStage('load');
  }

  /** いまのレシピから 設計図とジオメトリを 作り直す */
  function rebuildCrystal() {
    state.spec = buildSpec(state.recipe);
    const geo = buildClusterGeometry(state.spec);
    world.setCrystal(state.spec, geo);
    world.crystal.visible = state.stage !== 'load' && state.stage !== 'heat';
  }

  /* ---------------- 1. かけらを入れる（りょう＝大きさ） ---------------- */

  function nearestChunk(px, py) {
    let best = null;
    let bestD = Infinity;
    for (const c of world.chunks) {
      if (c.userData.inPot) continue;
      const s = project(c.position);
      const d = (s.x - px) ** 2 + (s.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function dropChunkIn(chunk) {
    if (!chunk || chunk.userData.inPot) return;
    chunk.userData.inPot = true;
    state.recipe.amount = Math.min(MAX_CHUNKS, state.recipe.amount + 1);
    state.lastAct = state.t;
    sfx.tap();
    ui.setCount(state.recipe.amount, MAX_CHUNKS);

    const from = chunk.position.clone();
    const slot = state.recipe.amount - 1;
    const a = slot * 2.3;
    const rad = slot === 0 ? 0 : 0.42;
    const to = new THREE.Vector3(Math.cos(a) * rad, 0.25, Math.sin(a) * rad);
    tweens.push({
      t: 0,
      dur: 0.5,
      update: (k) => {
        const e = easeOutCubic(k);
        chunk.position.lerpVectors(from, to, e);
        chunk.position.y = from.y + (to.y - from.y) * e + Math.sin(Math.PI * k) * 1.3;
        chunk.rotation.x += 0.12;
        chunk.rotation.z += 0.09;
      },
      done: () => {
        sfx.drop();
        chunk.position.copy(to);
      },
    });
  }

  function updateLoad() {
    if (pointer.tapped) {
      pointer.tapped = false;
      dropChunkIn(nearestChunk(pointer.tapX, pointer.tapY));
    }

    const n = state.recipe.amount;
    // 「もういい」の合図はいらない。手が止まったら つぎへ進む。
    if (n >= MAX_CHUNKS || (n > 0 && state.t - state.lastAct > 1.9)) {
      ui.setCount(-1, MAX_CHUNKS);
      setStage('heat');
      return;
    }

    const next = world.chunks.find((c) => !c.userData.inPot);
    if (next) {
      next.position.y = next.userData.home.y + Math.abs(Math.sin(state.t * 2.4)) * 0.06;
      if (state.idle > 1.6 && n === 0) {
        const s = project(next.position);
        ui.showHint('tap', s.x - hintHalf(), s.y - hintHalf());
      } else {
        ui.hideHint();
      }
      if (state.idle > 9 && n === 0) dropChunkIn(next);
    }
  }

  /* ---------------- 2. 加熱 ---------------- */

  function updateHeat(dt) {
    const holding = pointer.down;
    const power = world.flameMat.uniforms.uPower;
    power.value = damp(power.value, holding ? 1 : 0.08, 5, dt);
    world.ringMat.uniforms.uPower.value = power.value;
    if (holding) {
      startFire();
      state.heat = clamp(state.heat + dt * 0.34, 0, 1);
    } else {
      stopFire();
      state.heat = clamp(state.heat + dt * (state.idle > 5 ? 0.1 : 0) - dt * 0.01, 0, 1);
    }

    const meltAmt = clamp((state.heat - 0.12) / 0.55, 0, 1);
    for (const c of world.chunks) {
      if (!c.userData.inPot) continue;
      c.scale.setScalar(Math.max(0.001, 1 - meltAmt));
      c.visible = meltAmt < 0.98;
      c.rotation.y += dt * 0.6;
    }
    // かけらの数が そのまま 液の量になる
    state.meltLevel = meltAmt * (0.45 + 0.55 * (state.recipe.amount / MAX_CHUNKS));
    world.setMeltLevel(state.meltLevel);
    world.meltMat.uniforms.uHeat.value = state.heat;
    world.crucibleMat.uniforms.uHeat.value = state.heat;
    world.burnerMat.uniforms.uHeat.value = state.heat * 0.6;
    world.matMat.uniforms.uHeat.value = state.heat * 0.25;
    world.glowMat.uniforms.uHeat.value = state.heat;

    if (state.heat > 0.55 && Math.random() < dt * 6) {
      sfx.bubble();
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.55;
      world.emitDrop(
        Math.cos(a) * r,
        0.1 + state.meltLevel * 0.3,
        Math.sin(a) * r,
        (Math.random() - 0.5) * 0.25,
        0.6 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.25,
        {
          color: [1.0, 0.5 + Math.random() * 0.3, 0.12],
          gravity: 3.4,
          size: 0.012 + Math.random() * 0.014,
        },
      );
    }

    if (state.idle > 1.2 && !holding) {
      const s = project(new THREE.Vector3(0, 0.45, 0));
      ui.showHint('hold', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }

    if (state.heat >= 1) {
      ui.word('とろっ！');
      sfx.sparkle(0);
      setStage('seed');
    }
  }

  /* ---------------- 3. たねを置く（かたち） ---------------- */

  function updateSeed() {
    const surfaceY = world.meltSurfaceY(state.meltLevel);
    const seeds = state.recipe.seeds;

    if (pointer.tapped) {
      pointer.tapped = false;
      if (seeds.length < MAX_SEEDS) {
        const p = tapToMelt(pointer.tapX, pointer.tapY, surfaceY);
        if (p) {
          seeds.push(p);
          state.lastAct = state.t;
          sfx.grow();
          world.showSeedMarks(seeds, surfaceY);
          world.emitDrop(p.x, surfaceY + 0.06, p.z, 0, 0.5, 0, {
            color: [0.85, 0.98, 1.0],
            gravity: 1.2,
            size: 0.02,
            floor: -1,
            life: 0.7,
          });
          ui.setCount(seeds.length, MAX_SEEDS);
        }
      }
    }
    world.showSeedMarks(seeds, surfaceY);

    if (seeds.length >= MAX_SEEDS || (seeds.length > 0 && state.t - state.lastAct > 1.9)) {
      ui.setCount(-1, MAX_SEEDS);
      setStage('cool');
      return;
    }

    if (state.idle > 1.4 && seeds.length === 0) {
      const s = project(new THREE.Vector3(0.18, surfaceY + 0.12, 0.1));
      ui.showHint('tap', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }
    if (state.idle > 8 && seeds.length === 0) {
      seeds.push({ x: 0, z: 0 });
      state.lastAct = state.t;
      sfx.grow();
    }
  }

  /* ---------------- 4. 冷やす（段の細かさ） ---------------- */

  function updateCool(dt) {
    let fan = 0;
    if (pointer.down && Math.abs(pointer.dx) > 6) {
      fan = Math.min(1, Math.abs(pointer.dx) / 30);
      pointer.dx *= 0.35;
      if (Math.random() < 0.5) sfx.fan();
      for (let i = 0; i < 3; i++) {
        world.emitDrop(
          (Math.random() - 0.5) * 1.4,
          0.75 + Math.random() * 0.5,
          (Math.random() - 0.5) * 1.0,
          (Math.random() - 0.5) * 0.6,
          0.25 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.6,
          {
            color: [0.68, 0.92, 1.0],
            gravity: -0.4,
            size: 0.012 + Math.random() * 0.016,
            floor: -1,
            life: 0.85,
          },
        );
      }
    }

    // 「どれだけ速く冷やせたか」を そのまま おぼえる。
    // 本物とおなじで、速く冷やすほど 段が細かく、枠が細く、空洞が深くなる。
    state.fanSum += fan;
    state.fanTime += dt;
    const auto = state.idle > 8 ? dt * 0.06 : 0;
    const cool = dt * 0.055 + fan * dt * 0.32 + auto;
    state.heat = clamp(state.heat - cool, 0, 1);

    // 固まったぶんだけ 液がへる → 育つ結晶が 顔を出す
    state.meltLevel = (0.3 + state.heat * 0.7) * (0.45 + 0.55 * (state.recipe.amount / MAX_CHUNKS));
    world.setMeltLevel(state.meltLevel);
    world.showSeedMarks([], 0);
    world.meltMat.uniforms.uHeat.value = state.heat;
    world.crucibleMat.uniforms.uHeat.value = state.heat * 0.7;
    world.burnerMat.uniforms.uHeat.value = state.heat * 0.4;
    world.matMat.uniforms.uHeat.value = state.heat * 0.15;
    world.glowMat.uniforms.uHeat.value = state.heat;
    world.meltMat.uniforms.uRainbow.value = clamp(1 - state.heat * 1.6, 0, 1);

    const layers = state.spec.maxLayers + 0.6;
    const want = (1 - state.heat) * layers;
    const before = Math.floor(state.grow);
    state.grow = Math.max(state.grow, want);
    if (Math.floor(state.grow) > before) sfx.grow();
    const m = world.crystalMat.uniforms;
    m.uGrow.value = state.grow;
    m.uHeat.value = state.heat * 0.8;
    m.uMelt.value = clamp(state.heat * 1.4, 0, 1);
    m.uRainbow.value = clamp((1 - state.heat) * 0.3, 0, 0.3);
    m.uFilmBase.value = 0;

    if (state.grow > layers * 0.5 && !state.saidKaku) {
      state.saidKaku = true;
      ui.word('カクカク！');
    }

    if (state.idle > 1.2) {
      const s = project(new THREE.Vector3(0, 0.85, 0.4));
      ui.showHint('swipe', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }

    if (state.heat <= 0.001) {
      // 冷やすのに かかった時間 → 冷却速度。
      // 4秒くらい＝がんばってあおいだ／13秒くらい＝ほうっておいた。
      state.recipe.coolSpeed = clamp((13 - state.fanTime) / (13 - 4.0), 0, 1);
      rebuildCrystalKeepGrowth();
      setStage('tilt');
    }
  }

  /** 冷やし終わったところで 段の細かさが決まるので、育ち具合を保ったまま 作り直す */
  function rebuildCrystalKeepGrowth() {
    rebuildCrystal();
    state.grow = state.spec.maxLayers + 1;
    world.crystalMat.uniforms.uGrow.value = state.grow;
  }

  /* ---------------- 5. 傾けて流す（虹の高さ） ---------------- */

  function updateTilt(dt) {
    // 手をはなして しばらく待ったら、そこで 流した量が決まる
    if (state.poured >= MIN_POUR && !pointer.down && state.t - state.lastAct > 1.3) {
      state.recipe.pour = state.poured;
      rebuildCrystal();
      state.grow = state.spec.maxLayers + 1;
      world.crystalMat.uniforms.uGrow.value = state.grow;
      ui.hideHint();
      state.tilt = damp(state.tilt, 0, 6, dt);
      world.crucibleGroup.rotation.z = -state.tilt * 0.72;
      if (state.tilt < 0.03) {
        world.crucibleGroup.rotation.z = 0;
        state.tilt = 0;
        sfx.clink();
        setStage('lift');
      }
      return;
    }

    if (pointer.down) {
      state.tilt = clamp(state.tilt + pointer.dx * 0.0042, 0, 1);
      pointer.dx = 0;
      state.lastAct = state.t;
    } else if (state.idle > 6 && state.poured < MIN_POUR + 0.35) {
      state.tilt = clamp(state.tilt + dt * 0.35, 0, 1); // ひとりでに かたむく
      state.lastAct = state.t;
    } else {
      state.tilt = damp(state.tilt, 0, 4, dt);
    }
    world.crucibleGroup.rotation.z = -state.tilt * 0.72;

    if (state.tilt > 0.42 && state.poured < 1) {
      const rate = (state.tilt - 0.42) * 1.5;
      state.poured = clamp(state.poured + dt * rate, 0, 1);
      state.pool = clamp(state.pool + dt * rate * 0.9, 0, 1);
      world.setPoolLevel(state.pool);
      if (Math.random() < dt * 40 * rate) {
        const lip = world.crucibleGroup.localToWorld(
          new THREE.Vector3(1.02, 0.5, (Math.random() - 0.5) * 0.35),
        );
        world.emitDrop(
          lip.x,
          lip.y,
          lip.z,
          0.55 + Math.random() * 0.5,
          0.1,
          (Math.random() - 0.5) * 0.2,
          {
            color: [1.0, 0.45, 0.12],
            gravity: 4.6,
            size: 0.016 + Math.random() * 0.018,
            floor: 0.2,
          },
        );
      }
      if (Math.random() < dt * 3) sfx.pour();
    }

    world.setMeltLevel((1 - state.poured) * state.meltLevel);
    world.meltMat.uniforms.uRainbow.value = 1;

    if (state.idle > 1.2) {
      const s = project(new THREE.Vector3(0.2, 0.95, 0.5));
      ui.showHint('swipe', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }
  }

  /* ---------------- 6. 引き上げる（いろ） ---------------- */

  function updateLift(dt) {
    const grabY = 0.62;
    if (!state.grabbed) {
      const y = damp(world.tongs.position.y, grabY, 3.4, dt);
      world.tongs.position.y = y;
      if (y < grabY + 0.06) {
        world.setTongsGrip(1);
        state.grabbed = true;
        sfx.clink();
        world.tongs.attach(world.crystalHolder);
      } else {
        world.setTongsGrip(clamp(1 - (y - grabY) / 1.2, 0, 1) * 0.35);
      }
      return;
    }

    // ここが この遊びの かなめ。
    // まだ熱い結晶は、さめるにつれて 酸化膜が うすくなる方向に 色が流れる。
    // みどり → あお → むらさき → あか → きん → ぎん。
    // すきな色に なったところで 引き上げると、その色で 止まる。
    state.crystalTemp = clamp(state.crystalTemp - dt / PULL_SWEEP, 0, 1);
    const m = world.crystalMat.uniforms;
    m.uFilmBase.value = state.crystalTemp;
    m.uRainbow.value = damp(m.uRainbow.value, 0.85, 3, dt);
    m.uHeat.value = damp(m.uHeat.value, state.crystalTemp * 0.35, 2, dt);
    m.uMelt.value = 0;

    let pulling = false;
    if (pointer.down) {
      state.lift = clamp(state.lift - pointer.dy * 0.0055, 0, 1);
      pointer.dy = 0;
      pulling = true;
    } else if (state.idle > 6) {
      state.lift = clamp(state.lift + dt * 0.4, 0, 1); // 待っていると むらさきあたりで 自動
      pulling = true;
    }
    if (pulling && state.lift > 0.02) state.recipe.pullTemp = state.crystalTemp;

    const y = grabY + state.lift * 1.9;
    world.tongs.position.y = damp(world.tongs.position.y, y, 12, dt);
    world.tongs.position.x = damp(world.tongs.position.x, state.lift * 0.05, 6, dt);
    SHOTS.lift.target[1] = 0.7 + state.lift * 1.0;
    SHOTS.lift.radius = 1.0 + state.lift * 0.4;

    if (state.idle > 1.0) {
      const s = project(new THREE.Vector3(0, 0.9, 0.35));
      ui.showHint('up', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }

    if (state.lift >= 1) {
      state.recipe.pullTemp = state.crystalTemp;
      state.grabbed = false;
      goShine();
    }
  }

  /* ---------------- 7. ライトの下で回す ---------------- */

  /** 仕上げで見せるときの まんなかぞろえ（大きさは そのまま） */
  function displayFit() {
    const box = world.crystal.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const bound = size.length() * 0.5;
    return { center, bound, baseY: box.min.y };
  }

  function goShine() {
    // ここで レシピが 確定する。結晶を 作り直して 色を固定。
    rebuildCrystal();
    state.grow = state.spec.maxLayers + 1;
    world.crystalMat.uniforms.uGrow.value = state.grow;
    world.crystalMat.uniforms.uFilmBase.value = state.spec.filmBand;

    scene.attach(world.crystalHolder);
    const fit = displayFit();
    // 大きさは正規化しない。台座は いつも同じ大きさなので、比べれば 大小がわかる。
    SHOTS.shine.radius = 0.26 + fit.bound * 0.95;

    const from = world.crystalHolder.position.clone();
    const fromQ = world.crystalHolder.quaternion.clone();
    const fromOff = world.crystal.position.clone();
    const to = new THREE.Vector3(0, SHINE_Y, 0);
    const toQ = new THREE.Quaternion();
    // よこはまんなか、たては「台座に乗る」高さにそろえる
    const toOff = new THREE.Vector3(-fit.center.x, -fit.baseY, -fit.center.z);
    world.pedestal.position.set(0, SHINE_Y, 0);

    tweens.push({
      t: 0,
      dur: 0.9,
      update: (k) => {
        const e = easeOutCubic(k);
        world.crystalHolder.position.lerpVectors(from, to, e);
        world.crystalHolder.quaternion.slerpQuaternions(fromQ, toQ, e);
        world.crystal.position.lerpVectors(fromOff, toOff, e);
        world.tongs.position.y = 2.6 + e * 1.6;
      },
      done: () => {
        world.tongs.visible = false;
      },
    });
    setStage('shine');
  }

  function updateShine(dt) {
    // ゆびに ぴったり ついてくる（ターンテーブル）。はなすと 勢いが残る。
    const idleSpin = 0.55;
    if (pointer.down) {
      const d = pointer.dx * 0.013;
      pointer.dx = 0;
      state.spin += d;
      state.spinVel = state.spinVel * 0.55 + clamp(d / Math.max(dt, 0.008), -14, 14) * 0.45;
    } else {
      state.spinVel = damp(state.spinVel, idleSpin, 1.1, dt);
      state.spin += state.spinVel * dt;
    }
    world.crystalHolder.rotation.y = state.spin;

    const speed = Math.abs(state.spinVel);
    state.charge = clamp(state.charge + dt * (0.14 + Math.min(speed, 10) * 0.16), 0, 1);
    state.rainbow = damp(state.rainbow, 0.45 + state.charge * 0.55, 2.4, dt);

    const m = world.crystalMat.uniforms;
    m.uRainbow.value = state.rainbow;
    m.uSpin.value = clamp(speed / 7, 0, 1);
    m.uSpotlight.value = damp(m.uSpotlight.value, 1, 2, dt);
    m.uHeat.value = damp(m.uHeat.value, 0, 2, dt);
    m.uFilmBase.value = state.spec.filmBand;
    m.uMelt.value = 0;

    world.beamMat.uniforms.uOpacity.value = damp(
      world.beamMat.uniforms.uOpacity.value,
      0.7 + state.charge * 0.4,
      2,
      dt,
    );
    world.beamMat.uniforms.uNiji.value = state.charge;
    world.skyMat.uniforms.uNiji.value = state.charge;

    world.halo.visible = true;
    world.placeHalo(world.crystalHolder.position);
    world.haloMat.uniforms.uOpacity.value = damp(
      world.haloMat.uniforms.uOpacity.value,
      0.22 + state.charge * 0.38,
      2,
      dt,
    );
    world.haloMat.uniforms.uNiji.value = state.charge;

    world.sparks.visible = true;
    world.sparks.position.set(0, SHINE_Y + (state.spec?.height ?? 0.6) * 0.4, 0);
    world.sparkMat.uniforms.uOpacity.value = damp(
      world.sparkMat.uniforms.uOpacity.value,
      0.25 + state.charge * 0.9 + Math.min(speed * 0.1, 0.5),
      3,
      dt,
    );
    world.sparkMat.uniforms.uLife.value = (world.sparkMat.uniforms.uLife.value + dt * 0.35) % 1;

    if (Math.random() < dt * (1 + speed * 1.6) && state.charge > 0.15) {
      sfx.sparkle(Math.floor(Math.random() * 6));
    }

    if (state.idle > 1.4 && state.charge < 0.99) {
      const s = project(new THREE.Vector3(0, SHINE_Y - 0.35, 0.3));
      ui.showHint('swipe', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }

    if (state.charge >= 1 && !state.finished) {
      state.finished = true;
      state.made++;
      finish();
    }
  }

  function finish() {
    const spec = state.spec;
    world.sparkMat.uniforms.uOpacity.value = 1.5;
    ui.word(spec.rare ? `${LABEL[spec.rare]}！` : `${LABEL[spec.color]}！`);
    ui.stars(spec.stars);
    sfx.fanfare();
    after(0.3, () => {
      const thumb = captureThumb(renderer.domElement);
      const res = record(codex, spec, thumb);
      state.lastResult = { key: res.key, isNew: res.isNew, stars: spec.stars };
      ui.setCodexCount(filled(codex), CELL_COUNT);
      if (res.isNew) {
        ui.word('はじめて！');
        sfx.place();
        ui.pulseCodexButton();
      }
    });
  }

  function showFromCodex(entry) {
    state.recipe = { ...emptyRecipe(entry.seed), ...entry.recipe, seed: entry.seed };
    state.recipe.seeds = (entry.recipe?.seeds || []).map((s) => ({ ...s }));
    state.recipe.coolSpeed = entry.recipe?.cool ?? 0.5;
    rebuildCrystal();
    state.grow = state.spec.maxLayers + 1;

    const m = world.crystalMat.uniforms;
    m.uGrow.value = state.grow;
    m.uMelt.value = 0;
    m.uFilmBase.value = state.spec.filmBand;

    scene.attach(world.crystalHolder);
    const fit = displayFit();
    SHOTS.shine.radius = 0.26 + fit.bound * 0.95;
    world.crystalHolder.position.set(0, SHINE_Y, 0);
    world.crystalHolder.rotation.set(0, 0, 0);
    world.crystalHolder.scale.setScalar(1);
    world.crystal.position.set(-fit.center.x, -fit.baseY, -fit.center.z);
    world.pedestal.position.set(0, SHINE_Y, 0);
    world.tongs.visible = false;
    world.setMeltLevel(0);
    state.charge = 1;
    state.finished = true;
    state.rainbow = 1;
    state.spinVel = 1.2;
    setStage('shine');
    ui.setTools({ again: true, codex: true });
  }

  /* ---------------- ループ ---------------- */
  function update(dt) {
    dt = Math.max(0, Math.min(dt, 1 / 20));
    state.t += dt;
    state.stageT += dt;
    if (!pointer.down) state.idle += dt;

    for (let i = timers.length - 1; i >= 0; i--) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) {
        const fn = timers[i].fn;
        timers.splice(i, 1);
        fn();
      }
    }

    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.update(k);
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.done?.();
      }
    }

    switch (state.stage) {
      case 'load':
        updateLoad();
        break;
      case 'heat':
        updateHeat(dt);
        break;
      case 'seed':
        updateSeed();
        break;
      case 'cool':
        updateCool(dt);
        break;
      case 'tilt':
        updateTilt(dt);
        break;
      case 'lift':
        updateLift(dt);
        break;
      case 'shine':
        updateShine(dt);
        break;
      default:
        ui.hideHint();
        break;
    }

    const wantDim = state.stage === 'shine' ? 0.2 : 1;
    state.dim = damp(state.dim, wantDim, 2.2, dt);
    world.setWorkshopDim(state.dim);

    pointer.tapped = false;
    updateCamera(dt);
    world.update(state.t, dt, renderer.domElement.height);
  }

  /* ---------------- テスト用のフック ---------------- */
  const debug = {
    state: () => ({
      stage: state.stage,
      step: PLAY_STAGES.indexOf(state.stage),
      heat: +state.heat.toFixed(3),
      grow: +state.grow.toFixed(2),
      layers: state.spec?.maxLayers ?? 0,
      poured: +state.poured.toFixed(3),
      lift: +state.lift.toFixed(3),
      down: pointer.down,
      idle: +state.idle.toFixed(2),
      grabbed: state.grabbed,
      crystalTemp: +state.crystalTemp.toFixed(3),
      charge: +state.charge.toFixed(3),
      rainbow: +state.rainbow.toFixed(3),
      finished: state.finished,
      recipe: {
        amount: state.recipe.amount,
        seeds: state.recipe.seeds.length,
        cool: +state.recipe.coolSpeed.toFixed(3),
        pour: +state.recipe.pour.toFixed(3),
        pullTemp: +state.recipe.pullTemp.toFixed(3),
      },
      result: state.spec
        ? {
            color: state.spec.color,
            shape: state.spec.shape,
            rare: state.spec.rare,
            stars: state.spec.stars,
            key: state.spec.key,
            crystals: state.spec.crystals.length,
            height: +state.spec.height.toFixed(3),
            width: +state.spec.width.toFixed(3),
          }
        : null,
      codex: filled(codex),
      codexTotal: CELL_COUNT,
      seed: state.spec?.seed ?? 0,
      fov: +camera.fov.toFixed(1),
      aspect: +camera.aspect.toFixed(3),
    }),
    setStage,
    begin,
    reset,
    codex: () => codex,
    clearCodex: () => {
      codex = { cells: {}, made: 0 };
      localStorage.removeItem('niji-bismuth-codex-v1');
      ui.setCodexCount(0, CELL_COUNT);
    },
    /** テストから レシピを直接ねじこんで、結果だけ確かめる */
    forceRecipe: (patch) => {
      Object.assign(state.recipe, patch);
      if (patch.seeds) state.recipe.seeds = patch.seeds.map((s) => ({ ...s }));
      rebuildCrystal();
      return debug.state().result;
    },
  };

  return { world, update, state, ui, debug, setStage, begin, reset, camera, project };
}

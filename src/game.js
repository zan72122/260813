import * as THREE from 'three';
import { createWorld } from './world.js';
import { buildCrystalGeometry } from './crystal.js';
import { createUI, loadShelf, saveShelf, captureThumb } from './ui.js';
import { sfx, unlock, startFire, stopFire, setMuted, isMuted } from './audio.js';

export const STAGES = ['title', 'load', 'heat', 'cool', 'tilt', 'lift', 'shine'];
const PLAY_STAGES = ['load', 'heat', 'cool', 'tilt', 'lift', 'shine'];

/* ---- カメラの決め位置（自由カメラなし・ぜんぶ自動） ---- */
const SHOTS = {
  title: { target: [0, 0.5, 0], radius: 1.9, yaw: 0.22, pitch: 0.5, drift: 0.05 },
  load: { target: [0, 0.35, 0.35], radius: 1.75, yaw: 0, pitch: 0.62, drift: 0.02 },
  heat: { target: [0, 0.34, 0.05], radius: 1.35, yaw: 0.06, pitch: 0.66, drift: 0.02 },
  cool: { target: [0, 0.45, 0], radius: 1.0, yaw: -0.14, pitch: 0.72, drift: 0.03 },
  tilt: { target: [0.6, 0.42, 0], radius: 1.7, yaw: 0.34, pitch: 0.56, drift: 0.02 },
  lift: { target: [0, 0.95, 0], radius: 1.4, yaw: 0.05, pitch: 0.3, drift: 0.02 },
  shine: { target: [0, 2.15, 0], radius: 0.92, yaw: 0, pitch: 0.34, drift: 0.0 },
};

const SHINE_Y = 2.15;
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
    chunksIn: 0,
    heat: 0,
    grow: 0,
    meltLevel: 0,
    tilt: 0,
    poured: 0,
    pool: 0,
    lift: 0,
    spin: 0,
    spinVel: 0,
    charge: 0,
    rainbow: 0,
    finished: false,
    dim: 1,
    crystalInfo: null,
    made: 0,
  };

  let shelfItems = loadShelf();
  const tweens = [];
  const timers = [];
  const tmpV = new THREE.Vector3();

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
    onShelf: () => {
      unlock();
      sfx.tap();
      ui.renderShelf(shelfItems);
      ui.showShelfScreen(true);
      ui.setTools({ again: false, shelf: false, sound: false });
    },
    onShelfClose: () => {
      sfx.tap();
      ui.showShelfScreen(false);
      ui.setTools({ again: state.stage === 'shine', shelf: true });
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
    onPickShelf: (item) => {
      sfx.clink();
      // えらんだ結晶をもういちどライトの下で回す
      ui.showShelfScreen(false);
      showFromShelf(item);
      ui.setTools({ again: true, shelf: true });
    },
  });
  ui.setStep(-1);
  ui.setTools({ again: false, shelf: true });
  ui.showTitle(true);

  /* ---------------- 入力（一本ゆび） ---------------- */
  const pointer = {
    down: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    dx: 0,
    dy: 0,
    sx: 0,
    sy: 0,
    moved: 0,
    downT: 0,
    tapped: false,
  };

  const localPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function onDown(e) {
    unlock();
    const p = localPos(e);
    pointer.down = true;
    pointer.x = pointer.px = pointer.sx = p.x;
    pointer.y = pointer.py = pointer.sy = p.y;
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
    pointer.px = p.x;
    pointer.py = p.y;
    pointer.x = p.x;
    pointer.y = p.y;
    state.idle = 0;
  }

  function onUp() {
    if (!pointer.down) return;
    pointer.down = false;
    // 短く触った＝タップ
    if (pointer.moved < 22 && state.t - pointer.downT < 0.7) pointer.tapped = true;
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
  let shotOverride = null;

  function currentShot() {
    if (shotOverride) return shotOverride;
    return SHOTS[state.stage] || SHOTS.title;
  }

  function fitDistance(radius) {
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    return radius / Math.max(0.08, Math.sin(Math.min(vHalf, hHalf)));
  }

  function updateCamera(dt, snap = false) {
    const shot = currentShot();
    const portrait = camera.aspect < 1;

    // たてのときは画角を広げて、近づく（せまい画面でも迫力を出す）
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
    return {
      x: (tmpV.x * 0.5 + 0.5) * r.width,
      y: (-tmpV.y * 0.5 + 0.5) * r.height,
    };
  }

  /* ---------------- 進行 ---------------- */
  function setStage(name, { snap = false } = {}) {
    state.stage = name;
    state.stageT = 0;
    state.idle = 0;
    pointer.tapped = false;
    const idx = PLAY_STAGES.indexOf(name);
    ui.setStep(idx);
    ui.hideHint();
    ui.setTools({ again: name === 'shine', shelf: true });
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
      case 'cool':
        stopFire();
        world.flameMat.uniforms.uPower.value = 0;
        world.ringMat.uniforms.uPower.value = 0;
        world.flame.visible = false;
        break;
      case 'lift':
        world.tongs.visible = true;
        world.tongs.position.set(0, 2.7, 0);
        world.setTongsGrip(0);
        break;
      case 'shine':
        world.beam.visible = true;
        world.lamp.visible = true;
        world.halo.visible = true;
        break;
      default:
        break;
    }
  }

  function begin() {
    reset();
    setStage('load');
  }

  function reset() {
    stopFire();
    state.chunksIn = 0;
    state.heat = 0;
    state.grow = 0;
    state.meltLevel = 0;
    state.tilt = 0;
    state.poured = 0;
    state.pool = 0;
    state.lift = 0;
    state.spin = 0;
    state.spinVel = 0;
    state.charge = 0;
    state.rainbow = 0;
    state.finished = false;
    state.dim = 1;
    tweens.length = 0;
    timers.length = 0;
    shotOverride = null;

    const s = seed != null ? seed + state.made : Math.floor(Math.random() * 1e9);
    if (state.crystalInfo) state.crystalInfo.geometry.dispose();
    state.crystalInfo = buildCrystalGeometry(s);
    world.setCrystalGeometry(state.crystalInfo);
    world.crystalMat.uniforms.uGrow.value = 0;
    world.crystalMat.uniforms.uRainbow.value = 0;
    world.crystalMat.uniforms.uSpin.value = 0;
    world.crystalMat.uniforms.uSpotlight.value = 0;
    world.crystalMat.uniforms.uMelt.value = 1;

    // 結晶をるつぼの中にもどす
    world.crucibleGroup.add(world.crystalHolder);
    world.crystalHolder.position.set(0, 0.09, 0);
    world.crystalHolder.rotation.set(0, 0, 0);
    world.crystalHolder.scale.setScalar(potScale(state.crystalInfo));

    world.crucibleGroup.rotation.z = 0;
    world.setMeltLevel(0);
    world.setPoolLevel(0);
    world.tongs.visible = false;
    world.beam.visible = false;
    world.lamp.visible = false;
    world.halo.visible = false;
    world.haloMat.uniforms.uOpacity.value = 0;
    world.beamMat.uniforms.uOpacity.value = 0;
    world.crystal.position.set(0, 0, 0);
    world.glowMat.uniforms.uHeat.value = 0;
    world.sparks.visible = false;
    world.sparkMat.uniforms.uOpacity.value = 0;
    world.flame.visible = false;
    world.flameMat.uniforms.uPower.value = 0;
    world.ringMat.uniforms.uPower.value = 0;
    world.skyMat.uniforms.uNiji.value = 0;
    world.meltMat.uniforms.uHeat.value = 0;
    world.meltMat.uniforms.uRainbow.value = 0;

    for (const c of world.chunks) {
      c.visible = true;
      c.position.copy(c.userData.home);
      c.scale.setScalar(1);
      c.userData.inPot = false;
    }
    setStage('load');
  }

  /* ---------------- かけらを入れる ---------------- */
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
    state.chunksIn++;
    sfx.tap();

    const from = chunk.position.clone();
    const slot = state.chunksIn - 1;
    const a = slot * 2.3;
    const to = new THREE.Vector3(Math.cos(a) * 0.34, 0.25, Math.sin(a) * 0.34);
    const peak = 1.35;
    tweens.push({
      t: 0,
      dur: 0.52,
      update: (k) => {
        const e = easeOutCubic(k);
        chunk.position.lerpVectors(from, to, e);
        chunk.position.y = from.y + (to.y - from.y) * e + Math.sin(Math.PI * k) * peak;
        chunk.rotation.x += 0.12;
        chunk.rotation.z += 0.09;
      },
      done: () => {
        sfx.drop();
        chunk.position.copy(to);
        // まだ とけていないので、液はない（かけらが るつぼの底に ころがる）
        state.meltLevel = 0;
        world.setMeltLevel(0);
        if (state.chunksIn >= 3) {
          after(0.42, () => {
            if (state.stage === 'load') setStage('heat');
          });
        }
      },
    });
  }

  /* ---------------- ステージごとの毎フレーム ---------------- */

  function updateLoad() {
    if (pointer.tapped) {
      pointer.tapped = false;
      dropChunkIn(nearestChunk(pointer.x, pointer.y));
    }
    // まよっていたら、そっと教える（それでも触らなければ、ひとりでに入る）
    const next = world.chunks.find((c) => !c.userData.inPot);
    if (next) {
      const s = project(next.position);
      if (state.idle > 1.6) ui.showHint('tap', s.x - hintHalf(), s.y - hintHalf());
      else ui.hideHint();
      next.position.y = next.userData.home.y + Math.abs(Math.sin(state.t * 2.4)) * 0.06;
      if (state.idle > 11) dropChunkIn(next);
    }
  }

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
      // ほうっておいても、ゆっくりだけ進む（しっぱいなし）
      state.heat = clamp(state.heat + dt * (state.idle > 5 ? 0.1 : 0) - dt * 0.01, 0, 1);
    }

    // かけらが とけて 液になる
    const meltAmt = clamp((state.heat - 0.12) / 0.55, 0, 1);
    for (const c of world.chunks) {
      if (!c.userData.inPot) continue;
      c.scale.setScalar(Math.max(0.001, 1 - meltAmt));
      c.visible = meltAmt < 0.98;
      c.rotation.y += dt * 0.6;
    }
    state.meltLevel = meltAmt;
    world.setMeltLevel(state.meltLevel);
    world.meltMat.uniforms.uHeat.value = state.heat;
    world.crucibleMat.uniforms.uHeat.value = state.heat;
    world.burnerMat.uniforms.uHeat.value = state.heat * 0.6;
    world.matMat.uniforms.uHeat.value = state.heat * 0.25;
    world.glowMat.uniforms.uHeat.value = state.heat;

    // ぼこぼこ
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
      setStage('cool');
    }
  }

  function updateCool(dt) {
    // よこにこすると、うちわの風。なにもしなくても ゆっくり冷める。
    let fan = 0;
    if (pointer.down && Math.abs(pointer.dx) > 6) {
      fan = Math.min(1, Math.abs(pointer.dx) / 90);
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

    const cool = dt * (0.1 + fan * 2.6) + (state.idle > 5 ? dt * 0.22 : 0);
    state.heat = clamp(state.heat - cool, 0, 1);
    // 固まったぶんだけ 液がへる → 育つ結晶が 液の上に 出てくる
    state.meltLevel = 0.3 + state.heat * 0.7;
    world.setMeltLevel(state.meltLevel);
    world.meltMat.uniforms.uHeat.value = state.heat;
    world.crucibleMat.uniforms.uHeat.value = state.heat * 0.7;
    world.burnerMat.uniforms.uHeat.value = state.heat * 0.4;
    world.matMat.uniforms.uHeat.value = state.heat * 0.15;
    world.glowMat.uniforms.uHeat.value = state.heat;
    world.meltMat.uniforms.uRainbow.value = clamp(1 - state.heat * 1.6, 0, 1);

    // 冷えるほど、結晶が 一段ずつ カクカク育つ
    const layers = state.crystalInfo.layerCount + 0.6;
    const want = (1 - state.heat) * layers;
    const before = Math.floor(state.grow);
    state.grow = Math.max(state.grow, want);
    if (Math.floor(state.grow) > before) sfx.grow();
    world.crystalMat.uniforms.uGrow.value = state.grow;
    world.crystalMat.uniforms.uHeat.value = state.heat * 0.8;
    world.crystalMat.uniforms.uMelt.value = clamp(state.heat * 1.4, 0, 1);
    world.crystalMat.uniforms.uRainbow.value = clamp((1 - state.heat) * 0.35, 0, 0.35);

    if (state.grow > (state.crystalInfo.layerCount + 0.6) * 0.5 && !state.saidKaku) {
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
      state.saidKaku = false;
      setStage('tilt');
    }
  }

  function updateTilt(dt) {
    // 流しきったら、あとは そっと 水平にもどして つぎへ
    if (state.poured >= 1) {
      ui.hideHint();
      state.tilt = damp(state.tilt, 0, 5, dt);
      world.crucibleGroup.rotation.z = -state.tilt * 0.72;
      world.setMeltLevel(0);
      if (state.tilt < 0.03) {
        world.crucibleGroup.rotation.z = 0;
        state.tilt = 0;
        sfx.clink();
        setStage('lift');
      }
      return;
    }

    // よこにひっぱると、るつぼが かたむく
    let want = state.tilt;
    if (pointer.down) {
      want = clamp(state.tilt + pointer.dx * 0.0042, 0, 1);
      pointer.dx = 0;
    } else if (state.idle > 6) {
      want = clamp(state.tilt + dt * 0.35, 0, 1); // ひとりでに かたむく
    } else {
      want = damp(state.tilt, Math.max(0, state.tilt - dt * 0.25), 6, dt);
    }
    state.tilt = want;
    world.crucibleGroup.rotation.z = -state.tilt * 0.72;

    // かたむけると 余分な液が 流れ出る
    if (state.tilt > 0.42 && state.poured < 1) {
      const rate = (state.tilt - 0.42) * 1.5;
      state.poured = clamp(state.poured + dt * rate, 0, 1);
      state.pool = clamp(state.pool + dt * rate * 0.9, 0, 1);
      world.setPoolLevel(state.pool);
      if (Math.random() < dt * 40 * rate) {
        const lipLocal = new THREE.Vector3(1.02, 0.5, (Math.random() - 0.5) * 0.35);
        const lip = world.crucibleGroup.localToWorld(lipLocal);
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

    const level = (1 - state.poured) * state.meltLevel;
    world.setMeltLevel(level);
    world.meltMat.uniforms.uRainbow.value = 1;

    if (state.idle > 1.2 && state.poured < 0.98) {
      const s = project(new THREE.Vector3(0.2, 0.95, 0.5));
      ui.showHint('swipe', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }
  }

  function updateLift(dt) {
    const grabY = 0.62;
    // まず トングが おりてくる（じどう）
    if (!state.grabbed) {
      const y = damp(world.tongs.position.y, grabY, 3.4, dt);
      world.tongs.position.y = y;
      if (y < grabY + 0.06) {
        world.setTongsGrip(damp(1, 1, 1, 1));
        state.grabbed = true;
        sfx.clink();
        // 結晶を トングに もちかえる（見た目の位置はそのまま）
        world.tongs.attach(world.crystalHolder);
      } else {
        world.setTongsGrip(clamp(1 - (y - grabY) / 1.2, 0, 1) * 0.35);
      }
      return;
    }

    // うえに ひっぱる
    if (pointer.down) {
      state.lift = clamp(state.lift - pointer.dy * 0.0055, 0, 1);
      pointer.dy = 0;
    } else if (state.idle > 5) {
      state.lift = clamp(state.lift + dt * 0.3, 0, 1);
    }

    const y = grabY + state.lift * 1.85;
    world.tongs.position.y = damp(world.tongs.position.y, y, 12, dt);
    world.tongs.position.x = damp(world.tongs.position.x, state.lift * 0.05, 6, dt);

    if (state.idle > 1.2) {
      const s = project(new THREE.Vector3(0, 0.9, 0.35));
      ui.showHint('up', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }

    // カメラも いっしょに あがる
    SHOTS.lift.target[1] = 0.95 + state.lift * 0.75;

    if (state.lift >= 1) {
      state.grabbed = false;
      goShine();
    }
  }

  /**
   * 仕上げで見せるときの「まんなかぞろえ」と大きさ。
   * どの結晶でも、画面の中でおなじくらいの大きさになるようにする。
   */
  /** るつぼの中に置くときの大きさ（背たけをそろえて、個性は少しだけ残す） */
  function potScale(info) {
    const bias = info.sizeClass === 'big' ? 1.1 : info.sizeClass === 'small' ? 0.9 : 1.0;
    return clamp((0.66 / Math.max(info.height, 0.3)) * bias, 0.5, 1.5);
  }

  function displayFit() {
    const info = state.crystalInfo;
    const box = info.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const maxDim = Math.max(info.width, info.height, 0.2);
    // すこしだけ大きさの個性を残す
    const bias = info.sizeClass === 'big' ? 1.06 : info.sizeClass === 'small' ? 0.94 : 1.0;
    return { center, scale: (0.95 / maxDim) * bias };
  }

  function goShine() {
    // 結晶を ライトの下へ（トングは そっと はける）
    scene.attach(world.crystalHolder);
    const fit = displayFit();
    const from = world.crystalHolder.position.clone();
    const fromQ = world.crystalHolder.quaternion.clone();
    const fromOff = world.crystal.position.clone();
    const to = new THREE.Vector3(0, SHINE_Y, 0);
    const toQ = new THREE.Quaternion();
    const toOff = fit.center.clone().multiplyScalar(-1);
    const fromS = world.crystalHolder.scale.x;
    tweens.push({
      t: 0,
      dur: 0.9,
      update: (k) => {
        const e = easeOutCubic(k);
        world.crystalHolder.position.lerpVectors(from, to, e);
        world.crystalHolder.quaternion.slerpQuaternions(fromQ, toQ, e);
        world.crystal.position.lerpVectors(fromOff, toOff, e);
        world.crystalHolder.scale.setScalar(fromS + (fit.scale - fromS) * e);
        world.tongs.position.y = 2.6 + e * 1.6;
      },
      done: () => {
        world.tongs.visible = false;
      },
    });
    setStage('shine');
  }

  function updateShine(dt) {
    // まわす：ゆびに ぴったり ついてくる（ターンテーブルのように）。
    // はなすと、その勢いのまま しばらく 回りつづける。
    const idleSpin = 0.55; // 触っていないときも ゆっくり回って きれい
    if (pointer.down) {
      const d = pointer.dx * 0.013;
      pointer.dx = 0;
      state.spin += d;
      // 手をはなしたときの 勢いを おぼえておく
      const v = clamp(d / Math.max(dt, 0.008), -14, 14);
      state.spinVel = state.spinVel * 0.55 + v * 0.45;
    } else {
      state.spinVel = damp(state.spinVel, idleSpin, 1.1, dt);
      state.spin += state.spinVel * dt;
    }
    world.crystalHolder.rotation.y = state.spin;
    world.crystalHolder.rotation.x = 0.1 + Math.sin(state.spin * 0.5) * 0.05;

    const speed = Math.abs(state.spinVel);
    state.charge = clamp(state.charge + dt * (0.14 + Math.min(speed, 10) * 0.16), 0, 1);
    state.rainbow = damp(state.rainbow, 0.4 + state.charge * 0.6, 2.4, dt);

    const m = world.crystalMat.uniforms;
    m.uRainbow.value = state.rainbow;
    m.uSpin.value = clamp(speed / 7, 0, 1);
    m.uSpotlight.value = damp(m.uSpotlight.value, 1, 2, dt);
    m.uHeat.value = damp(m.uHeat.value, 0, 2, dt);
    m.uMelt.value = 0;

    world.beamMat.uniforms.uOpacity.value = damp(
      world.beamMat.uniforms.uOpacity.value,
      0.7 + state.charge * 0.4,
      2,
      dt,
    );
    world.beamMat.uniforms.uNiji.value = state.charge;
    world.skyMat.uniforms.uNiji.value = state.charge;

    // うしろの やわらかい光
    world.halo.visible = true;
    world.placeHalo(world.crystalHolder.position);
    world.haloMat.uniforms.uOpacity.value = damp(
      world.haloMat.uniforms.uOpacity.value,
      0.22 + state.charge * 0.38,
      2,
      dt,
    );
    world.haloMat.uniforms.uNiji.value = state.charge;

    // きらきら
    world.sparks.visible = true;
    world.sparks.position.set(0, SHINE_Y, 0);
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
      const s = project(new THREE.Vector3(0, SHINE_Y - 0.55, 0.3));
      ui.showHint('swipe', s.x - hintHalf(), s.y - hintHalf());
    } else {
      ui.hideHint();
    }

    if (state.charge >= 1 && !state.finished) {
      state.finished = true;
      state.made++;
      ui.word('にじいろ！');
      sfx.fanfare();
      world.sparkMat.uniforms.uOpacity.value = 1.5;
      // かざりだなに ほぞん
      after(0.26, () => saveCurrentToShelf());
    }
  }

  function saveCurrentToShelf() {
    const thumb = captureThumb(renderer.domElement);
    if (!thumb) return;
    shelfItems = [
      { seed: state.crystalInfo.seed, thumb, size: state.crystalInfo.sizeClass },
    ].concat(shelfItems);
    saveShelf(shelfItems);
    sfx.place();
  }

  function showFromShelf(item) {
    // たなの結晶を ライトの下に 出す
    if (state.crystalInfo) state.crystalInfo.geometry.dispose();
    state.crystalInfo = buildCrystalGeometry(item.seed);
    world.setCrystalGeometry(state.crystalInfo);
    world.crystalMat.uniforms.uGrow.value = state.crystalInfo.layerCount + 1;
    world.crystalMat.uniforms.uMelt.value = 0;
    scene.attach(world.crystalHolder);
    const fit = displayFit();
    world.crystalHolder.position.set(0, SHINE_Y, 0);
    world.crystalHolder.rotation.set(0, 0, 0);
    world.crystalHolder.scale.setScalar(fit.scale);
    world.crystal.position.copy(fit.center).multiplyScalar(-1);
    world.tongs.visible = false;
    world.beam.visible = true;
    world.lamp.visible = true;
    world.halo.visible = true;
    world.setMeltLevel(0);
    state.charge = 1;
    state.finished = true;
    state.rainbow = 1;
    state.spinVel = 1.2;
    setStage('shine');
    ui.setTools({ again: true, shelf: true });
  }

  function hintHalf() {
    // ヒントの丸は 24vmin。中心をあわせるためのずらし量
    const vmin = Math.min(window.innerWidth, window.innerHeight);
    return vmin * 0.12;
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
        // タイトル：ゆっくり回る るつぼだけ見せる
        ui.hideHint();
        break;
    }

    // 仕上げのあいだは 工房の明かりをおとして、結晶だけを見せる
    const wantDim = state.stage === 'shine' ? 0.34 : 1;
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
      layers: state.crystalInfo?.layerCount ?? 0,
      poured: +state.poured.toFixed(3),
      lift: +state.lift.toFixed(3),
      charge: +state.charge.toFixed(3),
      rainbow: +state.rainbow.toFixed(3),
      chunksIn: state.chunksIn,
      finished: state.finished,
      shelf: shelfItems.length,
      seed: state.crystalInfo?.seed ?? 0,
      size: state.crystalInfo?.sizeClass ?? '',
      fov: +camera.fov.toFixed(1),
      aspect: +camera.aspect.toFixed(3),
      camera: [
        +camera.position.x.toFixed(2),
        +camera.position.y.toFixed(2),
        +camera.position.z.toFixed(2),
      ],
    }),
    setStage,
    begin,
    reset,
    shelf: () => shelfItems,
    clearShelf: () => {
      shelfItems = [];
      saveShelf(shelfItems);
    },
  };

  return { world, update, state, ui, debug, setStage, begin, reset, camera, project };
}

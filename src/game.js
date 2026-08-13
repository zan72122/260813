import * as M from './mat.js';
import { Renderer } from './renderer.js';
import { makeCrystalDef } from './crystalDef.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';

const CENTER = [0, 1.26, 0];
const DEG = Math.PI / 180;

// カメラの節目：全景 → 中景 → マクロ → 結晶の内部
// pat が小さいほど模様は大きく見える。内部へ入るときに一気に拡大し、
// 同時に ring（同心円の数）を増やして「奥へ進むほど輪が現れる」ようにしてある。
function keyframes() {
  const kf = [
    { eye: [0, 2.30, 5.05], fov: 40 * DEG, pat: 2.20, ring: 1.00, glass: 1.00, vign: 0.20 },
    { eye: [0, 1.98, 3.80], fov: 38 * DEG, pat: 2.20, ring: 1.00, glass: 1.00, vign: 0.22 },
    { eye: [0, 1.56, 2.10], fov: 34 * DEG, pat: 2.20, ring: 1.00, glass: 0.95, vign: 0.26 },
    { eye: [0, 1.28, 0.10], fov: 38 * DEG, pat: 1.05, ring: 1.90, glass: 0.28, vign: 0.34 },
  ];
  for (const k of kf) {
    const f = [CENTER[0] - k.eye[0], CENTER[1] - k.eye[1], CENTER[2] - k.eye[2]];
    k.fwd = M.normalize3(f);
  }
  // 内部では「マクロのときの向き」をそのまま使う（模様が飛ばずに拡大する）
  kf[3].fwd = kf[2].fwd.slice();
  return kf;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.hud = new Hud();
    this.sound = new Sound();
    this.kf = keyframes();

    this.proj = M.mat4();
    this.view = M.mat4();
    this.identity = M.mat4();
    this.crystalModel = M.mat4();
    this.ringModel = M.mat4();
    this.rot3 = M.mat3();
    this.tmpA = M.mat3();
    this.tmpB = M.mat3();
    this.axisBasis = M.mat3();
    this.invViewRot = M.mat3();
    this.viewRot = M.mat3();

    this.camEye = [0, 0, 0];
    this.camFwd = [0, 0, -1];
    this.axisWorld = [0, 0, 1];

    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.aspect = 1;
    this.tanHalf = 0.4;

    this.frames = 0;
    this.fpsAcc = 0;
    this.fpsTime = 0;
    this.quality = 1.0;

    this.pointer = { id: null, x: 0, y: 0, active: false, sx: 0, sy: 0, moved: 0 };
    this.reset(((Math.random() * 1e9) | 0) >>> 0);
    this.bindEvents();
  }

  /* -------------------------------------------------- 初期化 */

  reset(seed) {
    this.def = makeCrystalDef(seed);
    // 結晶がほぼ立った姿勢でぴたりと合うように、光軸の向きを決める
    this.def.axisTilt = Math.acos(M.clamp(this.kf[2].fwd[1], -1, 1)) + this.def.restTilt;
    this.renderer.setCrystal(seed);

    this.stage = 'place';
    this.time = 0;
    this.stageTime = 0;

    this.tilt = 0;
    this.charge = 0;
    this.ringAngle = this.def.rng.range(0, Math.PI * 2);

    // 「ちょうどいい角度」を先に求めておき、そこから少しずらして始める
    const best = this.solveBest();
    this.best = best;
    const dir = this.def.rng.sign();
    const want = this.def.rng.range(0.74, 0.84);
    let off = 0.05;
    while (off < 2.2 && this.alignFor(best.spin + off * dir, best.tilt, this.kf[2].fwd) > want) {
      off += 0.02;
    }
    this.spin = best.spin + off * dir;
    this.tilt = best.tilt + this.def.rng.range(-0.11, 0.11);

    this.camT = 0;
    this.camTTarget = 0;
    this.patBoost = 1;
    this.ringMul = 1;
    this.burstScale = 1;
    this.enterT = 0;
    this.finaleT = 0;

    this.dropT = 1;
    this.dropping = false;
    this.gain = 0.0;
    this.open = 0;
    this.burst = 0;
    this.crystalFade = 0;
    this.eyeAlpha = 0;
    this.pass = 0;
    this.flash = 0;
    this.exposure = 1.0;
    this.light = 0;
    this.stageAlpha = 0;
    this.align = 0;
    this.holdTimer = 0;
    this.soundStep = -1;
    this.hintTimer = 0;
    this.hintAxis = 'x';
    this.assistBoost = 0;
    this.signSpin = 1;
    this.signTilt = 1;

    this.hud.showAgain(false);
    this.hud.showProgress(false);
    this.hud.hint(null);
    this.hud.setProgress(0);
  }

  /* -------------------------------------------------- 角度まわり */

  /**
   * 与えられた spin/tilt での光軸（ワールド）。
   * 回転は Rx(tilt) * Ry(spin)。左右スワイプで目が横へ、上下スワイプで目が縦へ、
   * それぞれ同じだけ動くので、指の動きと見えかたが一対一で対応する。
   */
  axisFor(spin, tilt, out = [0, 0, 0]) {
    const T = this.def.axisTilt;
    const sT = Math.sin(T), cT = Math.cos(T);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const cs = Math.cos(spin), ss = Math.sin(spin);
    out[0] = cs * sT;
    out[1] = cT * ct + ss * sT * st;
    out[2] = cT * st - ss * sT * ct;
    return out;
  }

  /** 光軸座標系（z が光軸）。行 e1,e2,e3 を列優先へ詰める */
  buildAxisBasis(axis, out) {
    let up = [0, 1, 0];
    if (Math.abs(M.dot3(axis, up)) > 0.985) up = [0, 0, 1];
    const e1 = M.normalize3(M.cross3([0, 0, 0], up, axis));
    const e2 = M.cross3([0, 0, 0], axis, e1);
    out[0] = e1[0]; out[3] = e1[1]; out[6] = e1[2];
    out[1] = e2[0]; out[4] = e2[1]; out[7] = e2[2];
    out[2] = axis[0]; out[5] = axis[1]; out[8] = axis[2];
    return out;
  }

  /** 画面中心から見た「目の中心」のずれ（模様座標） */
  eyeOffset(spin, tilt, fwd) {
    const a = this.axisFor(spin, tilt);
    let up = [0, 1, 0];
    if (Math.abs(M.dot3(a, up)) > 0.985) up = [0, 0, 1];
    const e1 = M.normalize3(M.cross3([0, 0, 0], up, a));
    const e2 = M.cross3([0, 0, 0], a, e1);
    return [-M.dot3(e1, fwd), -M.dot3(e2, fwd)];
  }

  alignFor(spin, tilt, fwd) {
    const a = this.axisFor(spin, tilt);
    return Math.abs(M.dot3(a, fwd));
  }

  /** いちばん美しい角度を数値的に探す */
  solveBest() {
    const fwd = this.kf[2].fwd;
    let bs = 0, bt = 0, bv = -1;
    for (let i = 0; i < 48; i++) {
      const s = (i / 48) * Math.PI * 2;
      for (let j = -8; j <= 8; j++) {
        const t = (j / 8) * 0.9;
        const v = this.alignFor(s, t, fwd);
        if (v > bv) { bv = v; bs = s; bt = t; }
      }
    }
    let step = 0.12;
    for (let k = 0; k < 60; k++) {
      let improved = false;
      for (const [ds, dt] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const v = this.alignFor(bs + ds, bt + dt, fwd);
        if (v > bv) { bv = v; bs += ds; bt += dt; improved = true; }
      }
      if (!improved) step *= 0.6;
      if (step < 1e-4) break;
    }
    return { spin: bs, tilt: bt, value: bv };
  }

  /** 近づくほど強くはたらく“引き寄せ”（4歳児でも必ず開けられるように） */
  magnet(dt, strength) {
    if (this.noMagnet) return;
    const fwd = this.camFwd;
    const e = 0.02;
    const base = this.alignFor(this.spin, this.tilt, fwd);
    const gs = (this.alignFor(this.spin + e, this.tilt, fwd) - this.alignFor(this.spin - e, this.tilt, fwd)) / (2 * e);
    const gt = (this.alignFor(this.spin, this.tilt + e, fwd) - this.alignFor(this.spin, this.tilt - e, fwd)) / (2 * e);
    const w = M.smoothstep(0.88, 0.998, base) * strength;
    const k = Math.min(0.4, dt * 3);
    this.spin += gs * w * k;
    this.tilt += gt * w * k;
  }

  /* -------------------------------------------------- 入力 */

  bindEvents() {
    const c = this.canvas;
    const opt = { passive: false };
    c.addEventListener('pointerdown', (e) => this.onDown(e), opt);
    c.addEventListener('pointermove', (e) => this.onMove(e), opt);
    c.addEventListener('pointerup', (e) => this.onUp(e), opt);
    c.addEventListener('pointercancel', (e) => this.onUp(e), opt);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('gesturestart', (e) => e.preventDefault());

    this.hud.again.addEventListener('click', () => {
      this.sound.chime(523.25, 1.2, 0.09);
      this.fadeToNewCrystal();
    });

    addEventListener('resize', () => this.layout());
    addEventListener('orientationchange', () => setTimeout(() => this.layout(), 250));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.sound.resume();
    });
  }

  onDown(e) {
    if (this.pointer.id !== null) return;
    e.preventDefault();
    this.sound.start();
    this.sound.resume();
    this.canvas.setPointerCapture?.(e.pointerId);
    const p = this.pointer;
    p.id = e.pointerId;
    p.x = p.sx = e.clientX;
    p.y = p.sy = e.clientY;
    p.active = true;
    p.moved = 0;

    if (this.stage === 'place' && !this.dropping) {
      this.dropping = true;
      this.hud.hint(null);
      this.sound.chime(392, 1.8, 0.10);
    }

    this.updateDragSigns();
  }

  /** 指の動きと目の動きが必ず同じ向きになるよう、符号を決めておく */
  updateDragSigns() {
    const fwd = this.camFwd;
    const e0 = 0.05;
    const ox1 = this.eyeOffset(this.spin + e0, this.tilt, fwd)[0];
    const ox0 = this.eyeOffset(this.spin - e0, this.tilt, fwd)[0];
    const oy1 = this.eyeOffset(this.spin, this.tilt + e0, fwd)[1];
    const oy0 = this.eyeOffset(this.spin, this.tilt - e0, fwd)[1];
    this.signSpin = Math.sign(ox1 - ox0) || 1;
    this.signTilt = Math.sign(oy1 - oy0) || 1;
  }

  onMove(e) {
    const p = this.pointer;
    if (p.id !== e.pointerId || !p.active) return;
    e.preventDefault();
    const m = Math.min(this.cssW, this.cssH) || 1;
    const dx = (e.clientX - p.x) / m;
    const dy = (e.clientY - p.y) / m;
    p.moved += Math.hypot(dx, dy);

    if (this.stage === 'ring') {
      // 画面中心まわりの円運動
      const cx = this.cssW / 2, cy = this.cssH / 2;
      const r0 = Math.hypot(p.x - cx, p.y - cy) / m;
      const r1 = Math.hypot(e.clientX - cx, e.clientY - cy) / m;
      if (r0 > 0.10 && r1 > 0.10) {
        const a0 = Math.atan2(p.y - cy, p.x - cx);
        const a1 = Math.atan2(e.clientY - cy, e.clientX - cx);
        const d = M.angDiff(a1, a0);
        this.ringAngle += d;
        this.charge = Math.min(1, this.charge + Math.abs(d) / (Math.PI * 2 * 1.35));
      }
    } else if (this.stage === 'spin') {
      // 左右だけ：回転
      this.spin += dx * 2.6 * this.signSpin;
    } else if (this.stage === 'eye') {
      this.spin += dx * 2.1 * this.signSpin;
      this.tilt += -dy * 1.5 * this.signTilt;
      this.tilt = M.clamp(this.tilt, this.best.tilt - 1.0, this.best.tilt + 1.0);
    }

    p.x = e.clientX;
    p.y = e.clientY;
  }

  onUp(e) {
    const p = this.pointer;
    if (p.id !== e.pointerId) return;
    p.id = null;
    p.active = false;
  }

  /* -------------------------------------------------- レイアウト */

  layout() {
    const cap = 2.0;
    this.cssW = Math.max(1, innerWidth);
    this.cssH = Math.max(1, innerHeight);
    this.dpr = Math.min(devicePixelRatio || 1, cap);
    if (!this._scaleInit) {
      // 画素密度が高い端末では、はじめから少し控えめに描く
      this._scaleInit = true;
      this.quality = this.dpr > 1.5 ? 0.8 : 1.0;
      this.renderer.setRenderScale(this.quality);
    }
    this.aspect = this.cssW / this.cssH;
    this.renderer.resize(this.cssW, this.cssH, this.dpr);
    this.hud.layout();
  }

  /* -------------------------------------------------- 進行 */

  setStage(name) {
    if (this.stage === name) return;
    this.stage = name;
    this.stageTime = 0;
    this.holdTimer = 0;
    // 段階が変わったら、今の指の動きはここで打ち切る。
    // （リングを回していた指がそのまま結晶を回してしまわないように）
    this.pointer.active = false;
    if (name === 'spin' || name === 'eye') this.updateDragSigns();
  }

  fadeToNewCrystal() {
    if (this.stage === 'wipe') return;
    this.setStage('wipe');
    this.hud.showAgain(false);
    this.hud.showProgress(false);
    this.hud.hint(null);
  }

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.stageTime += dt;
    const def = this.def;

    // ---- 段階ごとの進行 ----
    switch (this.stage) {
      case 'place': this.updPlace(dt); break;
      case 'ring': this.updRing(dt); break;
      case 'spin': this.updSpin(dt); break;
      case 'enter': this.updEnter(dt); break;
      case 'eye': this.updEye(dt); break;
      case 'finale': this.updFinale(dt); break;
      case 'rest': this.updRest(dt); break;
      case 'wipe': this.updWipe(dt); break;
    }

    // ---- カメラ ----
    if (this.stage !== 'enter' && this.stage !== 'finale') {
      this.camT = M.approach(this.camT, this.camTTarget, 1.1, dt);
    }
    this.applyCamera();

    // ---- 向き ----
    M.rotX3(this.tmpA, this.tilt);
    M.rotY3(this.tmpB, this.spin);
    M.mul3(this.rot3, this.tmpA, this.tmpB);
    this.axisFor(this.spin, this.tilt, this.axisWorld);
    this.buildAxisBasis(this.axisWorld, this.axisBasis);
    this.align = Math.abs(M.dot3(this.axisWorld, this.camFwd));

    // ---- 結晶の位置 ----
    const y = CENTER[1] + this.dropT * 1.5;
    const bob = Math.sin(this.time * 0.7) * 0.012 * (1 - this.dropT);
    M.composeTRS(this.crystalModel, [0, y + bob, 0], this.rot3, 1.0);
    M.identity(this.ringModel);

    // ---- 模様の状態 ----
    const off = this.eyeOffset(this.spin, this.tilt, this.camFwd);
    const offLen = Math.hypot(off[0], off[1]);
    const warpDir = offLen > 1e-4 ? [off[0] / offLen, off[1] / offLen] : [1, 0];
    this.pat = {
      polAngle: this.ringAngle * 0.5,
      gain: this.gain,
      spin: this.spin,
      time: this.time,
      warp: def.warpGain * M.clamp(offLen * 1.2, 0, 1),
      warpDir,
      patScale: this.patScale,
      ringMul: this.ringMul,
      open: this.open,
      burst: this.burst,
    };
  }

  updPlace(dt) {
    this.light = M.approach(this.light, 1, 1.2, dt);
    this.stageAlpha = M.approach(this.stageAlpha, 1, 1.4, dt);
    this.crystalFade = M.approach(this.crystalFade, 1, 1.0, dt);
    this.gain = M.approach(this.gain, 0.05, 1.0, dt);
    this.camTTarget = 0;
    if (this.dropping) {
      this.dropT = M.approach(this.dropT, 0, 2.6, dt);
      if (this.dropT < 0.02) {
        this.dropT = 0;
        this.setStage('ring');
        this.sound.chime(523.25, 2.2, 0.09);
        this.hud.showProgress(true);
      }
    } else if (this.stageTime > 1.1) {
      this.hud.hint('tap');
    }
  }

  updRing(dt) {
    this.camTTarget = 0.35 + this.charge * 0.25;
    this.gain = M.approach(this.gain, 0.10 + 0.55 * this.charge, 2.0, dt);
    this.hud.setProgress(this.charge);
    if (this.charge < 0.02 && this.stageTime > 0.9) this.hud.hint('circle');
    else if (this.charge > 0.05) this.hud.hint(this.charge > 0.85 ? null : 'circle');

    const step = Math.floor(this.charge * 8);
    if (step > this.soundStep) { this.soundStep = step; this.sound.step(step); }

    if (this.charge >= 1) {
      this.setStage('spin');
      this.soundStep = -1;
      this.sound.chime(659.25, 2.4, 0.10);
      this.sound.swell();
      this.hud.hint(null);
    }
  }

  updSpin(dt) {
    this.gain = M.approach(this.gain, 0.95, 1.5, dt);
    const a = M.smoothstep(0.45, 0.95, this.align);
    this.camTTarget = 1.0 + a * 1.0;
    this.hud.setProgress(a);

    if (this.stageTime > 0.8 && this.align < 0.9) this.hud.hint('swipeX');
    else this.hud.hint(null);

    const step = Math.floor(a * 9);
    if (step > this.soundStep) { this.soundStep = step; this.sound.step(step + 1); }

    // 近いところでは少しだけ引き寄せる
    this.magnet(dt, 0.35);

    if (this.align > 0.945) {
      this.holdTimer += dt;
      if (this.holdTimer > 0.35) {
        this.setStage('enter');
        this.enterT = 0;
        this.soundStep = -1;
        this.sound.swell();
        this.sound.chime(783.99, 3.0, 0.10);
        this.hud.hint(null);
        this.hud.showProgress(false);
        // 中へ入ったあと、少しだけ目がずれるようにしておく
        this.enterDrift = {
          spin: this.def.rng.range(0.24, 0.42) * this.def.rng.sign(),
          tilt: this.def.rng.range(0.10, 0.22) * this.def.rng.sign(),
          done: 0,
        };
      }
    } else {
      this.holdTimer = Math.max(0, this.holdTimer - dt);
    }
  }

  updEnter(dt) {
    const DUR = 2.8;
    this.enterT = Math.min(1, this.enterT + dt / DUR);
    const u = M.easeInOut(this.enterT);
    this.camT = 2 + u;

    // 表面を通り抜ける演出
    this.pass = Math.sin(M.clamp((this.enterT - 0.25) / 0.7, 0, 1) * Math.PI);
    this.flash = Math.pow(M.smoothstep(0.62, 0.86, this.enterT) * (1 - M.smoothstep(0.86, 1.0, this.enterT)), 1.5) * 0.55;

    this.gain = M.mix(0.85, 1.0, u);
    this.crystalFade = 1 - M.smoothstep(0.80, 0.99, this.enterT);
    this.eyeAlpha = M.smoothstep(0.68, 0.94, this.enterT);
    this.stageAlpha = 1 - M.smoothstep(0.35, 0.8, this.enterT);
    this.light = 1 - M.smoothstep(0.4, 0.9, this.enterT);

    // ゆっくりずらす（入ったあとに“開ける”余地を残す）
    const d = this.enterDrift;
    const want = M.smoothstep(0.55, 1.0, this.enterT);
    this.spin += d.spin * (want - d.done);
    this.tilt += d.tilt * (want - d.done);
    d.done = want;

    if (this.enterT >= 1) {
      this.setStage('eye');
      this.pass = 0;
      this.flash = 0;
      this.crystalFade = 0;
      this.eyeAlpha = 1;
      this.hud.showProgress(true);
      this.soundStep = -1;
    }
  }

  updEye(dt) {
    this.camT = 3;
    this.gain = M.approach(this.gain, 1.0, 2.0, dt);
    this.crystalFade = 0;
    this.eyeAlpha = 1;
    this.stageAlpha = 0;
    this.light = 0;

    const a = M.smoothstep(0.88, 0.995, this.align);
    this.open = M.approach(this.open, a, 6.0, dt);
    this.hud.setProgress(a);

    const step = Math.floor(a * 10);
    if (step > this.soundStep) { this.soundStep = step; this.sound.step(step + 1); }

    // なかなか開かないときは、だんだん強く引き寄せる
    this.assistBoost = M.smoothstep(14, 34, this.stageTime);
    this.magnet(dt, 0.42 + this.assistBoost * 1.5);

    // ずれの大きい方向だけを案内する
    this.hintTimer -= dt;
    if (a < 0.92) {
      if (this.hintTimer <= 0) {
        const off = this.eyeOffset(this.spin, this.tilt, this.camFwd);
        this.hintAxis = Math.abs(off[0]) >= Math.abs(off[1]) * 0.85 ? 'x' : 'y';
        this.hintTimer = 2.4;
      }
      this.hud.hint(this.hintAxis === 'x' ? 'swipeX' : 'swipeY');
    } else {
      this.hud.hint(null);
    }

    if (this.align > 0.986) {
      this.holdTimer += dt;
      if (this.holdTimer > 0.5) {
        this.setStage('finale');
        this.finaleT = 0;
        this.hud.hint(null);
        this.hud.showProgress(false);
        this.sound.sparkle();
        this.sound.swell();
      }
    } else {
      this.holdTimer = Math.max(0, this.holdTimer - dt * 0.6);
    }
  }

  updFinale(dt) {
    const t = (this.finaleT += dt);
    this.magnet(dt, 2.2);
    this.open = M.approach(this.open, 1, 3.0, dt);

    // 虹の輪が画面の外へ広がっていく
    // 同心円の数を減らすと、輪がどんどん外へ広がっていく
    const spread = M.smoothstep(0.2, 3.2, t);
    this.burstScale = M.mix(1.0, 0.26, spread) + M.smoothstep(3.2, 8.0, t) * 0.74;
    this.burst = spread * 0.8;
    this.patBoost = M.mix(1.0, 0.86, Math.sin(M.clamp(t / 3.4, 0, 1) * Math.PI));
    this.gain = 1.0 + 0.16 * Math.sin(M.clamp(t / 2.6, 0, 1) * Math.PI);
    this.exposure = 1.0 + 0.10 * Math.sin(M.clamp(t / 2.2, 0, 1) * Math.PI);
    this.flash = 0.22 * Math.pow(Math.max(0, 1 - Math.abs(t - 0.55) / 0.55), 2);

    // ゆっくり落ち着いて、結晶の外へ戻る
    const back = M.smoothstep(4.2, 8.4, t);
    this.camT = 3 - back * 1.75;
    this.eyeAlpha = 1 - M.smoothstep(4.6, 6.6, t);
    this.crystalFade = M.smoothstep(4.5, 6.4, t);
    this.stageAlpha = M.smoothstep(5.0, 7.4, t);
    this.light = M.smoothstep(5.0, 7.4, t);

    if (t > 8.6) {
      this.setStage('rest');
      this.camTTarget = 1.25;
      this.hud.showAgain(true);
    }
  }

  updRest(dt) {
    this.camTTarget = 1.25;
    this.gain = M.approach(this.gain, 0.78, 1.0, dt);
    this.exposure = M.approach(this.exposure, 1.0, 1.0, dt);
    this.burst = M.approach(this.burst, 0.35, 0.5, dt);
    this.burstScale = M.approach(this.burstScale, 1.0, 0.5, dt);
    this.patBoost = M.approach(this.patBoost, 1.0, 1.0, dt);
    this.open = 1;
    this.eyeAlpha = 0;
    this.crystalFade = 1;
    this.stageAlpha = 1;
    this.light = 1;
    this.flash = 0;
    // 合った角度のまわりでゆっくり揺れ続ける。
    // 石の中に虹の目がいるのが、そのまま見えている状態。
    const t = this.time * this.def.spinDir;
    this.spin = M.approach(this.spin, this.best.spin + Math.sin(t * 0.30) * 0.085, 1.5, dt);
    this.tilt = M.approach(this.tilt, this.best.tilt + Math.cos(t * 0.23) * 0.045, 1.5, dt);
  }

  updWipe(dt) {
    this.light = M.approach(this.light, 0, 2.4, dt);
    this.crystalFade = M.approach(this.crystalFade, 0, 2.6, dt);
    this.stageAlpha = M.approach(this.stageAlpha, 0, 2.6, dt);
    this.gain = M.approach(this.gain, 0, 2.6, dt);
    if (this.stageTime > 0.9) {
      const seed = ((Math.random() * 1e9) | 0) >>> 0;
      this.reset(seed);
      this.dropping = true;   // すぐに置きなおす
      this.hud.hint(null);
    }
  }

  /* -------------------------------------------------- カメラ */

  applyCamera() {
    const t = M.clamp(this.camT, 0, 3);
    const i = Math.min(2, Math.floor(t));
    const f = t - i;
    const A = this.kf[i], B = this.kf[i + 1];
    const u = M.easeInOut(M.clamp(f, 0, 1));

    for (let k = 0; k < 3; k++) this.camEye[k] = M.mix(A.eye[k], B.eye[k], u);
    for (let k = 0; k < 3; k++) this.camFwd[k] = M.mix(A.fwd[k], B.fwd[k], u);
    M.normalize3(this.camFwd);

    const fov = M.mix(A.fov, B.fov, u);
    this.patScale = M.mix(A.pat, B.pat, u) * this.def.patMul * this.patBoost;
    this.ringMul = M.mix(A.ring, B.ring, u);
    if (this.ringMul > 1.001) {
      this.ringMul = 1 + (this.ringMul - 1) * (this.def.ringMulEye - 1) / 0.9;
    }
    this.ringMul *= this.burstScale;
    this.glass = M.mix(A.glass, B.glass, u);
    this.vign = M.mix(A.vign, B.vign, u);

    M.perspectiveMinAxis(this.proj, fov, this.aspect, 0.02, 40);
    this.tanHalf = M.tanHalfMin(fov);

    const target = [
      this.camEye[0] + this.camFwd[0],
      this.camEye[1] + this.camFwd[1],
      this.camEye[2] + this.camFwd[2],
    ];
    M.lookAt(this.view, this.camEye, target, [0, 1, 0]);

    const v = this.view;
    this.viewRot[0] = v[0]; this.viewRot[1] = v[1]; this.viewRot[2] = v[2];
    this.viewRot[3] = v[4]; this.viewRot[4] = v[5]; this.viewRot[5] = v[6];
    this.viewRot[6] = v[8]; this.viewRot[7] = v[9]; this.viewRot[8] = v[10];
    M.transpose3(this.invViewRot, this.viewRot);
  }

  /* -------------------------------------------------- 描画 */

  render() {
    const lidW = 0.42 * Math.max(1, this.aspect) + 0.32;
    const lidH = 0.34 * Math.max(1, 1 / this.aspect) + 0.30;
    this.renderer.draw({
      time: this.time,
      proj: this.proj,
      view: this.view,
      identity: this.identity,
      crystalModel: this.crystalModel,
      crystalRot: this.rot3,
      ringModel: this.ringModel,
      camPos: this.camEye,
      axisBasis: this.axisBasis,
      invViewRot: this.invViewRot,
      tanHalf: this.tanHalf,
      def: this.def,
      pat: this.pat,
      crystalFade: this.crystalFade,
      eyeAlpha: this.eyeAlpha,
      stageAlpha: this.stageAlpha,
      ringAngle: this.ringAngle,
      charge: this.charge,
      light: this.light,
      glass: this.glass,
      vign: this.vign,
      lidW,
      lidH,
      camFwd: this.camFwd,
      pass: this.pass,
      flash: this.flash,
      exposure: this.exposure,
      bloom: 0.40,
      bloomThreshold: 0.62,
    });
  }

  /** 画質の自動調整（重いときだけ解像度を落とす） */
  adaptQuality(dt) {
    this.fpsAcc += dt;
    this.frames++;
    if (this.fpsAcc >= 1.0) {
      const fps = this.frames / this.fpsAcc;
      this.frames = 0;
      this.fpsAcc = 0;
      if (fps < 40 && this.quality > 0.55) this.quality -= 0.15;
      else if (fps > 57 && this.quality < 1.0) this.quality += 0.05;
      this.quality = M.clamp(this.quality, 0.5, 1.0);
      this.renderer.setRenderScale(this.quality);
    }
  }
}

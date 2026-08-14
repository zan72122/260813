import * as THREE from 'three';
import { CameraRig } from './core/camera-rig.js';
import { Pointer } from './core/pointer.js';
import { Sound } from './core/audio.js';
import { Tweener, clamp } from './core/util.js';
import { Hud } from './ui/hud.js';
import { World } from './world/world.js';
import { L } from './world/layout.js';
import { TILT } from './modules/dock-nozzle.js';

import { WatchBand } from './modules/watch-band.js';
import { PrintRoller } from './modules/print-roller.js';
import { CutRoller } from './modules/cut-roller.js';
import { BakeOven } from './modules/bake-oven.js';
import { DockNozzle } from './modules/dock-nozzle.js';
import { FillChoco } from './modules/fill-choco.js';
import { RevealLineup } from './modules/reveal-lineup.js';
import { SnapBiscuit } from './modules/snap-biscuit.js';

/** The camera chain, in order. One module, one verb. */
const STAGES = [
  WatchBand, // 見る   — a long beige band, and no idea what it is
  PrintRoller, // 回す → 印刷
  CutRoller, // 回す → 型抜き
  BakeOven, // 通す → 焼き色
  DockNozzle, // 差す → ノズル接続
  FillChoco, // 押す → チョコ注入 (+ 冷却)
  RevealLineup, // 引き    — the first wide shot
  SnapBiscuit, // 割る → 断面Reveal
];

export class Game {
  constructor(canvas, { fast = false } = {}) {
    this.canvas = canvas;
    this.fast = fast;
    const dpr = window.devicePixelRatio || 1;
    const cores = navigator.hardwareConcurrency || 4;
    this.quality = fast || cores <= 4 || dpr < 1.2 ? 'low' : 'high';
    this.dprCap = fast ? 1 : this.quality === 'low' ? 1.5 : 2;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: dpr < 1.6 && !fast,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(dpr, this.dprCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.rig = new CameraRig(this.camera);
    this.world = new World(this.scene, { quality: this.quality });
    this.hud = new Hud(document.getElementById('ui'));
    this.sound = new Sound();
    this.tween = new Tweener();
    this.pointer = new Pointer(canvas);
    this.raycaster = new THREE.Raycaster();
    this._v2 = { x: 0, y: 0 };
    this._ndc = new THREE.Vector2();
    this.size = { w: 1, h: 1 };

    this.ctx = {
      world: this.world,
      rig: this.rig,
      hud: this.hud,
      sound: this.sound,
      tween: this.tween,
      camera: this.camera,
      pointer: this.pointer,
      next: () => this.next(),
      toScreen: (v) => this.toScreen(v),
      anchorAt: (v, dx, dy) => this.anchorAt(v, dx, dy),
      anchorScreen: (fx, fy) => this.hud.at(this.size.w * fx, this.size.h * fy),
      unitsPerPixel: (v) => this.unitsPerPixel(v),
      raycast: (mesh, p) => this.raycast(mesh, p),
      nearestInstance: (mesh, positions, alive, p) => this.nearestInstance(mesh, positions, alive, p),
      size: this.size,
    };

    this.pointer.on.down = (p) => {
      this.sound.unlock();
      this.stage?.down(p);
    };
    this.pointer.on.move = (p) => this.stage?.move(p);
    this.pointer.on.up = (p) => this.stage?.up(p);

    this.hud.btnSound.addEventListener('click', () => {
      this.sound.unlock();
      const on = !this.sound.enabled;
      this.sound.setEnabled(on);
      this.hud.setSoundIcon(on);
    });
    this.hud.btnAgain.addEventListener('click', (e) => {
      e.stopPropagation();
      this.restart();
    });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 260));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.sound.stopAllLoops();
    });

    this.resize();
    this.index = -1;
    this.last = 0;
    this.frames = 0;
  }

  start() {
    this.hud.showSound(true);
    this.hud.setSoundIcon(true);
    this.goTo(0);
    this.last = performance.now();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = clamp((now - this.last) / 1000, 0, 1 / 20);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  goTo(i) {
    if (this.stage) this.stage.exit();
    this.index = i;
    const Klass = STAGES[i];
    this.stage = new Klass(this.ctx);
    this.hud.setStep(Klass.pip);
    this.stage.enter();
  }

  next() {
    if (this.index + 1 < STAGES.length) this.goTo(this.index + 1);
  }

  restart() {
    this.tween.clear();
    this.sound.stopAllLoops();
    this.hud.showAgain(false);
    this.hud.show(null);
    this.world.reset();
    this.goTo(0);
  }

  frame(dt) {
    this.tween.update(dt);
    this.stage?.update(dt);
    this.world.update(dt);
    this.rig.update(dt);
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.size.w = w;
    this.size.h = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / h);
  }

  toScreen(v) {
    return this.rig.project(v, this._v2, this.size.w, this.size.h);
  }

  anchorAt(v, dx = 0, dy = 0) {
    const s = this.toScreen(v);
    // keep the whole finger ring on screen, not just its centre
    this.hud.at(clamp(s.x + dx, 92, this.size.w - 92), clamp(s.y + dy, 104, this.size.h - 104));
  }

  unitsPerPixel(v) {
    const dist = this.camera.position.distanceTo(v);
    return (2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist) / this.size.h;
  }

  raycast(mesh, p) {
    this._ndc.set((p.x / this.size.w) * 2 - 1, -(p.y / this.size.h) * 2 + 1);
    this.raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this.raycaster.intersectObject(mesh, false);
    return hits.length ? hits[0] : null;
  }

  /** Forgiving fallback: whatever alive instance is closest to the fingertip. */
  nearestInstance(mesh, positions, alive, p) {
    let best = -1;
    let bestD = 150 * 150;
    for (let i = 0; i < positions.length; i++) {
      if (!alive[i]) continue;
      const s = this.toScreen(positions[i]);
      const d = (s.x - p.x) ** 2 + (s.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /**
   * Jump straight into a stage with the factory already in the state that
   * stage expects. Used by `?stage=N` and by the play-through tests.
   */
  jumpTo(i) {
    const w = this.world;
    this.tween.clear();
    w.reset();
    if (i >= 2) for (let t = 0; t < L.cells; t++) w.strip.printCell(t, w.animalFor(t), 1);
    if (i >= 3) {
      w.setBand(L.cells * 2, L.cells);
      w.setLine(L.cells, 0);
    }
    if (i >= 4) {
      w.lineMats.setBakeAll(1);
      w.setLine(L.cells, L.bakePush);
    }
    if (i >= 5) {
      w.hideLineInstance(0);
      w.setHeroCell(L.cells - 1);
      w.hero.visible = true;
      w.hero.position.set(L.heroX, L.heroY, 0);
      w.holder.visible = true;
      w.tank.visible = true;
      w.gantry.visible = true;
      w.heroPivot.rotation.x = -TILT;
      w.holder.rotation.x = -TILT;
      w.dockNozzleNow();
    }
    if (i >= 6) {
      w.choco.setFill(L.chocoFullR);
      w.nozzle.visible = false;
    }
    if (i >= 7) {
      w.tray.visible = true;
      w.setTrayReveal(1);
      w.hero.visible = false;
      w.line.visible = false;
    }
    this.goTo(i);
  }

  /**
   * How many CSS pixels one biscuit currently spans. This is the number that
   * decides whether a 4 year old can tell a cat from a rabbit, so the tests
   * assert on it directly.
   */
  biscuitPixels() {
    const target =
      this.index >= 6 ? this.world.trayPos[22] : this.index >= 4 ? this.world.hero.position : null;
    const p = target || new THREE.Vector3(this.rig._look.x, 0.2, 0);
    return L.biscuitW / this.unitsPerPixel(p);
  }

  /** Test hook: deterministic access to where the game is and what it shows. */
  debugState() {
    return {
      index: this.index,
      verb: STAGES[this.index]?.verb,
      stages: STAGES.map((s) => s.verb),
      frames: this.frames,
      printed: this.world.strip.progress.slice(),
      trayVisible: this.world.tray.visible,
      heroVisible: this.world.hero.visible,
      fill: this.world.choco.userData.fill.uFillR.value,
      halfGap: Math.abs(this.world.halves[1].position.x - this.world.halves[0].position.x),
      cameraDistance: this.camera.position.distanceTo(this.rig._look),
      stage: this.stage,
    };
  }
}

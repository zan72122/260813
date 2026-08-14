// The whole cognitive curve, one stage at a time.
//
//   white powder -> flatten -> stamp -> holes -> pour juice -> set ->
//   flip -> "where did it go?" -> BRUSH -> colour -> outline -> gummy! ->
//   polish -> pull back on a table full of them -> dig again forever
//
// The one rule that outranks everything else: nothing colourful, and nothing
// gummy-shaped, is shown before the child pours the juice themselves.

import * as THREE from 'three';
import { FAST, FORGIVE, JUICE, SEED, TIMING, TRAY, WHITE_WORLD } from './config.js';
import { PowderField } from './powder.js';
import { GummyField } from './gummies.js';
import { Puffs } from './particles.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { Pointer } from './input.js';
import { sfx, setMuted, unlock } from './audio.js';
import { SHAPES } from './shapes.js';
import {
  makeBrush,
  makeNozzle,
  makeRoller,
  makeScraper,
  makeStamp,
  makeTray,
  shapeCells,
} from './props.js';

function mulberry32(a) {
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export const STAGES = [
  'title',
  'flatten',
  'stamp',
  'lift',
  'pour',
  'cure',
  'flip',
  'dig',
  'polish',
  'finale',
  'free',
];

const LINES = {
  flatten: 'よこに なでなで して\nたいらに してね',
  flatten_done: 'たいらに なった！',
  stamp: 'かたを ぎゅっと\nしたに おして！',
  lift: 'あっ！ あなが できた',
  pour: 'いろの ジュースを\nあなに いれよう',
  cure: 'かたまるまで まってね…',
  flip: 'トレイを ぐるん！\nひっくり かえそう',
  buried: 'あれ？ どこ いった？',
  dig: 'ブラシで ゴシゴシ！',
  dig_color: 'なにか いろが みえる…',
  dig_shape: 'かたちが みえて きた！',
  polish: 'ころころ して ピカピカに！',
  free: 'こなの なかに かくれて いるよ\nほりだして！',
};

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} hud
   */
  constructor(canvas, hud) {
    this.view = new View(canvas);
    this.rnd = mulberry32(SEED);
    this.scene = this.view.scene;

    this.ui = new UI(hud, {
      onColor: (id) => this.pickColor(id),
      onSound: (on) => setMuted(!on),
    });

    // ---------------------------------------------------------------- world
    this.trayGroup = new THREE.Group();
    this.scene.add(this.trayGroup);
    this.trayGroup.add(makeTray());

    this.trayPowder = new PowderField({ phase: 0 });
    this.trayGroup.add(this.trayPowder.mesh);

    this.moundGroup = new THREE.Group();
    this.moundGroup.position.y = -1.48;
    this.moundGroup.visible = false;
    this.scene.add(this.moundGroup);

    this.mound = new PowderField({ phase: 1, width: TRAY.moundW, depth: TRAY.moundD });
    this.moundGroup.add(this.mound.mesh);

    this.gummies = new GummyField(this.trayGroup);
    this.puffs = new Puffs(this.scene);

    this.cells = shapeCells().map((c) => ({ ...c, fill: 0, gummy: null, colorHex: null }));

    // ---------------------------------------------------------------- tools
    this.tools = {
      scraper: makeScraper(),
      stamp: makeStamp(this.cells),
      nozzle: makeNozzle(JUICE[0].hex),
      brush: makeBrush(),
      roller: makeRoller(),
    };
    for (const t of Object.values(this.tools)) {
      t.visible = false;
      this.scene.add(t);
    }
    this.tool = null;

    // ---------------------------------------------------------------- state
    this.stage = 'title';
    this.time = 0;
    this.stageTime = 0;
    this.flatten = 0;
    this.digProgress = 0;
    this.gloss = 0;
    this.colorId = JUICE[0].id;
    this.colorIndex = 0;
    this.snapCell = null;
    this.stampPress = 0;
    this.stampY = 4.6;
    this.flipProgress = 0;
    this.trayLift = 0;
    this.foundCount = 0;
    this.round = 0;
    this._finalePanelAt = null;
    this._trayAway = 1;
    this._liftT = 0;
    this._measureAt = 0;
    this._toolPos = new THREE.Vector3();
    this._toolPrev = new THREE.Vector3();
    this._hit = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._lastInteraction = performance.now();
    this._hintPhase = 0;

    this.pointer = new Pointer(canvas);
    this.pointer.handlers.onDown = () => this.onDown();
    this.pointer.handlers.onMove = () => this.onMove();
    this.pointer.handlers.onUp = () => this.onUp();

    window.addEventListener('resize', () => this.view.resize());
    window.addEventListener('orientationchange', () =>
      setTimeout(() => this.view.resize(), 250),
    );

    this.view.cutTo('tray', null, true);
    this.ui.setAccent(WHITE_WORLD.tray);
  }

  // =========================================================== stage machine
  setStage(name) {
    if (this.stage === name) return;
    this.stage = name;
    this.stageTime = 0;
    this._lastInteraction = performance.now();
    this.ui.hideHint();
    this.ui.hidePanel();

    switch (name) {
      case 'flatten':
        this.ui.hideTitle();
        this.ui.say(LINES.flatten);
        this.ui.showMeter(0);
        this.setTool('scraper');
        this.view.cutTo('tray');
        break;

      case 'stamp':
        this.ui.say(LINES.stamp);
        this.ui.hideMeter();
        this.setTool('stamp');
        this.stampPress = 0;
        this.view.cutTo('stamp');
        break;

      case 'lift':
        this.ui.say(LINES.lift);
        this.setTool(null);
        break;

      case 'pour':
        this.ui.say(LINES.pour);
        this.ui.showMeter(0);
        this.ui.showChips(JUICE, this.colorId);
        this.ui.setAccent(JUICE[this.colorIndex].hex); // first colour in the world
        this.setTool('nozzle');
        this.view.cutTo('pour', [0, 0, 0]);
        break;

      case 'cure':
        this.ui.say(LINES.cure);
        this.ui.hideChips();
        this.ui.hideMeter();
        this.setTool(null);
        this.view.cutTo('tray');
        break;

      case 'flip':
        this.ui.say(LINES.flip);
        this.setTool(null);
        this.view.cutTo('flip');
        this.flipProgress = 0;
        // a finger still held down from pouring must not tip the tray by
        // accident - wait for a deliberate new swipe
        this._flipArmed = false;
        break;

      case 'dig':
        this.ui.say(LINES.buried);
        this.ui.showMeter(0);
        this.setTool('brush');
        // The reveal shot. It is set once here and never cut again while the
        // child is brushing - finger, retreating powder and emerging gummy
        // all stay inside one frame.
        this.view.cutTo('dig');
        this.foundCount = 0;
        this.digDone = false;
        // The flip swipe often runs on past the landing. Hold the brush until
        // the finger lifts, so "where did it go?" gets its beat.
        this._digArmed = false;
        break;

      case 'polish':
        this.ui.say(LINES.polish);
        this.setTool('roller');
        this.view.cutTo('polish');
        this._glossSnap = false;
        break;

      case 'finale':
        this.ui.hidePrompt();
        this.ui.hideMeter();
        this.setTool(null);
        this.view.cutTo('finale');
        // the last of the starch blows away as the camera pulls back
        this.mound.clearCover();
        this.puffs.burst(0, this.moundGroup.position.y + 1.2, 0, {
          count: FAST ? 6 : 60,
          spread: 9,
          up: 2.2,
          size: 2.6,
          life: 1.6,
          color: WHITE_WORLD.powder,
        });
        this.spawnCrowd();
        this.ui.setAccent(JUICE[0].hex);
        sfx.fanfare();
        this._finalePanelAt = 3.4; // let the pull-back land before any UI
        break;

      case 'free':
        this.ui.say(LINES.free);
        this.ui.showMeter(0);
        this.setTool('brush');
        this.view.cutTo('dig');
        break;
      default:
        break;
    }
  }

  setTool(name) {
    for (const [k, t] of Object.entries(this.tools)) t.visible = k === name;
    this.tool = name ? this.tools[name] : null;
    if (name === 'stamp') {
      this.tools.stamp.position.set(0, this.stampY, 0);
    }
  }

  // ================================================================== input
  onDown() {
    unlock();
    this._lastInteraction = performance.now();
    this.ui.hideHint();
    if (this.stage === 'title') {
      sfx.tap();
      this.setStage('flatten');
      return;
    }
    this.updateToolFromPointer(true);
  }

  onMove() {
    this._lastInteraction = performance.now();
    this.updateToolFromPointer(false);
  }

  onUp() {
    this._lastInteraction = performance.now();
  }

  get onMound() {
    return this.stage === 'dig' || this.stage === 'polish' || this.stage === 'free';
  }

  /** Plane the current tool slides on, in world Y. */
  toolPlaneY() {
    if (this.onMound) return this.moundGroup.position.y + TRAY.moundAmp * 0.72;
    return 0;
  }

  /**
   * Roughly where the powder surface is right now at (x,z), in world Y.
   * Mirrors the shader's height function closely enough for a tool to ride on:
   * the same cover response and the same tapered rim.
   */
  surfaceY(x, z) {
    if (!this.onMound) return 0;
    const smooth = (e, v) => {
      const t = clamp01(v / e);
      return t * t * (3 - 2 * t);
    };
    const u = (x + this.mound.width / 2) / this.mound.width;
    const v = (z + this.mound.depth / 2) / this.mound.depth;
    const edge = smooth(0.26, u) * smooth(0.26, 1 - u) * smooth(0.28, v) * smooth(0.28, 1 - v);
    const cover = this.mound.coverAt(x, z, this.time * 1000);
    const t = clamp01((cover - 0.05) / 0.75);
    const drop = t * t * (3 - 2 * t);
    return this.moundGroup.position.y + TRAY.moundAmp * 0.85 * drop * edge;
  }

  /**
   * How far back (in world units) the brush must sit to land a fixed number of
   * pixels above the fingertip on THIS screen. A tall phone frames the shot on
   * width, so a world unit is worth far fewer pixels there than on a tablet.
   */
  brushLeadWorld(at) {
    const a = this.view.worldToScreen(at, this._s0 ?? (this._s0 = { x: 0, y: 0 }));
    this._probe ??= new THREE.Vector3();
    this._probe.set(at.x, at.y, at.z - 1);
    const b = this.view.worldToScreen(this._probe, this._s1 ?? (this._s1 = { x: 0, y: 0 }));
    const pxPerUnit = a.y - b.y; // moving away from the camera moves up-screen
    const [lo, hi] = FORGIVE.brushLeadWorldRange;
    if (!(pxPerUnit > 0.01)) return hi;
    return THREE.MathUtils.clamp(FORGIVE.brushLeadPx / pxPerUnit, lo, hi);
  }

  /**
   * Inverse of the brush lead: where a finger must press for the brush to land
   * on this spot. Used by the E2E suite to aim strokes at a known gummy.
   */
  brushTargetScreen(x, z) {
    this._probe2 ??= new THREE.Vector3();
    this._probe2.set(x, this.toolPlaneY(), z);
    const lead = this.brushLeadWorld(this._probe2);
    this._probe2.z = z + lead;
    return this.view.worldToScreen(this._probe2);
  }

  /**
   * Project the finger onto the working plane.
   *
   * During the reveal the brush runs a fixed distance FURTHER FROM the camera
   * than the finger. A world-space lead (not a screen-space one) keeps the gap
   * stable however oblique the shot is - a pixel offset explodes into metres
   * when the ray is nearly parallel to the table.
   */
  updateToolFromPointer(isDown) {
    const hit = this.view.screenToPlane(
      this.pointer.x,
      this.pointer.y,
      this.toolPlaneY(),
      this._hit,
    );
    if (!hit) return;
    if (this.onMound) {
      hit.z -= this.brushLeadWorld(hit);
      hit.x = THREE.MathUtils.clamp(hit.x, -this.mound.width / 2, this.mound.width / 2);
      hit.z = THREE.MathUtils.clamp(hit.z, -this.mound.depth / 2, this.mound.depth / 2);
    }
    if (isDown) this._toolPrev.copy(hit);
    this._toolPos.copy(hit);
  }

  // ================================================================== stages
  updateFlatten(_dt) {
    const t = this.tools.scraper;
    t.position.set(
      THREE.MathUtils.clamp(this._toolPos.x, -TRAY.w / 2, TRAY.w / 2),
      0.12,
      THREE.MathUtils.clamp(this._toolPos.z, -TRAY.d / 2, TRAY.d / 2),
    );

    if (this.pointer.down) {
      const dx = this._toolPos.x - this._toolPrev.x;
      const dz = this._toolPos.z - this._toolPrev.z;
      const moved = Math.hypot(dx, dz);
      if (moved > 0.02) {
        this.trayPowder.smooth(
          this._toolPrev.x,
          this._toolPrev.z,
          this._toolPos.x,
          this._toolPos.z,
          1.9,
        );
        sfx.swish(Math.min(1, moved * 1.4));
        if (this.rnd() < 0.5) {
          this.puffs.burst(t.position.x, 0.15, t.position.z, {
            count: 3,
            spread: 1.0,
            up: 0.7,
            size: 0.9,
            life: 0.5,
            color: WHITE_WORLD.powder,
          });
        }
        this._toolPrev.copy(this._toolPos);
      }
    }

    if (this.time - this._measureAt > 0.16) {
      this._measureAt = this.time;
      this.flatten = this.trayPowder.measure('rough');
      this.ui.showMeter(this.flatten / 0.85);
    }

    if (this.flatten >= 0.85) {
      this.trayPowder.smoothAll();
      this.ui.say(LINES.flatten_done);
      sfx.ding(0);
      this.after(0.9, () => this.setStage('stamp'));
      this.stage = 'flatten_done';
    }
  }

  updateStamp(dt) {
    const s = this.tools.stamp;
    if (this.pointer.down) {
      // downward finger travel drives the press; holding still also works
      const dy = (this.pointer.y - this.pointer.startY) / (this.view.height * 0.3);
      this.stampPress = Math.max(this.stampPress, clamp01(dy));
      this.stampPress = Math.min(1, this.stampPress + dt * 0.55);
    } else {
      this.stampPress = Math.max(0, this.stampPress - dt * 1.6);
    }
    this.stampY = 4.6 - this.stampPress * 4.6;
    s.position.set(0, this.stampY, 0);
    // a little tilt following the finger keeps it feeling held
    s.rotation.z = THREE.MathUtils.clamp(
      (this.pointer.x / this.view.width - 0.5) * 0.12,
      -0.1,
      0.1,
    );

    if (this.stampPress >= 0.995) {
      this.doStamp();
    }
  }

  doStamp() {
    this.trayPowder.stamp(this.cells);
    sfx.thud();
    this.view.bump(1.0);
    for (const c of this.cells) {
      this.puffs.burst(c.x, 0.1, c.z, {
        count: FAST ? 2 : 8,
        spread: 1.5,
        up: 1.9,
        size: 1.2,
        life: 0.8,
        color: WHITE_WORLD.powder,
      });
    }
    this.setStage('lift');
    this._liftT = 0;
    this._liftDone = false;
  }

  updateLift(dt) {
    this._liftT = Math.min(1, (this._liftT ?? 0) + dt / (TIMING.stampLiftMs / 1000));
    const e = 1 - (1 - this._liftT) ** 3;
    this.tools.stamp.visible = this._liftT < 1;
    this.tools.stamp.position.y = e * 9;
    if (this._liftT >= 1 && !this._liftDone) {
      this._liftDone = true;
      this.tools.stamp.visible = false;
      // a beat to look at the holes before the juice shows up
      this.after(0.8, () => this.setStage('pour'));
    }
  }

  pickColor(id) {
    const i = JUICE.findIndex((j) => j.id === id);
    if (i < 0) return;
    this.colorIndex = i;
    this.colorId = id;
    this.ui.setActiveChip(id);
    this.ui.setAccent(JUICE[i].hex);
    this.retintNozzle(JUICE[i].hex);
    sfx.tap();
  }

  retintNozzle(hex) {
    this.tools.nozzle.traverse((o) => {
      if (o.isMesh && o.material?.color && o.geometry?.type === 'CylinderGeometry') {
        // only the bottle body carries the juice colour
        if (o.position.y > 1 && o.position.y < 2) o.material.color.set(hex);
      }
    });
  }

  nearestCell(x, z, onlyUnfilled = true) {
    let best = null;
    let bd = Infinity;
    for (const c of this.cells) {
      if (onlyUnfilled && c.fill >= 1) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return { cell: best, dist: bd };
  }

  updatePour(dt) {
    const n = this.tools.nozzle;
    // Snap: "close enough" is enough. If the nearest empty hole is far away we
    // still snap to it, so a wild drag never wastes juice on the floor.
    const near = this.nearestCell(this._toolPos.x, this._toolPos.z, true);
    if (near.cell) {
      const snap = near.dist < FORGIVE.nozzleSnapRadius ? 1 : 0.55;
      this.snapCell = near.cell;
      const tx = THREE.MathUtils.lerp(this._toolPos.x, near.cell.x, snap);
      const tz = THREE.MathUtils.lerp(this._toolPos.z, near.cell.z, snap);
      n.position.x = damp(n.position.x, tx, 14, dt);
      n.position.z = damp(n.position.z, tz, 14, dt);
    }
    n.position.y = damp(n.position.y, this.pointer.down ? 0.55 : 1.15, 10, dt);
    n.rotation.z = damp(n.rotation.z, this.pointer.down ? -0.42 : 0, 9, dt);

    if (this.pointer.down && this.snapCell) {
      this.fillCell(this.snapCell, dt * 2.4);
    }

    const filled = this.cells.filter((c) => c.fill >= 1).length;
    this.ui.showMeter(filled / this.cells.length);

    // macro camera drifts to whichever hole is being filled - gentle, damped,
    // and only re-solved when the target hole actually changes
    if (this.snapCell && this.snapCell !== this._aimedAt) {
      this._aimedAt = this.snapCell;
      this.view.aim([this.snapCell.x, 0, this.snapCell.z]);
    }

    if (filled >= this.cells.length) {
      this.setStage('cure');
    }
  }

  fillCell(cell, amount) {
    if (cell.fill >= 1) return;
    if (!cell.gummy) {
      cell.colorHex = JUICE[this.colorIndex].hex;
      cell.gummy = this.gummies.add({
        shapeId: cell.shapeId,
        colorHex: cell.colorHex,
        x: cell.x,
        y: -TRAY.cavityDepth,
        z: cell.z,
        rot: 0,
        size: cell.size,
        thick: TRAY.cavityDepth,
        fill: 0.02,
        jelly: 0,
        dust: 0,
      });
    }
    const before = cell.fill;
    cell.fill = Math.min(1, cell.fill + amount);
    if (cell.gummy) {
      cell.gummy.fill = cell.fill;
      this.gummies.write(cell.gummy, this.time);
    }
    if (Math.floor(before * 8) !== Math.floor(cell.fill * 8)) sfx.pour(cell.fill);
    if (before < 1 && cell.fill >= 1) {
      sfx.ding(this.cells.filter((c) => c.fill >= 1).length - 1);
      this.puffs.burst(cell.x, 0.12, cell.z, {
        count: FAST ? 2 : 7,
        spread: 0.7,
        up: 1.2,
        size: 0.55,
        life: 0.5,
        color: cell.colorHex,
      });
      // rotate the palette so the tray ends up genuinely multicoloured
      const next = (this.colorIndex + 1) % JUICE.length;
      this.pickColor(JUICE[next].id);
    }
  }

  updateCure(_dt) {
    const t = clamp01(this.stageTime / (TIMING.setCureMs / 1000));
    for (const c of this.cells) {
      if (!c.gummy) continue;
      c.gummy.jelly = t;
    }
    this.gummies.sync(this.time);
    if (t >= 1) {
      for (const c of this.cells) if (c.gummy) this.gummies.poke(c.gummy, 0.3);
      sfx.boing();
      this.setStage('flip');
    }
  }

  updateFlip(dt) {
    if (!this._flipArmed) {
      if (!this.pointer.down) this._flipArmed = true;
      return;
    }
    if (this.pointer.down) {
      const d = Math.hypot(this.pointer.dx, this.pointer.dy);
      this.flipProgress = Math.min(1, this.flipProgress + d / (FORGIVE.flipSwipePx * 5));
    } else if (this.flipProgress > 0.62) {
      this.flipProgress = Math.min(1, this.flipProgress + dt * 1.4); // snap over
    } else {
      this.flipProgress = Math.max(0, this.flipProgress - dt * 0.45);
    }

    const p = this.flipProgress;
    this.trayGroup.rotation.x = -Math.PI * p;
    this.trayGroup.position.y = -1.0 * Math.sin(p * Math.PI * 0.5);

    if (p > 0.45 && this.trayPowder.mesh.visible) {
      // the starch pours out - hide the surface behind a curtain of puffs
      this.trayPowder.mesh.visible = false;
      this.gummies.group.visible = false;
      sfx.whoosh();
      for (let i = 0; i < (FAST ? 6 : 26); i++) {
        this.puffs.burst((this.rnd() - 0.5) * TRAY.w, -0.5, (this.rnd() - 0.5) * TRAY.d, {
          count: FAST ? 2 : 6,
          spread: 1.6,
          up: -0.6,
          size: 1.5,
          life: 1.1,
          color: WHITE_WORLD.powder,
        });
      }
    }

    if (p >= 1) this.landFlip();
  }

  /** The tray is over: bury everything and lift the tray away. */
  landFlip() {
    this.moundGroup.visible = true;
    this.mound.resetCover();
    const k = TRAY.turnOutSpread;
    this.mound.setBumps(this.cells.map((c) => ({ x: -c.x * k, z: c.z * k, size: c.size })));

    // gummies fall out onto the table, mirrored like a real turned-out tray
    this.scene.add(this.gummies.group);
    this.gummies.group.position.set(0, this.moundGroup.position.y, 0);
    this.gummies.group.rotation.set(0, 0, 0);
    this.gummies.group.visible = true;
    for (const c of this.cells) {
      const g = c.gummy;
      if (!g) continue;
      g.x = -c.x * k;
      g.z = c.z * k;
      g.y = 0;
      g.rot = (this.rnd() - 0.5) * 0.9;
      g.dust = 1;
      g.jelly = 1;
      g.gloss = 0;
      g.found = false;
    }
    this.gummies.sync(this.time);

    this.puffs.burst(0, 0.3, 0, {
      count: FAST ? 4 : 40,
      spread: 5,
      up: 1.4,
      size: 2.2,
      life: 1.2,
      color: WHITE_WORLD.powder,
    });
    this.view.bump(0.9);
    sfx.thud();
    this._trayAway = 0;
    this.setStage('dig');
  }

  updateTrayAway(dt) {
    if (this._trayAway === undefined || this._trayAway >= 1) return;
    this._trayAway = Math.min(1, this._trayAway + dt / 0.9);
    const e = this._trayAway ** 2;
    this.trayGroup.position.y = -1.0 + e * 16;
    if (this._trayAway >= 1) this.trayGroup.visible = false;
  }

  updateDig(dt) {
    const b = this.tools.brush;
    // the brush rides the powder, dropping as the heap is swept away
    b.position.set(
      this._toolPos.x,
      this.surfaceY(this._toolPos.x, this._toolPos.z) - 0.12,
      this._toolPos.z,
    );
    // tilt the brush towards the finger so the causal link is unmistakable
    b.rotation.z = THREE.MathUtils.clamp(this.pointer.dx * 0.02, -0.5, 0.5) - 0.2;
    b.rotation.x = 0.55; // handle leans back towards the child's hand

    if (!this._digArmed && !this.pointer.down && this.stageTime > 1.0) this._digArmed = true;

    if (this._digArmed && this.pointer.down) {
      const lx = this._toolPos.x;
      const lz = this._toolPos.z;
      const px = this._toolPrev.x;
      const pz = this._toolPrev.z;
      const moved = Math.hypot(lx - px, lz - pz);
      if (moved > 0.015) {
        this.mound.brush(px, pz, lx, lz, 1.5);
        sfx.swish(Math.min(1, moved * 1.2));
        if (this.rnd() < 0.7) {
          this.puffs.burst(lx, this.surfaceY(lx, lz), lz, {
            count: FAST ? 1 : 5,
            spread: 1.4,
            up: 1.3,
            size: 1.2,
            life: 0.6,
            color: WHITE_WORLD.powder,
          });
        }
        this._toolPrev.set(lx, 0, lz);
      }
    }

    this.dustGummies(dt);

    if (this.time - this._measureAt > 0.2) {
      this._measureAt = this.time;
      this.digProgress = this.mound.measure('cover', this.time * 1000);
      const revealed = this.gummies.items.filter((g) => g.found).length;
      const total = Math.max(1, this.gummies.count);
      this.ui.showMeter(Math.max(revealed / total, this.digProgress / 0.45));
      if (this.stage === 'dig' && this.stageTime > 1.7) {
        if (revealed === 0) this.ui.say(LINES.dig, true);
        else if (revealed < 3) this.ui.say(LINES.dig_color, true);
        else if (revealed < total) this.ui.say(LINES.dig_shape, true);
      }
      // free rounds have no polishing pass to finish the job, so they hold on
      // a little longer before calling it done
      this.digDone =
        this.stage === 'free'
          ? revealed >= Math.ceil(total * 0.85) || this.digProgress >= 0.6
          : revealed >= Math.ceil(total * 0.75) || this.digProgress >= 0.45;
    }

    if (this.digDone) {
      this.digDone = false;
      if (this.stage === 'dig') this.setStage('polish');
      else this.finishFreeRound();
    }
  }

  /** Sample the cover mask under each gummy; lag it so dust wipes off. */
  dustGummies(dt) {
    const nowMs = this.time * 1000;
    let changed = false;
    const hw = this.mound.width / 2;
    const hd = this.mound.depth / 2;
    for (const g of this.gummies.items) {
      const outside = g.noDust || Math.abs(g.x) > hw - 0.2 || Math.abs(g.z) > hd - 0.2;
      const cover = outside ? 0 : this.mound.coverAt(g.x, g.z, nowMs);
      // ^0.7 keeps a pale film on for a moment after the powder has gone, and
      // the slow damp is what makes the last of the starch look wiped off
      const target = clamp01(Math.pow(cover, 0.7) * 1.06);
      const next = damp(g.dust, target, 4, dt);
      if (Math.abs(next - g.dust) > 0.001) {
        g.dust = next;
        changed = true;
      }
      if (!g.found && g.dust < 0.42) {
        g.found = true;
        this.foundCount++;
        sfx.ding(this.foundCount);
        this.gummies.poke(g, 0.3);
        this.puffs.burst(g.x, this.moundGroup.position.y + 0.9, g.z, {
          count: FAST ? 1 : 6,
          spread: 1.1,
          up: 1.1,
          size: 0.9,
          life: 0.6,
          color: WHITE_WORLD.powder,
        });
      }
    }
    if (changed) this.gummies.sync(this.time);
  }

  updatePolish(dt) {
    const r = this.tools.roller;
    r.position.set(
      this._toolPos.x,
      this.surfaceY(this._toolPos.x, this._toolPos.z) - 0.08,
      this._toolPos.z,
    );
    r.rotation.x += this.pointer.down ? dt * 8 : dt;

    if (this.pointer.down) {
      const moved = Math.hypot(this._toolPos.x - this._toolPrev.x, this._toolPos.z - this._toolPrev.z);
      if (moved > 0.01) {
        this.gloss = Math.min(1, this.gloss + moved * 0.055);
        // keep sweeping the last of the powder away while polishing
        this.mound.brush(
          this._toolPrev.x,
          this._toolPrev.z,
          this._toolPos.x,
          this._toolPos.z,
          1.7,
        );
        this._toolPrev.copy(this._toolPos);
        if (this.rnd() < 0.3) {
          const g = this.gummies.items[Math.floor(this.rnd() * this.gummies.count)];
          if (g) {
            this.gummies.poke(g, 0.2);
            this.puffs.burst(g.x, this.moundGroup.position.y + 1.0, g.z, {
              count: 2,
              spread: 0.5,
              up: 1.0,
              size: 0.5,
              life: 0.5,
              color: '#ffffff',
            });
          }
        }
      }
    }
    this.gloss = Math.min(1, this.gloss + dt * 0.03); // never stalls
    // "一気にツヤツヤ": past the halfway mark the shine takes over and finishes
    // itself in a third of a second, so the change reads as one event
    if (this.gloss > 0.55) {
      if (!this._glossSnap) {
        this._glossSnap = true;
        sfx.shine();
        for (const g of this.gummies.items) {
          this.gummies.poke(g, 0.28);
          this.puffs.burst(g.x, this.moundGroup.position.y + 1.1, g.z, {
            count: FAST ? 1 : 5,
            spread: 0.9,
            up: 1.6,
            size: 0.5,
            life: 0.7,
            color: '#ffffff',
          });
        }
      }
      this.gloss = Math.min(1, this.gloss + dt * 2.6);
    }
    for (const g of this.gummies.items) g.gloss = this.gloss;
    this.dustGummies(dt);
    this.ui.showMeter(this.gloss);

    if (this.gloss >= 1) {
      for (const g of this.gummies.items) this.gummies.poke(g, 0.26);
      this.setStage('finale');
    }
  }

  /** Fill the table for the pull-back: the first time "a lot" is ever shown. */
  spawnCrowd() {
    const extra = FAST ? 6 : 16;
    // A loose grid across the whole table, skipping anything that would land
    // on a gummy the child dug out - "たくさん ならんでる" rather than a pile.
    const spots = [];
    const cols = 7;
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * 2.85 + (this.rnd() - 0.5) * 0.7;
        const z = (r - (rows - 1) / 2) * 2.5 + (this.rnd() - 0.5) * 0.6;
        const clash = this.gummies.items.some((g) => Math.hypot(g.x - x, g.z - z) < 1.9);
        if (!clash) spots.push([x, z, Math.abs(x) + Math.abs(z) * 1.4]);
      }
    }
    // sorted outermost-first, then given decreasing delays: the new gummies
    // pop in from the middle outwards, chasing the widening camera
    spots.sort((a, b) => b[2] - a[2]);

    for (let i = 0; i < Math.min(extra, spots.length); i++) {
      const [x, z] = spots[i];
      const spec = SHAPES[Math.floor(this.rnd() * SHAPES.length)];
      const juice = JUICE[Math.floor(this.rnd() * JUICE.length)];
      const g = this.gummies.add({
        shapeId: spec.id,
        colorHex: juice.hex,
        x,
        y: 0,
        z,
        rot: this.rnd() * Math.PI,
        size: 0.72 + this.rnd() * 0.16,
        thick: 0.8,
        fill: 0.02,
        jelly: 1,
        dust: 0,
        gloss: 1,
      });
      if (g) {
        g.popDelay = 0.1 * (Math.min(extra, spots.length) - i);
        g.noDust = true;
      }
    }
    this.gummies.sync(this.time);
  }

  updateFinale(dt) {
    let changed = false;
    for (const g of this.gummies.items) {
      if (g.popDelay !== undefined) {
        g.popDelay -= dt;
        if (g.popDelay <= 0 && g.fill < 1) {
          g.fill = Math.min(1, g.fill + dt * 3.4);
          if (g.fill >= 1) {
            this.gummies.poke(g, 0.35);
            sfx.ding(this.foundCount++);
          }
          changed = true;
        }
      }
      if (g.gloss < 1) {
        g.gloss = Math.min(1, g.gloss + dt * 0.8);
        changed = true;
      }
    }
    if (changed) this.gummies.sync(this.time);
    this.dustGummies(dt);

    if (this._finalePanelAt !== null && this.stageTime > this._finalePanelAt) {
      this._finalePanelAt = null;
      this.ui.showPanel({
        title: 'グミだ！',
        body: 'こなに あなを つくって、いろの ジュースを いれて、さいごに グミを ほりだしたね！',
        buttons: [
          { label: 'もういっかい ほりだす', onClick: () => this.startFreeRound() },
          { label: 'さいしょから', kind: 'ghost', onClick: () => this.restart() },
        ],
      });
    }
  }

  // ============================================================== free play
  startFreeRound() {
    this.round++;
    this.ui.hidePanel();
    this.ui.hideTitle();

    // Self-sufficient: a free round can also be entered straight from a cold
    // start (the E2E suite does exactly that), so put the world into the
    // buried-mound configuration rather than assuming we came from the finale.
    this.trayGroup.visible = false;
    this.trayPowder.mesh.visible = false;
    this._trayAway = 1;
    this.moundGroup.visible = true;
    if (this.gummies.group.parent !== this.scene) this.scene.add(this.gummies.group);
    this.gummies.group.position.set(0, this.moundGroup.position.y, 0);
    this.gummies.group.rotation.set(0, 0, 0);
    this.gummies.group.visible = true;
    this.puffs.clear();

    this.gummies.clear();
    this.mound.resetCover();
    this.digProgress = 0;
    this.foundCount = 0;
    this.digDone = false;

    const n = FAST ? 6 : 12;
    const spots = [];
    for (let i = 0; i < n; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = (col - 1.5) * 2.2 + (this.rnd() - 0.5) * 0.6;
      const z = (row - (n / 4 - 1) / 2) * 1.9 + (this.rnd() - 0.5) * 0.5;
      const spec = SHAPES[Math.floor(this.rnd() * SHAPES.length)];
      const juice = JUICE[Math.floor(this.rnd() * JUICE.length)];
      this.gummies.add({
        shapeId: spec.id,
        colorHex: juice.hex,
        x,
        z,
        y: 0,
        rot: this.rnd() * Math.PI,
        size: 0.78 + this.rnd() * 0.18,
        thick: 0.85,
        fill: 1,
        jelly: 1,
        dust: 1,
        gloss: 0.85,
      });
      spots.push({ x, z, size: 0.8 });
    }
    this.mound.setBumps(spots);
    this.gummies.sync(this.time);
    this.stage = 'free';
    this.stageTime = 0;
    this._digArmed = true;
    this.ui.say(LINES.free, true);
    this.ui.showMeter(0);
    this.setTool('brush');
    this.view.cutTo('dig');
    this._lastInteraction = performance.now();
  }

  finishFreeRound() {
    sfx.fanfare();
    // sweep the last of the starch off so the round ends on a clean row of
    // gummies rather than a half-dug trench
    this.mound.clearCover();
    this.puffs.burst(0, this.moundGroup.position.y + 1.2, 0, {
      count: FAST ? 5 : 40,
      spread: 7,
      up: 2,
      size: 2.2,
      life: 1.3,
      color: WHITE_WORLD.powder,
    });
    for (const g of this.gummies.items) {
      g.dust = 0;
      this.gummies.poke(g, 0.3);
    }
    this.gummies.sync(this.time);
    this.ui.setAccent(JUICE[0].hex);
    this.stage = 'free_done';
    this.view.cutTo('polish');
    this.ui.hideMeter();
    this.ui.hidePrompt();
    this.setTool(null);
    this.after(1.2, () =>
      this.ui.showPanel({
        title: 'ぜんぶ ほりだせた！',
        body: 'つぎは どんな グミが かくれて いるかな？',
        buttons: [
          { label: 'もういっかい ほりだす', onClick: () => this.startFreeRound() },
          { label: 'さいしょから', kind: 'ghost', onClick: () => this.restart() },
        ],
      }),
    );
  }

  restart() {
    window.location.reload();
  }

  // ================================================================== idle
  updateHints(dt) {
    const idle = performance.now() - this._lastInteraction;
    if (this.pointer.down || idle < FORGIVE.idleHintMs) {
      if (idle < FORGIVE.idleHintMs) this.ui.hideHint();
      return;
    }
    this._hintPhase += dt;
    const w = this.view.width;
    const h = this.view.height;
    const cx = w / 2;
    const cy = h / 2;
    const sway = Math.sin(this._hintPhase * 1.8);
    switch (this.stage) {
      case 'title':
        this.ui.showHint(cx, cy + h * 0.22, '👆');
        break;
      case 'flatten':
        this.ui.showHint(cx + sway * w * 0.24, cy + h * 0.06, '👈');
        break;
      case 'stamp':
        this.ui.showHint(cx, cy + (0.5 + 0.5 * Math.sin(this._hintPhase * 2)) * h * 0.18, '👇');
        break;
      case 'pour':
        this.ui.showHint(cx + sway * w * 0.16, cy + h * 0.05, '💧');
        break;
      case 'flip':
        this.ui.showHint(
          cx + Math.cos(this._hintPhase * 1.6) * w * 0.2,
          cy + Math.sin(this._hintPhase * 1.6) * h * 0.14,
          '🔄',
        );
        break;
      case 'dig':
      case 'free':
        this.ui.showHint(cx + sway * w * 0.26, cy + h * 0.12, '🖐');
        break;
      case 'polish':
        this.ui.showHint(cx + sway * w * 0.2, cy + h * 0.1, '🔁');
        break;
      default:
        this.ui.hideHint();
    }

    // Last resort: nudge the world along so a stuck child is never stranded.
    // Throttled, so the assist looks like somebody helping rather than the
    // game finishing itself in a frame.
    if (idle > FORGIVE.idleAssistMs && this.time - (this._assistAt ?? -9) > 0.25) {
      this._assistAt = this.time;
      this.assist(0.25);
    }
  }

  assist(dt) {
    switch (this.stage) {
      case 'flatten': {
        const y = (this.rnd() - 0.5) * TRAY.d;
        this.trayPowder.smooth(-TRAY.w / 2, y, TRAY.w / 2, y, 2.2);
        break;
      }
      case 'stamp':
        this.stampPress = Math.min(1, this.stampPress + dt * 0.5);
        break;
      case 'pour': {
        const near = this.nearestCell(0, 0, true);
        if (near.cell) this.fillCell(near.cell, dt * 1.2);
        break;
      }
      case 'flip':
        this.flipProgress = Math.min(1, this.flipProgress + dt * 0.35);
        break;
      case 'dig':
      case 'free': {
        const y = (this.rnd() - 0.5) * 5;
        this.mound.brush(-5, y, 5, y, 1.4);
        break;
      }
      case 'polish':
        this.gloss = Math.min(1, this.gloss + dt * 0.25);
        break;
      default:
        break;
    }
  }

  after(seconds, fn) {
    (this._timers ??= []).push({ t: seconds, fn });
  }

  // =================================================================== loop
  update(dt) {
    this.time += dt;
    this.stageTime += dt;

    if (this._timers) {
      for (const timer of this._timers) {
        timer.t -= dt;
        if (timer.t <= 0 && !timer.done) {
          timer.done = true;
          timer.fn();
        }
      }
      this._timers = this._timers.filter((t) => !t.done);
    }

    switch (this.stage) {
      case 'flatten':
        this.updateFlatten(dt);
        break;
      case 'stamp':
        this.updateStamp(dt);
        break;
      case 'lift':
        this.updateLift(dt);
        break;
      case 'pour':
        this.updatePour(dt);
        break;
      case 'cure':
        this.updateCure(dt);
        break;
      case 'flip':
        this.updateFlip(dt);
        break;
      case 'dig':
      case 'free':
        this.updateDig(dt);
        break;
      case 'polish':
        this.updatePolish(dt);
        break;
      case 'finale':
        this.updateFinale(dt);
        break;
      default:
        break;
    }

    this.updateTrayAway(dt);
    this.updateHints(dt);
    this.trayPowder.flush();
    this.mound.flush();
    this.gummies.update(dt, this.time);
    this.puffs.update(dt);
    this.view.update(dt);
    this.view.render();
  }

  start() {
    if (this._raf) return;
    let last = performance.now();
    const frame = (now) => {
      this._raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
    };
    this._raf = requestAnimationFrame(frame);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
}

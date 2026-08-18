import * as THREE from 'three';
import { Stage } from './stage';
import { AudioManager } from './audio';
import { InputManager, PointerState } from './input';
import { CameraRig } from './cameraRig';
import { HintManager, HintSpec } from './hint';
import { UI } from './ui';
import { SaveData, saveSave } from './save';
import { StretchCheese, BagMesh, makeRibbon } from './cheese';
import { APRON_COLORS, BOWL_RIMS, PLATE_STYLES } from './materials';
import { clamp } from './util';

/** 主要なワールド座標 */
export const POS = {
  bowl: new THREE.Vector3(0, 0, 0),
  board: new THREE.Vector3(0, 0, 0.52),
  sideBowl: new THREE.Vector3(-1.15, 0, 0.1),
  pitcherHome: new THREE.Vector3(-1.1, 0, -0.75),
  pitcherWork: new THREE.Vector3(-0.72, 0, 0.66),
  coldBowl: new THREE.Vector3(1.55, 0, 0.45),
  plate: new THREE.Vector3(0.7, 0, 0.95),
  kettleSpout: new THREE.Vector3(0.62, 0.62, -0.5),
};

/** プレイヤーの作品パラメータ (リプレイごとに少しずつ違う) */
export interface Craft {
  maxStretch: number;
  folds: number;
  fillScoops: number;
  creamAmount: number;
  knotTilt: number;
  openDir: number;
}

export function defaultCraft(): Craft {
  return { maxStretch: 0, folds: 0, fillScoops: 0, creamAmount: 0, knotTilt: 0, openDir: 0 };
}

/** 共有ワールド: チーズ関連オブジェクトと状態チェックポイント */
export class World {
  curds: THREE.InstancedMesh;
  curdStates: { home: THREE.Vector3; pos: THREE.Vector3; gathered: number }[] = [];
  blob: THREE.Mesh;
  stretch: StretchCheese;
  bag: BagMesh;
  board: THREE.Mesh;
  /** stracciatella ボウルの中身 */
  sideCream: THREE.Mesh;
  sideRibbons: THREE.Group;
  sideCreamLevel = 0;
  stirSpin = 0;
  strip: THREE.Mesh;
  guideLine: THREE.Mesh;

  constructor(public stage: Stage) {
    const m = stage.mats;
    // カード(instanced)
    const geo = new THREE.SphereGeometry(0.055, 10, 8);
    this.curds = new THREE.InstancedMesh(geo, m.curd, 42);
    this.curds.castShadow = true;
    stage.scene.add(this.curds);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 42; i++) {
      const a = rnd(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 0.42;
      const p = new THREE.Vector3(Math.cos(a) * r, 0.09 + rnd(0, 0.05), Math.sin(a) * r);
      this.curdStates.push({ home: p.clone(), pos: p.clone(), gathered: 0 });
    }
    // 集まった塊
    this.blob = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), m.mozz);
    this.blob.castShadow = true;
    this.blob.visible = false;
    stage.scene.add(this.blob);
    // 伸ばしチーズ
    this.stretch = new StretchCheese(m.mozz);
    this.stretch.group.visible = false;
    stage.scene.add(this.stretch.group);
    // 袋
    this.bag = new BagMesh(m.mozz, m.cream);
    this.bag.group.visible = false;
    stage.scene.add(this.bag.group);
    // 作業ボード
    this.board = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.52, 0.05, 32),
      m.woodDark,
    );
    this.board.position.copy(POS.board);
    this.board.position.y = 0.025;
    this.board.receiveShadow = true;
    stage.scene.add(this.board);
    // side bowl 中身
    this.sideCream = new THREE.Mesh(new THREE.CircleGeometry(0.36, 28), m.cream);
    this.sideCream.rotation.x = -Math.PI / 2;
    this.sideCream.visible = false;
    this.sideCream.position.y = 0.1;
    stage.props.sideBowl.add(this.sideCream);
    this.sideRibbons = new THREE.Group();
    this.sideRibbons.position.y = 0.12;
    stage.props.sideBowl.add(this.sideRibbons);
    // 裂く用の帯
    this.strip = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 6, 12), m.mozz);
    this.strip.visible = false;
    stage.scene.add(this.strip);
    // 切り開きガイド
    this.guideLine = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.022, 0.5, 4, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85 }),
    );
    this.guideLine.rotation.z = Math.PI / 2;
    this.guideLine.visible = false;
    stage.scene.add(this.guideLine);
  }

  updateCurds() {
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < this.curdStates.length; i++) {
      const c = this.curdStates[i];
      const s = 1 - c.gathered * 0.85;
      mtx.makeScale(s, s * 0.9, s);
      mtx.setPosition(c.pos.x, c.pos.y, c.pos.z);
      this.curds.setMatrixAt(i, mtx);
    }
    this.curds.instanceMatrix.needsUpdate = true;
  }

  addSideRibbon(seed: number) {
    if (this.sideRibbons.children.length > 7) return;
    const r = makeRibbon(this.stage.mats.mozz, seed, 0.3);
    this.sideRibbons.add(r);
  }

  addInnerRibbon(seed: number) {
    if (this.bag.innerRibbons.children.length > 4) return;
    const r = makeRibbon(this.stage.mats.mozz, seed, 0.16);
    this.bag.innerRibbons.add(r);
  }

  setSideCream(level: number) {
    this.sideCreamLevel = clamp(level, 0, 1);
    this.sideCream.visible = this.sideCreamLevel > 0.03;
    this.sideCream.position.y = 0.08 + this.sideCreamLevel * 0.1;
    this.sideCream.scale.setScalar(0.7 + this.sideCreamLevel * 0.3);
    // リボンはクリームの上に浮かぶ
    this.sideRibbons.position.y = 0.1 + this.sideCreamLevel * 0.1;
  }

  /** モジュール i の開始状態へワールドを正規化する */
  checkpoint(i: number, craft: Craft) {
    const st = this.stage;
    const bagP = this.bag.params;
    // 既定値
    this.curds.visible = false;
    this.blob.visible = false;
    this.stretch.group.visible = false;
    this.bag.group.visible = false;
    this.strip.visible = false;
    this.guideLine.visible = false;
    st.props.paddle.visible = false;
    st.props.spoon.visible = false;
    st.props.knife.visible = false;
    st.hotStream.level = 0;
    st.creamStream.level = 0;
    st.props.pitcher.position.copy(POS.pitcherHome);
    st.props.kettle.rotation.z = 0;
    st.props.lever.rotation.x = 0;
    const hotSurf = st.props.mainBowl.getObjectByName('hotSurf')!;
    hotSurf.visible = i >= 2;
    this.bag.wobbleAnim = 0;
    this.bag.group.rotation.set(0, 0, 0);

    const stretchDone = craft.maxStretch > 0;
    const spreadR = 0.40;
    // 袋の共通形状
    const setBag = (
      pos: THREE.Vector3, o: Partial<typeof bagP>, fill: number,
    ) => {
      this.bag.group.visible = true;
      this.bag.group.position.copy(pos);
      Object.assign(bagP, o);
      this.bag.fill = fill;
      this.bag.dirty = true;
    };
    const fillAmt = clamp(0.35 + craft.fillScoops * 0.13 + craft.creamAmount * 0.2, 0, 1);

    if (i <= 1) {
      // 乾いたカード
      this.curds.visible = true;
      for (const c of this.curdStates) { c.pos.copy(c.home); c.gathered = 0; }
      this.updateCurds();
      (this.stage.mats.curd as THREE.MeshStandardMaterial).roughness = 0.85;
      hotSurf.visible = false;
    } else if (i === 2) {
      this.curds.visible = true;
      for (const c of this.curdStates) { c.pos.copy(c.home); c.gathered = 0; }
      this.updateCurds();
      (this.stage.mats.curd as THREE.MeshStandardMaterial).roughness = 0.4;
    } else if (i === 3) {
      this.blob.visible = true;
      this.blob.position.set(0, 0.28, 0);
      this.blob.scale.setScalar(1);
    } else if (i === 4) {
      setBag(POS.board.clone().setY(0.05), {
        R: 0.2, depth: 0, rimLift: 0, bulge: 0, neck: 0, knot: 0, open: 0, squish: 0,
        thickness: 0.3,
        wobble: bagP.wobble.map(() => 1),
      }, 0);
    } else if (i === 5) {
      setBag(POS.board.clone().setY(0.05), {
        R: spreadR, depth: 0, rimLift: 0, bulge: 0, neck: 0, knot: 0, open: 0, squish: 0,
        thickness: 0.09,
      }, 0);
    } else if (i === 6 || i === 7) {
      setBag(POS.board.clone().setY(0.05), {
        R: 0.34, depth: 0.9, rimLift: 0.75, bulge: 0, neck: 0, knot: 0, open: 0, squish: 0,
        thickness: 0.09,
      }, i === 7 ? 0 : 0);
      if (i === 7) {
        // side bowl は完成済み
        if (this.sideRibbons.children.length === 0) {
          for (let s = 0; s < 3; s++) this.addSideRibbon(s * 7 + 3);
        }
        this.setSideCream(0.8);
      } else {
        this.sideRibbons.clear();
        this.setSideCream(0);
      }
    } else if (i === 8) {
      setBag(POS.board.clone().setY(0.05), {
        R: 0.34, depth: 0.9, rimLift: 0.75, bulge: 0.4, neck: 0, knot: 0, open: 0, squish: 0,
        thickness: 0.09,
      }, fillAmt);
      this.ensureInnerRibbons();
    } else if (i === 9) {
      setBag(POS.board.clone().setY(0.05), {
        R: 0.34, depth: 0.9, rimLift: 0.75, bulge: 0.5, neck: 1, knot: 0, open: 0, squish: 0,
        thickness: 0.09,
      }, fillAmt);
      this.ensureInnerRibbons();
    } else if (i === 10) {
      setBag(POS.board.clone().setY(0.05), {
        R: 0.34, depth: 0.9, rimLift: 0.75, bulge: 0.5, neck: 1, knot: 1, open: 0, squish: 0,
        thickness: 0.09,
      }, fillAmt);
      this.ensureInnerRibbons();
    } else if (i === 11) {
      setBag(POS.coldBowl.clone().setY(0.14), {
        R: 0.34, depth: 0.9, rimLift: 0.75, bulge: 0.5, neck: 1, knot: 1, open: 0, squish: 0,
        thickness: 0.09,
      }, fillAmt);
      this.ensureInnerRibbons();
    } else if (i >= 12) {
      setBag(POS.plate.clone().setY(0.07), {
        R: 0.32, depth: 0.9, rimLift: 0.75, bulge: 0.5, neck: 1, knot: 1,
        open: i >= 13 ? 1 : 0, openDir: craft.openDir, squish: 0.12,
        thickness: 0.09,
      }, fillAmt);
      this.ensureInnerRibbons();
    }
    void stretchDone;
    this.bag.update(0, st.time);
  }

  private ensureInnerRibbons() {
    if (this.bag.innerRibbons.children.length === 0) {
      for (let s = 0; s < 3; s++) this.addInnerRibbon(s * 13 + 5);
    }
  }
}

export interface Ctx {
  stage: Stage;
  world: World;
  audio: AudioManager;
  input: InputManager;
  cam: CameraRig;
  ui: UI;
  save: SaveData;
  craft: Craft;
  /** モジュール完了(お祝い→次へ) */
  complete(focus?: THREE.Vector3, silent?: boolean): void;
  goto(i: number): void;
}

export interface Mod {
  name: string;
  enter(c: Ctx): void;
  exit?(c: Ctx): void;
  update(c: Ctx, dt: number): void;
  down?(c: Ctx, p: PointerState): void;
  move?(c: Ctx, p: PointerState): void;
  up?(c: Ctx, p: PointerState): void;
  hint?(c: Ctx): HintSpec | null;
}

export class Game {
  ctx: Ctx;
  modules: Mod[] = [];
  index = 0;
  private transitioning = false;
  hintMgr: HintManager;
  private clock = new THREE.Clock();

  constructor(
    public stage: Stage,
    public world: World,
    public audio: AudioManager,
    public input: InputManager,
    public cam: CameraRig,
    public ui: UI,
    public save: SaveData,
  ) {
    this.hintMgr = new HintManager(stage.camera);
    this.ctx = {
      stage, world, audio, input, cam, ui, save,
      craft: defaultCraft(),
      complete: (focus, silent) => this.completeModule(focus, silent),
      goto: (i) => this.goto(i),
    };
    input.handler = {
      onDown: p => { if (!this.transitioning) this.cur?.down?.(this.ctx, p); },
      onMove: p => { if (!this.transitioning) this.cur?.move?.(this.ctx, p); },
      onUp: p => { if (!this.transitioning) this.cur?.up?.(this.ctx, p); },
    };
    ui.onMuteToggle = () => {
      audio.setMuted(!audio.muted);
      ui.setMuted(audio.muted);
      save.muted = audio.muted; saveSave(save);
    };
    ui.onMotionToggle = () => {
      stage.reduceMotion = !stage.reduceMotion;
      ui.setMotion(stage.reduceMotion);
      save.reduceMotion = stage.reduceMotion; saveSave(save);
    };
    ui.onHome = () => {
      if (ui.replayShown) { ui.hideReplay(); return; }
      ui.hideIntro();
      ui.showReplay(c => {
        if (c === 'restart') this.goto(0);
        else if (c === 'stretch') this.goto(3);
        else this.goto(7);
      });
    };
    // デバッグ/テスト用フック
    (window as any).__game = {
      goto: (i: number) => this.goto(i),
      get index() { return (window as any).__gameRef.index; },
      get world() { return (window as any).__gameRef.world; },
    };
    (window as any).__gameRef = this;
  }

  get cur(): Mod | undefined { return this.modules[this.index]; }

  goto(i: number) {
    this.ui.hideReplay();
    this.ui.hideIntro();
    this.transitioning = false;
    const old = this.cur;
    old?.exit?.(this.ctx);
    this.audio.stopAllChannels();
    this.index = clamp(i, 0, this.modules.length - 1);
    this.stage.chef.setHands(null, null);
    this.stage.chef.look(null);
    this.world.checkpoint(this.index, this.ctx.craft);
    this.cur?.enter(this.ctx);
  }

  private completeModule(focus?: THREE.Vector3, silent = false) {
    if (this.transitioning) return;
    this.transitioning = true;
    if (!silent) {
      this.audio.chime();
      if (focus) this.stage.celebrate(focus);
    }
    setTimeout(() => {
      this.transitioning = false;
      if (this.index < this.modules.length - 1) this.goto(this.index + 1);
    }, silent ? 200 : 1100);
  }

  start() {
    this.goto(0);
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      if (!this.transitioning) this.cur?.update(this.ctx, dt);
      this.stage.update(dt);
      this.world.stretch.group.visible && this.world.stretch.update(dt);
      this.world.bag.group.visible && this.world.bag.update(dt, this.stage.time);
      this.cam.update(dt);
      const spec = this.transitioning ? null : (this.cur?.hint?.(this.ctx) ?? null);
      this.hintMgr.update(dt, spec, this.input);
      this.stage.render();
    };
    tick();
  }
}

/** 装飾適用 */
export function applyDecor(stage: Stage, save: SaveData) {
  stage.mats.apron.color.setHex(APRON_COLORS[save.apron % APRON_COLORS.length]);
  const rim = stage.props.mainBowl.getObjectByName('rim') as THREE.Mesh | null;
  if (rim) (rim.material as THREE.MeshStandardMaterial).color.setHex(BOWL_RIMS[save.bowlRim % BOWL_RIMS.length]);
  const style = PLATE_STYLES[save.plateStyle % PLATE_STYLES.length];
  const plate = stage.props.plate;
  plate.traverse(o => {
    if (o instanceof THREE.Mesh && o.parent?.name === 'deco') {
      (o.material as THREE.MeshStandardMaterial).color.setHex(style.accent);
    }
  });
  stage.mats.plate.color.setHex(style.base);
}

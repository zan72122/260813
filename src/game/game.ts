import { Camera } from '../engine/camera';
import { Input } from '../engine/input';
import { Audio } from '../engine/audio';
import { PhotoelasticRenderer } from '../render/photoelastic';
import { StressField, type Load } from '../sim/stress';
import {
  BENCH_RECT,
  BRIDGE_DECK_TOP,
  BRIDGE_LEFT,
  BRIDGE_RIGHT,
  GROUND_Y,
  MODEL_ORDER,
  archFeet,
  buildSpecimen,
  defaultParams,
  type ModelId,
  type ModelParams,
  type Specimen,
} from '../sim/models';
import {
  drawAnchorHandle,
  drawBackground,
  drawBear,
  drawBench,
  drawGoalFlag,
  drawHandHint,
  drawPolariscopeFrame,
  drawProps,
  drawStar,
  drawTargetRing,
  drawTouchRipple,
  drawWeight,
} from '../render/scene';
import { Hud } from '../ui/hud';
import { CHALLENGES } from './challenges';
import { clamp, expandRect, makeRng, pointInPoly, type Vec } from '../engine/util';

export type Mode = 'title' | 'lab' | 'challengeMenu' | 'challenge';
type CamPhase = 'wide' | 'closeup' | 'result';

/** 指で押しつづけたときの力の上限（＝フリンジ次数のだいたいの最大） */
const FORCE_MAX = 5.4;
/** 力のたまる速さ／ぬける速さ */
const FORCE_RAMP = 4.2;
const FORCE_DECAY = 7.0;
/** おもり1つぶんの力 */
const WEIGHT_FORCE = 2.4;
const MAX_WEIGHTS = 4;
/** くまさんの重さ */
const BEAR_FORCE = 1.1;
const BEAR_START = BRIDGE_LEFT + 60;
const BEAR_GOAL = BRIDGE_RIGHT - 60;
const BEAR_SPEED = 132;
/** アーチの足もとが光る条件 */
const REACH_ORDER = 1.3;

interface WeightObj {
  x: number;
  y: number;
  restY: number;
  vy: number;
  landed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  spin: number;
}

export interface GameOptions {
  /** 軽量モード（CI・低スペック端末） */
  fast: boolean;
  seed: number;
}

export class Game {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  readonly cam = new Camera();
  readonly input: Input;
  readonly audio = new Audio();
  private hud: Hud;
  private photo = new PhotoelasticRenderer();
  readonly field = new StressField();
  private rng: () => number;
  private opts: GameOptions;

  mode: Mode = 'title';
  modelId: ModelId = 'flower';
  params: ModelParams = defaultParams();
  specimen: Specimen;

  /** 指（またはデモ）の押し */
  press = { active: false, x: 0, y: 0, force: 0, valid: false };
  private lastChime = 0;
  private idle = 0;

  weights: WeightObj[] = [];
  private dragAnchor: number | null = null;
  private particles: Particle[] = [];

  private camPhase: CamPhase = 'wide';
  private camTimer = 0;

  challengeIndex = 0;
  cleared = [false, false, false];
  progress = 0;
  done = false;
  private doneTimer = 0;
  /** チャレンジごとの状態 */
  private bear = { x: BEAR_START, phase: 0 };
  private fills = [0, 0];
  private bloom = 0;

  private demoT = 0;
  private raf = 0;
  private lastTs = 0;
  /** テストから覗くための計測値 */
  frames = 0;

  constructor(canvas: HTMLCanvasElement, hudRoot: HTMLElement, opts: GameOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.rng = makeRng(opts.seed);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;

    this.params.bloom = 0.5;
    this.specimen = buildSpecimen(this.modelId, this.params);

    this.input = new Input(canvas, this.cam);
    this.input.onDown = (t) => this.onDown(t.x, t.y);
    this.input.onMove = (t) => this.onMove(t.x, t.y);
    this.input.onUp = () => this.onUp();

    this.hud = new Hud(hudRoot, {
      onEnterLab: () => this.enterLab(),
      onEnterChallengeMenu: () => this.enterChallengeMenu(),
      onSelectModel: (id) => this.selectModel(id),
      onSelectChallenge: (i) => this.startChallenge(i),
      onBack: () => this.back(),
      onAddWeight: () => this.addWeight(),
      onReset: () => this.resetLab(),
      onRetry: () => this.startChallenge(this.challengeIndex),
      onNext: () => this.startChallenge((this.challengeIndex + 1) % CHALLENGES.length),
      onToggleSound: () => {
        this.audio.setEnabled(!this.audio.enabled);
        this.hud.setSound(this.audio.enabled);
      },
    });

    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);

    this.enterTitle();
  }

  /* ------------------------------------------------------------ 画面 */

  resize = (): void => {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.opts.fast ? 1 : 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cam.setViewport(w, h);
    this.refocus(true);
  };

  /* ------------------------------------------------------- モード遷移 */

  private enterTitle(): void {
    this.mode = 'title';
    this.modelId = 'flower';
    this.params = defaultParams();
    this.params.bloom = 0.55;
    this.rebuild();
    this.weights = [];
    this.press = { active: false, x: 0, y: 0, force: 0, valid: false };
    this.demoT = 0;
    this.hud.hideSuccess();
    this.hud.show({ kind: 'title' });
    this.setCamPhase('closeup', true);
  }

  enterLab(): void {
    this.audio.unlock();
    this.mode = 'lab';
    this.done = false;
    this.weights = [];
    this.params = defaultParams();
    this.params.bloom = 0.45;
    this.rebuild();
    this.hud.hideSuccess();
    this.hud.show({ kind: 'lab', model: this.modelId });
    this.intro();
  }

  enterChallengeMenu(): void {
    this.audio.unlock();
    this.mode = 'challengeMenu';
    this.done = false;
    this.weights = [];
    this.hud.hideSuccess();
    this.hud.show({ kind: 'challengeMenu', cleared: this.cleared.slice() });
    this.setCamPhase('wide', false);
  }

  selectModel(id: ModelId): void {
    if (this.modelId === id && this.mode === 'lab') return;
    this.modelId = id;
    this.weights = [];
    this.params = defaultParams();
    this.params.bloom = 0.45;
    this.press.force = 0;
    this.rebuild();
    this.hud.show({ kind: 'lab', model: this.modelId });
    this.intro();
  }

  startChallenge(index: number): void {
    this.audio.unlock();
    this.challengeIndex = index;
    const def = CHALLENGES[index];
    this.mode = 'challenge';
    this.modelId = def.model;
    this.params = defaultParams();
    this.params.bloom = 0;
    this.weights = [];
    this.press.force = 0;
    this.done = false;
    this.doneTimer = 0;
    this.progress = 0;
    this.bear = { x: BEAR_START, phase: 0 };
    this.fills = [0, 0];
    this.bloom = 0;
    this.particles = [];
    this.rebuild();
    this.hud.hideSuccess();
    this.hud.show({ kind: 'challenge', index });
    this.intro();
  }

  back(): void {
    if (this.mode === 'challenge') this.enterChallengeMenu();
    else this.enterTitle();
  }

  /** 実験台の全景 → 模型の接写、という決まった見せ方。 */
  private intro(): void {
    this.setCamPhase('wide', true);
  }

  private setCamPhase(p: CamPhase, instant: boolean): void {
    this.camPhase = p;
    this.camTimer = 0;
    this.refocus(instant);
  }

  private refocus(instant = false): void {
    if (this.camPhase === 'wide') {
      this.cam.focusRect(BENCH_RECT, { fill: 0.92, instant });
    } else if (this.camPhase === 'closeup') {
      this.cam.focusRect(this.specimen.focus, {
        fill: 0.94,
        instant,
        core: this.specimen.core,
      });
    } else {
      this.cam.focusRect(expandRect(this.specimen.focus, 40), {
        fill: 0.9,
        instant,
        core: expandRect(this.specimen.core, 40),
      });
    }
  }

  private rebuild(): void {
    this.specimen = buildSpecimen(this.modelId, this.params);
  }

  /* --------------------------------------------------------- 入力処理 */

  private onDown(x: number, y: number): void {
    this.audio.unlock();
    this.idle = 0;
    if (this.mode === 'challengeMenu') return;
    if (this.done) return;
    // タイトルでも模型はさわれる。はじめての一回を待たせない
    if (this.mode === 'title') {
      this.applyPress(x, y);
      if (this.press.valid) {
        this.press.force = 0;
        this.audio.touch();
      }
      return;
    }

    if (this.mode === 'lab' && this.specimen.anchorsMovable) {
      for (let i = 0; i < this.specimen.anchors.length; i++) {
        const a = this.specimen.anchors[i];
        const hy = (a.y + GROUND_Y) / 2;
        if (Math.hypot(x - a.x, y - hy) < 78) {
          this.dragAnchor = i;
          return;
        }
      }
    }
    this.applyPress(x, y);
    if (this.press.valid) this.audio.touch();
  }

  private onMove(x: number, y: number): void {
    this.idle = 0;
    if (this.dragAnchor !== null) {
      this.moveAnchor(this.dragAnchor, x);
      return;
    }
    if (this.press.active) this.applyPress(x, y);
  }

  private onUp(): void {
    this.dragAnchor = null;
    this.press.active = false;
    if (this.mode === 'title') this.demoT = 0; // デモを頭から流しなおす
  }

  /** 指の位置を模型の上へ寄せる（すこしずれても必ず虹が出る）。 */
  private applyPress(x: number, y: number): void {
    const p = this.snapToSpecimen(x, y);
    if (!p) {
      this.press.active = true;
      this.press.valid = false;
      return;
    }
    this.press.active = true;
    this.press.valid = true;
    this.press.x = p.x;
    this.press.y = p.y;
  }

  private snapToSpecimen(x: number, y: number): Vec | null {
    for (const poly of this.specimen.polys) {
      if (pointInPoly(x, y, poly)) return { x, y };
    }
    let best: Vec | null = null;
    let bestD = Infinity;
    for (const poly of this.specimen.polys) {
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j];
        const b = poly[i];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len2 = vx * vx + vy * vy;
        let t = len2 > 1e-9 ? ((x - a.x) * vx + (y - a.y) * vy) / len2 : 0;
        t = clamp(t, 0, 1);
        const px = a.x + vx * t;
        const py = a.y + vy * t;
        const d = (px - x) * (px - x) + (py - y) * (py - y);
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    // 模型から遠すぎるタッチは無視（背景を触っただけ）
    return bestD < 300 * 300 ? best : null;
  }

  private moveAnchor(i: number, x: number): void {
    const other = this.specimen.anchors[1 - i];
    const min = i === 0 ? BRIDGE_LEFT + 40 : other.x + 200;
    const max = i === 0 ? other.x - 200 : BRIDGE_RIGHT - 40;
    const nx = clamp(x, Math.min(min, max), Math.max(min, max));
    if (i === 0) this.params.pierL = nx;
    else this.params.pierR = nx;
    this.rebuild();
  }

  addWeight(): void {
    this.audio.unlock();
    if (this.mode !== 'lab' || this.weights.length >= MAX_WEIGHTS) return;
    const bb = this.specimen.bbox;
    const x = this.press.valid
      ? this.press.x
      : bb.x + bb.w * (0.32 + this.rng() * 0.36);
    const surface = this.surfaceYAt(x) ?? bb.y;
    this.weights.push({ x, y: surface - 420, restY: surface, vy: 0, landed: false });
  }

  private surfaceYAt(x: number): number | null {
    const bb = this.specimen.bbox;
    for (let y = bb.y; y <= bb.y + bb.h; y += 3) {
      for (const poly of this.specimen.polys) {
        if (pointInPoly(x, y, poly)) return y;
      }
    }
    return null;
  }

  resetLab(): void {
    this.weights = [];
    this.params = defaultParams();
    this.params.bloom = 0.45;
    this.press.force = 0;
    this.rebuild();
    this.intro();
  }

  /* ------------------------------------------------------------ 更新 */

  update(dt: number): void {
    this.frames++;
    const t = Math.min(dt, 0.05);
    this.idle += t;

    // 力のたまり方（押しつづけると縞がふえる）
    const pressing = this.press.active && this.press.valid && !this.done;
    if (this.mode === 'title' && !this.press.active) {
      this.updateDemo(t); // だれも触っていないときだけ自動デモ
    } else if (pressing) {
      this.press.force = Math.min(FORCE_MAX, this.press.force + FORCE_RAMP * t);
    } else if (this.done) {
      // 「できた！」のあいだは虹をそのまま見せておく（結果確認の画）
      this.press.force = Math.max(3.2, this.press.force - FORCE_DECAY * 0.25 * t);
    } else {
      this.press.force = Math.max(0, this.press.force - FORCE_DECAY * t);
    }

    this.updateWeights(t);
    this.buildField();
    if (this.mode === 'challenge') this.updateChallenge(t);
    if (this.mode === 'lab' && this.modelId === 'flower') {
      // ラボでもおはなは押すとすこしひらく
      const target = 0.45 + Math.min(0.5, this.press.force * 0.1);
      this.params.bloom += (target - this.params.bloom) * Math.min(1, t * 5);
      this.rebuild();
    }

    this.updateCamera(t);
    this.updateParticles(t);
    this.updateChime();
  }

  private updateDemo(t: number): void {
    this.demoT += t;
    const cycle = this.demoT % 3.6;
    const f =
      cycle < 1.9
        ? Math.min(FORCE_MAX, (cycle / 1.9) * FORCE_MAX)
        : Math.max(0, FORCE_MAX * (1 - (cycle - 1.9) / 0.55));
    this.press.force = f;
    this.press.valid = true;
    this.press.x = this.specimen.hint.x;
    this.press.y = this.specimen.hint.y + 26;
  }

  private updateWeights(t: number): void {
    for (const w of this.weights) {
      if (w.landed) continue;
      w.vy += 1600 * t;
      w.y += w.vy * t;
      if (w.y >= w.restY) {
        w.y = w.restY;
        w.landed = true;
        this.audio.thud();
        this.burst(w.x, w.restY, 6);
      }
    }
  }

  private buildField(): void {
    const loads: Load[] = [];
    if (this.press.force > 0.01 && this.press.valid) {
      loads.push({ x: this.press.x, y: this.press.y, f: this.press.force });
    }
    for (const w of this.weights) {
      if (w.landed) loads.push({ x: w.x, y: w.restY + 14, f: WEIGHT_FORCE });
    }
    if (this.mode === 'challenge' && CHALLENGES[this.challengeIndex].key === 'bear') {
      loads.push({ x: this.bear.x, y: this.deckYAt(this.bear.x) + 16, f: BEAR_FORCE });
    }
    this.field.update(loads, this.specimen.anchors, this.specimen.beam ?? null);
  }

  private deckYAt(x: number): number {
    const t = clamp((x - BRIDGE_LEFT) / (BRIDGE_RIGHT - BRIDGE_LEFT), 0, 1);
    return BRIDGE_DECK_TOP - Math.sin(t * Math.PI) * 10;
  }

  private updateChallenge(t: number): void {
    const def = CHALLENGES[this.challengeIndex];
    if (this.done) {
      this.doneTimer += t;
      if (this.doneTimer > 1.3 && !this.hud.successVisible) {
        this.hud.showSuccess(true);
      }
      return;
    }

    if (def.key === 'bear') {
      const supported = this.press.force > 0.7 && this.press.valid && this.press.active;
      if (supported) {
        this.bear.x = Math.min(BEAR_GOAL, this.bear.x + BEAR_SPEED * t);
        this.bear.phase += t;
      }
      this.progress = (this.bear.x - BEAR_START) / (BEAR_GOAL - BEAR_START);
      if (this.bear.x >= BEAR_GOAL) this.succeed();
    } else if (def.key === 'reach') {
      const feet = archFeet();
      for (let i = 0; i < 2; i++) {
        const n = this.field.sample(feet[i].x, feet[i].y);
        this.fills[i] = clamp(
          this.fills[i] + (n > REACH_ORDER ? t / 0.8 : -t / 1.8),
          0,
          1,
        );
        if (this.fills[i] >= 1 && n > REACH_ORDER && this.rng() < 0.25) {
          this.burst(feet[i].x, feet[i].y, 1);
        }
      }
      this.progress = (this.fills[0] + this.fills[1]) / 2;
      if (this.fills[0] >= 1 && this.fills[1] >= 1) this.succeed();
    } else {
      if (this.press.force > 0.6) {
        this.bloom = Math.min(1, this.bloom + t * (this.press.force / FORCE_MAX) * 0.62);
      }
      this.params.bloom = this.bloom;
      this.rebuild();
      this.progress = this.bloom;
      if (this.bloom >= 1) this.succeed();
    }

    this.hud.setProgress(this.progress);
  }

  private succeed(): void {
    if (this.done) return;
    this.done = true;
    this.doneTimer = 0;
    this.progress = 1;
    this.hud.setProgress(1);
    this.cleared[this.challengeIndex] = true;
    this.audio.success();
    const bb = this.specimen.bbox;
    this.burst(bb.x + bb.w / 2, bb.y + bb.h / 2, 34);
    this.setCamPhase('result', false);
  }

  private updateCamera(t: number): void {
    this.camTimer += t;
    if (this.camPhase === 'wide' && this.camTimer > 1.0 && this.mode !== 'challengeMenu') {
      this.setCamPhase('closeup', false);
    }
    this.cam.update(t);
  }

  private updateChime(): void {
    const order = Math.floor(this.press.force);
    if (order > this.lastChime && this.mode !== 'title') this.audio.fringe(order);
    this.lastChime = order;
  }

  private burst(x: number, y: number, n: number): void {
    const colors = ['#ffd24a', '#ff6f8b', '#5ce1c0', '#6aa8ff', '#c08bff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2;
      const sp = 90 + this.rng() * 300;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0,
        max: 0.8 + this.rng() * 0.7,
        size: 7 + this.rng() * 13,
        color: colors[(this.rng() * colors.length) | 0],
        rot: this.rng() * Math.PI,
        spin: (this.rng() - 0.5) * 6,
      });
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  private updateParticles(t: number): void {
    for (const p of this.particles) {
      p.life += t;
      p.vy += 420 * t;
      p.x += p.vx * t;
      p.y += p.vy * t;
      p.rot += p.spin * t;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
  }

  /* ------------------------------------------------------------ 描画 */

  draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04050c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.cam.applyTo(ctx, this.dpr);

    drawBackground(ctx, this.cam);
    drawPolariscopeFrame(ctx, this.cam.zoom);
    drawBench(ctx);
    drawProps(ctx, this.specimen);

    this.photo.render(ctx, this.cam, this.specimen, this.field, {
      pixelSize: this.opts.fast ? 8 : 4,
      maxCells: this.opts.fast ? 6000 : 26000,
    });

    const t = performance.now() / 1000;

    if (this.mode === 'challenge') {
      const def = CHALLENGES[this.challengeIndex];
      if (def.key === 'reach') {
        const feet = archFeet();
        for (let i = 0; i < 2; i++) drawTargetRing(ctx, feet[i].x, feet[i].y, this.fills[i], t);
      }
      if (def.key === 'bear') {
        drawGoalFlag(ctx, BEAR_GOAL + 26, this.deckYAt(BEAR_GOAL + 26), t, this.done);
        drawBear(
          ctx,
          this.bear.x,
          this.deckYAt(this.bear.x),
          this.bear.phase,
          this.press.force > 0.7 && this.press.active,
          this.done ? 1 : 0,
        );
      }
    }

    for (const w of this.weights) drawWeight(ctx, w.x, w.y);

    if (this.mode === 'lab' && this.specimen.anchorsMovable) {
      for (let i = 0; i < this.specimen.anchors.length; i++) {
        const a = this.specimen.anchors[i];
        drawAnchorHandle(ctx, a.x, (a.y + GROUND_Y) / 2, t, this.dragAnchor === i);
      }
    }

    if (this.press.force > 0.02 && this.press.valid) {
      drawTouchRipple(ctx, this.press.x, this.press.y, this.press.force, t);
    }

    // 「ここを押してね」の指
    const showHint =
      !this.done &&
      ((this.mode === 'title' && !this.press.active) ||
        ((this.mode === 'lab' || this.mode === 'challenge') &&
          this.idle > 2.2 &&
          this.press.force < 0.2));
    if (showHint) {
      const h = this.mode === 'title' ? { x: this.press.x, y: this.press.y } : this.specimen.hint;
      drawHandHint(ctx, h.x, h.y, t);
    }

    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, k);
      drawStar(ctx, p.x, p.y, p.size, p.color, p.rot);
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ ループ */

  start(): void {
    this.lastTs = performance.now();
    const loop = (ts: number): void => {
      const dt = Math.min(0.05, Math.max(0, (ts - this.lastTs) / 1000));
      this.lastTs = ts;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  /* ------------------------------------- テスト用の決定論的な操作 API */

  /** 論理時間を直接すすめる（描画つき）。 */
  step(dt: number, times = 1): void {
    for (let i = 0; i < times; i++) {
      this.update(dt);
      this.draw();
    }
  }

  pressAt(x: number, y: number): void {
    this.input.synthDown(x, y);
  }

  movePress(x: number, y: number): void {
    this.input.synthMove(x, y);
  }

  release(): void {
    this.input.synthUp();
  }

  /** その場所のフリンジ次数（テストで「虹が出たか」を判定する）。 */
  orderAt(x: number, y: number): number {
    return this.field.sample(x, y);
  }

  snapshot(): Record<string, unknown> {
    return {
      mode: this.mode,
      model: this.modelId,
      force: Number(this.press.force.toFixed(3)),
      progress: Number(this.progress.toFixed(3)),
      done: this.done,
      cleared: this.cleared.slice(),
      weights: this.weights.length,
      maxOrder: Number(this.photo.lastMaxOrder.toFixed(3)),
      cells: this.photo.lastCells,
      zoom: Number(this.cam.zoom.toFixed(4)),
      camPhase: this.camPhase,
      hint: this.specimen.hint,
      models: MODEL_ORDER,
    };
  }
}

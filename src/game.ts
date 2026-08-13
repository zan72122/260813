/**
 * ゲーム本体。画面のながれ・入力・アニメーションをまとめて持つ。
 *
 *  タイトル → いしをえらぶ → 顕微鏡の外観 →（自動カメラ）→ 接眼レンズの中
 *
 * あそび: 「にじスイッチ」を おす → ステージを くるくる まわす → ひかる つぶを タッチ
 * まちがえても なにも おきない（失敗なし）。
 */

import { sound } from './audio';
import { colorDistance, rgbToCss, type RGB } from './core/colors';
import { pointInPolygon } from './core/mosaic';
import { Rng } from './core/rng';
import {
  SLIDES,
  buildThinSection,
  grainIntensity,
  isSparkling,
  type Grain,
  type SlideDef,
  type ThinSection,
} from './core/slides';
import { applyLayoutVars, computeLayout, type Layout } from './layout';
import { drawField, fieldToScreen, screenToField, type FieldView } from './render/field';
import { Particles } from './render/effects';
import {
  EYEPIECE,
  applyCamera,
  drawBackdrop,
  drawMicroscope,
  eyepieceCamera,
  fitCamera,
  lerpCamera,
  worldToScreen,
  type Camera,
} from './render/microscope';
import {
  buildCards,
  hideCoach,
  loadCleared,
  queryDom,
  renderStars,
  saveCleared,
  setMode,
  setScreen,
  showCoach,
  type Dom,
  type Mode,
} from './ui';

type Phase = 'title' | 'select' | 'enter' | 'observe' | 'leave' | 'clear';

interface QuestTarget {
  grain: Grain;
  color: RGB;
  done: boolean;
}

interface Timer {
  left: number;
  fn: () => void;
}

/** プレパラートを置く → ちょっと待つ → レンズへ寄る */
const T_DROP = 0.85;
const T_HOLD = 0.4;
const T_ZOOM = 1.4;
const T_ENTER = T_DROP + T_HOLD + T_ZOOM;
const T_LEAVE = 0.5;

const QUEST_TARGETS = 3;
/** これくらい色が近ければ「おなじ いろ」とみなす（4歳むけに やさしめ） */
const COLOR_TOLERANCE = 0.19;
/** これくらい明るく光っていれば正解にする */
const BRIGHT_ENOUGH = 0.42;

const AUTO_SPIN_SPEED = 0.8;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export class Game {
  private dom: Dom;
  private ctx: CanvasRenderingContext2D;
  private layout: Layout;
  private particles = new Particles();
  private timers: Timer[] = [];

  private phase: Phase = 'title';
  private mode: Mode = 'free';
  private slideDef: SlideDef = SLIDES[0];
  private section: ThinSection | null = null;
  private cleared: Set<string>;

  private time = 0;
  private phaseTime = 0;

  private stageAngle = 0;
  private angVel = 0;
  private autoSpin = false;
  private polarOn = false;
  private polarT = 0;

  private quest: QuestTarget[] = [];
  private questIndex = 0;
  private sparkles = 0;

  /** あそびかたヒント用 */
  private polarUsed = false;
  private rotatedTotal = 0;
  private sinceFind = 0;
  private hintT = 0;

  /** 入力 */
  private dragging = false;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastAngle = 0;
  private moved = 0;
  private downAt = 0;
  private downX = 0;
  private downY = 0;

  readonly reduced: boolean;

  constructor(reduced: boolean) {
    this.reduced = reduced;
    this.dom = queryDom();
    const ctx = this.dom.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('canvas 2d context not available');
    this.ctx = ctx;
    this.particles.reduced = reduced;
    this.cleared = loadCleared();
    this.layout = computeLayout(reduced ? 1 : 2);

    setMode(this.dom, this.mode);
    this.bindUi();
    this.bindCanvas();
    this.resize();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => {
      // iOS は回転直後だとサイズが古いことがある
      setTimeout(() => this.resize(), 60);
      setTimeout(() => this.resize(), 320);
    });
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  // ---------------------------------------------------------------- 画面

  private bindUi(): void {
    const d = this.dom;
    d.btnFree.addEventListener('click', () => this.goSelect('free'));
    d.btnQuest.addEventListener('click', () => this.goSelect('quest'));
    d.btnSelectBack.addEventListener('click', () => this.goTitle());
    d.btnHome.addEventListener('click', () => this.leaveObserve());
    d.btnNextSlide.addEventListener('click', () => this.leaveObserve());
    d.btnAgain.addEventListener('click', () => this.startSlide(this.slideDef));
    d.btnOther.addEventListener('click', () => this.goSelect(this.mode));
    d.btnPolar.addEventListener('click', () => this.togglePolar());
    d.btnSpin.addEventListener('click', () => this.toggleSpin());
    d.btnSound.addEventListener('click', () => {
      const on = !sound.enabled;
      sound.setEnabled(on);
      d.btnSound.textContent = on ? '🔊' : '🔈';
      d.btnSound.classList.toggle('off', !on);
      if (on) sound.play('tap');
    });
    // 最初のタッチで音を使えるようにする（iOS）
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
  }

  private goTitle(): void {
    this.setPhase('title');
    setScreen(this.dom, 'title');
    sound.play('tap');
  }

  private goSelect(mode: Mode): void {
    this.mode = mode;
    setMode(this.dom, mode);
    this.dom.selectTitle.textContent =
      mode === 'quest' ? 'どの いし で さがす？' : 'どの いし を みる？';
    buildCards(this.dom, SLIDES, this.cleared, (def) => this.startSlide(def));
    this.setPhase('select');
    setScreen(this.dom, 'select');
    sound.play('tap');
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  /** プレパラートを置いて、顕微鏡をのぞきに行く */
  private startSlide(def: SlideDef): void {
    this.slideDef = def;
    this.section = buildThinSection(def);
    this.stageAngle = 0;
    this.angVel = 0;
    this.autoSpin = false;
    this.polarOn = false;
    this.polarT = 0;
    this.polarUsed = false;
    this.rotatedTotal = 0;
    this.sinceFind = 0;
    this.hintT = 0;
    this.sparkles = 0;
    this.questIndex = 0;
    this.timers.length = 0;
    this.particles.clear();
    this.updateSpinButton();
    this.updatePolarButton();
    this.dom.freeCount.textContent = '0';

    if (this.mode === 'quest') {
      this.quest = this.pickTargets(this.section);
      this.refreshQuestUi();
    } else {
      this.quest = [];
    }

    hideCoach(this.dom);
    setScreen(this.dom, 'observe');
    this.setPhase('enter');
    sound.play('tap');
  }

  private leaveObserve(): void {
    if (this.phase !== 'observe') return;
    this.setPhase('leave');
    hideCoach(this.dom);
    sound.play('tap');
  }

  // ---------------------------------------------------------------- さがしもの

  private pickTargets(section: ThinSection): QuestTarget[] {
    const rng = new Rng(section.def.seed ^ 0x9e37);
    const cands = section.grains.filter(
      (g) => !g.isotropic && g.retardation >= 340 && g.r > 0.04,
    );
    if (cands.length === 0) return [];

    // 大きい粒のほうが タッチしやすい
    const pool = [...cands].sort((a, b) => b.r - a.r).slice(0, Math.max(8, cands.length >> 1));
    // 決定論的にシャッフル
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(0, i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const chosen: Grain[] = [];
    for (let minDist = 0.24; minDist >= 0 && chosen.length < QUEST_TARGETS; minDist -= 0.08) {
      for (const g of pool) {
        if (chosen.length >= QUEST_TARGETS) break;
        if (chosen.includes(g)) continue;
        if (chosen.every((c) => colorDistance(c.xpl, g.xpl) >= minDist)) chosen.push(g);
      }
    }
    return chosen.map((g) => ({ grain: g, color: g.xpl, done: false }));
  }

  private refreshQuestUi(): void {
    if (this.mode !== 'quest') return;
    const t = this.quest[this.questIndex];
    this.dom.questSwatch.style.background = t ? rgbToCss(t.color) : 'transparent';
    renderStars(this.dom.questStars, this.quest.length, this.questIndex);
  }

  private currentTarget(): QuestTarget | null {
    return this.quest[this.questIndex] ?? null;
  }

  // ---------------------------------------------------------------- 入力

  private bindCanvas(): void {
    const c = this.dom.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => this.endDrag());
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // ダブルタップでの拡大や、うっかりスクロールを止める
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  private localPoint(e: PointerEvent): { x: number; y: number } {
    const r = this.dom.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown(e: PointerEvent): void {
    sound.unlock();
    if (this.phase === 'enter') {
      // 見あきたら タッチで とばせる
      this.phaseTime = T_ENTER;
      return;
    }
    if (this.phase !== 'observe') return;
    const p = this.localPoint(e);
    this.dragging = true;
    this.pointerId = e.pointerId;
    this.lastX = p.x;
    this.lastY = p.y;
    this.downX = p.x;
    this.downY = p.y;
    this.downAt = this.time;
    this.moved = 0;
    this.lastAngle = Math.atan2(p.y - this.layout.fieldCy, p.x - this.layout.fieldCx);
    this.angVel = 0;
    this.dom.canvas.setPointerCapture?.(e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const p = this.localPoint(e);
    const dx = p.x - this.lastX;
    const dy = p.y - this.lastY;
    this.moved += Math.hypot(dx, dy);

    const cx = this.layout.fieldCx;
    const cy = this.layout.fieldCy;
    const dist = Math.hypot(p.x - cx, p.y - cy);
    const angle = Math.atan2(p.y - cy, p.x - cx);

    let delta: number;
    if (dist > this.layout.fieldR * 0.3) {
      // まわりを なぞる → その角度ぶん回す
      delta = wrapPi(angle - this.lastAngle);
    } else {
      // まんなかは 横スワイプでも回せる（小さい指むけ）
      delta = (dx / Math.max(60, this.layout.fieldR)) * 1.6;
    }
    delta = Math.max(-0.6, Math.min(0.6, delta));

    this.stageAngle += delta;
    this.rotatedTotal += Math.abs(delta);
    this.angVel = this.angVel * 0.55 + delta * 45 * 0.45;
    this.lastAngle = angle;
    this.lastX = p.x;
    this.lastY = p.y;

    if (this.moved > 24 && this.autoSpin) {
      this.autoSpin = false;
      this.updateSpinButton();
    }
  }

  private onUp(e: PointerEvent): void {
    if (!this.dragging || e.pointerId !== this.pointerId) return;
    const p = this.localPoint(e);
    const dt = this.time - this.downAt;
    const dist = Math.hypot(p.x - this.downX, p.y - this.downY);
    this.endDrag();
    if (dist < 16 && dt < 0.45) {
      this.angVel = 0;
      this.tapAt(p.x, p.y);
    } else {
      this.angVel = Math.max(-7, Math.min(7, this.angVel));
    }
  }

  private endDrag(): void {
    this.dragging = false;
    this.pointerId = null;
  }

  private view(): FieldView {
    return { cx: this.layout.fieldCx, cy: this.layout.fieldCy, r: this.layout.fieldR };
  }

  private grainAt(x: number, y: number): Grain | null {
    const section = this.section;
    if (!section) return null;
    const p = screenToField(this.view(), this.stageAngle, x, y);
    if (Math.hypot(p.x, p.y) > 1.02) return null;
    // あとから描いた粒（大きい丸）を優先
    for (let i = section.grains.length - 1; i >= 0; i--) {
      if (pointInPolygon(section.grains[i].poly, p.x, p.y)) return section.grains[i];
    }
    return null;
  }

  private tapAt(x: number, y: number): void {
    if (this.phase !== 'observe' || !this.section) return;
    const g = this.grainAt(x, y);
    if (!g) return;

    if (!this.polarOn) {
      // まだ ふつうの光。スイッチに気づいてもらう。
      sound.play('soft');
      showCoach(this.dom, '👉', 'にじスイッチを おしてね', 'switch');
      this.dom.btnPolar.classList.add('attention');
      return;
    }

    this.tapGrain(g, x, y);
  }

  /** 粒をタッチしたときの処理（テストからも呼べるように分けてある） */
  tapGrain(g: Grain, x: number, y: number): void {
    const bright = grainIntensity(g, this.stageAngle);

    if (this.mode === 'quest') {
      const t = this.currentTarget();
      if (t && !g.isotropic && bright > BRIGHT_ENOUGH) {
        const near = colorDistance(g.xpl, t.color);
        if (near < COLOR_TOLERANCE) {
          this.questFound(t, x, y);
          return;
        }
      }
      this.gentleTap(g, x, y);
      return;
    }

    // じゆうモード: ひかっている粒を見つけたら きらきら
    if (isSparkling(g, this.stageAngle)) {
      this.sparkles++;
      this.dom.freeCount.textContent = String(this.sparkles);
      this.particles.burst(x, y, g.xpl, 18);
      sound.play('star');
      this.sinceFind = 0;
      hideCoach(this.dom);
      return;
    }
    this.gentleTap(g, x, y);
  }

  /** はずれても なにも おこらない。小さく光るだけ。 */
  private gentleTap(g: Grain, x: number, y: number): void {
    this.particles.burst(x, y, g.xpl, 6);
    sound.play('soft');
  }

  private questFound(t: QuestTarget, x: number, y: number): void {
    t.done = true;
    this.questIndex++;
    this.sinceFind = 0;
    this.hintT = 0;
    this.particles.burst(x, y, t.color, 26);
    sound.play('star');
    hideCoach(this.dom);
    renderStars(this.dom.questStars, this.quest.length, this.questIndex);

    if (this.questIndex >= this.quest.length) {
      this.after(0.75, () => this.finishQuest());
    } else {
      this.after(0.55, () => {
        this.refreshQuestUi();
        showCoach(this.dom, '🎨', 'つぎの いろ！', 'field');
        this.after(2.2, () => hideCoach(this.dom));
      });
    }
  }

  private finishQuest(): void {
    this.cleared.add(this.slideDef.id);
    saveCleared(this.cleared);
    this.dom.clearSub.textContent = `${this.slideDef.name} を ぜんぶ みつけたよ`;
    setScreen(this.dom, 'clear');
    this.setPhase('clear');
    this.particles.clear();
    this.particles.confetti(this.layout.w, this.layout.h, 80);
    sound.play('clear');
  }

  private after(sec: number, fn: () => void): void {
    this.timers.push({ left: sec, fn });
  }

  // ---------------------------------------------------------------- ボタン

  private togglePolar(): void {
    this.polarOn = !this.polarOn;
    this.polarUsed = true;
    this.updatePolarButton();
    this.dom.btnPolar.classList.remove('attention');
    hideCoach(this.dom);
    sound.play(this.polarOn ? 'rainbowOn' : 'rainbowOff');
  }

  private updatePolarButton(): void {
    this.dom.btnPolar.classList.toggle('on', this.polarOn);
    this.dom.polarText.innerHTML = this.polarOn ? 'にじいろ<br>オン' : 'にじ<br>スイッチ';
  }

  private toggleSpin(): void {
    this.autoSpin = !this.autoSpin;
    this.updateSpinButton();
    sound.play('tap');
    if (this.autoSpin) hideCoach(this.dom);
  }

  private updateSpinButton(): void {
    this.dom.btnSpin.classList.toggle('on', this.autoSpin);
  }

  // ---------------------------------------------------------------- ループ

  resize(): void {
    this.layout = computeLayout(this.reduced ? 1 : 2);
    applyLayoutVars(this.layout);
    const c = this.dom.canvas;
    const { w, h, dpr } = this.layout;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;

    // タイマー
    if (this.timers.length) {
      const keep: Timer[] = [];
      for (const t of this.timers) {
        t.left -= dt;
        if (t.left <= 0) t.fn();
        else keep.push(t);
      }
      this.timers = keep;
    }

    // 偏光のスイープ
    const target = this.polarOn ? 1 : 0;
    const speed = 1 / 0.55;
    if (this.polarT < target) this.polarT = Math.min(target, this.polarT + speed * dt);
    else if (this.polarT > target) this.polarT = Math.max(target, this.polarT - speed * dt);

    if (this.phase === 'observe') {
      if (this.autoSpin) {
        this.stageAngle += AUTO_SPIN_SPEED * dt;
        this.rotatedTotal += AUTO_SPIN_SPEED * dt;
      }
      if (!this.dragging && Math.abs(this.angVel) > 0.001) {
        this.stageAngle += this.angVel * dt;
        this.rotatedTotal += Math.abs(this.angVel * dt);
        this.angVel *= Math.exp(-2.6 * dt);
        if (Math.abs(this.angVel) < 0.02) this.angVel = 0;
      }
      this.sinceFind += dt;
      this.updateCoach(dt);
    }

    if (this.phase === 'enter' && this.phaseTime >= T_ENTER) {
      this.setPhase('observe');
      this.sinceFind = 0;
    }
    if (this.phase === 'leave' && this.phaseTime >= T_LEAVE) {
      this.setPhase('select');
      setScreen(this.dom, 'select');
      buildCards(this.dom, SLIDES, this.cleared, (def) => this.startSlide(def));
    }

    this.particles.update(dt);
    if (this.phase === 'clear' && this.particles.count < 12 && this.phaseTime < 6) {
      this.particles.confetti(this.layout.w, this.layout.h, 26);
    }
  }

  /** あそびかたを、こまったときだけ そっと出す */
  private updateCoach(dt: number): void {
    if (!this.polarUsed) {
      if (this.phaseTime > 2.2) {
        showCoach(this.dom, '👉', 'にじスイッチを おしてね', 'switch');
        this.dom.btnPolar.classList.add('attention');
      }
      return;
    }
    if (this.rotatedTotal < 0.8) {
      if (this.phaseTime > 1.2) showCoach(this.dom, '🌀', 'ゆびで くるくる まわそう', 'field');
      return;
    }
    if (this.mode === 'quest') {
      // なかなか見つからないときは、粒にリングを出す
      if (this.sinceFind > 9) {
        this.hintT = Math.min(1, this.hintT + dt / 2.5);
        showCoach(this.dom, '💍', 'ひかってる わの つぶだよ', 'field');
      } else if (this.hintT > 0) {
        this.hintT = Math.max(0, this.hintT - dt * 2);
      }
    } else if (this.sinceFind > 10 && this.sparkles === 0) {
      showCoach(this.dom, '⭐', 'きらきらを タッチ！', 'field');
    }
  }

  private currentCamera(): { cam: Camera; zoom: number } {
    const fit = fitCamera(this.layout);
    const eye = eyepieceCamera(this.layout);
    if (this.phase === 'observe' || this.phase === 'clear') return { cam: eye, zoom: 1 };
    if (this.phase === 'enter') {
      const z = easeInOutCubic(
        Math.max(0, Math.min(1, (this.phaseTime - T_DROP - T_HOLD) / T_ZOOM)),
      );
      return { cam: lerpCamera(fit, eye, z), zoom: z };
    }
    if (this.phase === 'leave') {
      const z = 1 - easeInOutCubic(Math.min(1, this.phaseTime / T_LEAVE));
      return { cam: lerpCamera(fit, eye, z), zoom: z };
    }
    return { cam: fit, zoom: 0 };
  }

  render(): void {
    const ctx = this.ctx;
    const l = this.layout;
    const { cam, zoom } = this.currentCamera();

    if (this.phase === 'title' || this.phase === 'select' || this.phase === 'clear') {
      drawBackdrop(ctx, l, this.time);
      if (this.phase === 'clear') this.particles.draw(ctx);
      return;
    }

    // 外観（ズームしきる前だけ描く）
    if (zoom < 0.995) {
      drawBackdrop(ctx, l, this.time);
      ctx.save();
      applyCamera(ctx, cam, l);
      const drop =
        this.phase === 'leave' ? 1 : Math.max(0, Math.min(1, this.phaseTime / T_DROP));
      drawMicroscope(ctx, {
        time: this.time,
        slideDrop: drop,
        slide: this.slideDef,
        lamp: Math.max(0, Math.min(1, (this.phaseTime - T_DROP * 0.6) / 0.5)),
        polar: this.polarT,
        stageAngle: this.stageAngle,
      });
      ctx.restore();
    } else {
      ctx.fillStyle = '#140f22';
      ctx.fillRect(0, 0, l.w, l.h);
    }

    // 接眼レンズの中が だんだん画面いっぱいになる
    const surround = smoothstep(0.3, 0.98, zoom);
    if (surround > 0.001) {
      const g = ctx.createRadialGradient(
        l.fieldCx,
        l.fieldCy,
        0,
        l.fieldCx,
        l.fieldCy,
        Math.max(l.w, l.h),
      );
      g.addColorStop(0, '#302545');
      g.addColorStop(1, '#140f22');
      ctx.save();
      ctx.globalAlpha = surround;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, l.w, l.h);
      ctx.restore();
    }

    const section = this.section;
    if (section && zoom > 0.02) {
      const eyeScreen = worldToScreen(cam, l, EYEPIECE.x, EYEPIECE.y);
      const view: FieldView = {
        cx: eyeScreen.x,
        cy: eyeScreen.y,
        r: EYEPIECE.r * cam.scale,
      };
      const target = this.currentTarget();
      drawField(ctx, section, view, {
        stageAngle: this.stageAngle,
        polarT: this.polarT,
        time: this.time,
        reduced: this.reduced,
        alpha: smoothstep(0.05, 0.45, zoom),
        hintGrain: this.mode === 'quest' && this.hintT > 0 ? (target?.grain ?? null) : null,
        hintStrength: this.hintT,
      });
    }

    this.particles.draw(ctx);
  }

  start(): void {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- テスト用

  /** Playwright から決めうちで操作するための窓口 */
  debugApi() {
    return {
      state: () => ({
        phase: this.phase,
        mode: this.mode,
        slide: this.slideDef.id,
        polarOn: this.polarOn,
        polarT: this.polarT,
        stageAngle: this.stageAngle,
        autoSpin: this.autoSpin,
        sparkles: this.sparkles,
        questIndex: this.questIndex,
        questTotal: this.quest.length,
        grains: this.section?.grains.length ?? 0,
        fieldR: this.layout.fieldR,
        portrait: this.layout.portrait,
      }),
      skipIntro: () => {
        if (this.phase === 'enter') this.phaseTime = T_ENTER;
      },
      setStageAngle: (a: number) => {
        this.stageAngle = a;
        this.angVel = 0;
        this.rotatedTotal += 1;
      },
      setPolar: (on: boolean) => {
        if (this.polarOn !== on) this.togglePolar();
        this.polarT = on ? 1 : 0;
      },
      /** いまの目的の粒が いちばん光る角度に合わせて、その粒をタッチする */
      solveCurrentTarget: () => {
        const t = this.currentTarget();
        if (!t) return false;
        const g = t.grain;
        // sin^2(2(theta0+angle)) = 1 になる角度
        this.stageAngle = Math.PI / 4 - g.theta0;
        this.angVel = 0;
        this.rotatedTotal += 1;
        const p = fieldToScreen(this.view(), this.stageAngle, g.c);
        this.tapGrain(g, p.x, p.y);
        return true;
      },
      /** じゆうモードで、ひかっている粒をひとつタッチする */
      tapAnySparkle: () => {
        const section = this.section;
        if (!section) return false;
        const g = section.grains.find(
          (x) => !x.isotropic && x.retardation >= 420 && x.r > 0.05,
        );
        if (!g) return false;
        this.stageAngle = Math.PI / 4 - g.theta0;
        if (!isSparkling(g, this.stageAngle)) return false;
        const p = fieldToScreen(this.view(), this.stageAngle, g.c);
        this.tapGrain(g, p.x, p.y);
        return true;
      },
      /** 視野の中の粒が、いま何色に見えているか（テストの色チェック用） */
      sampleColors: () => {
        const section = this.section;
        if (!section) return [];
        return section.grains
          .slice(0, 40)
          .map((g) => grainIntensity(g, this.stageAngle));
      },
    };
  }
}

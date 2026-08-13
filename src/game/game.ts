import { CARD_THEMES, renderCard, renderCardThumb } from '../art/cards';
import { PATTERNS, renderHidden, renderPatternThumb, renderRelief } from '../art/patterns';
import { PRESS_SVG, ROLLER_SVG } from '../art/sprites';
import { sfx } from '../core/audio';
import {
  Rect,
  SafeArea,
  computeCardRect,
  isInsideCard,
  pointToCardUv,
  rectBottom,
  rectTop,
} from '../core/layout';
import { clamp, damp, lerp } from '../core/math';
import { TiltController, deviceTiltSupported, mapDragToTilt } from '../core/tilt';
import { Renderer } from '../gl/renderer';
import {
  Build,
  FOIL_TARGET,
  PRESS_TARGET,
  Phase,
  emptyBuild,
  embossFor,
  foilDone,
  showsCard,
} from './flow';
import { burst, confetti, shockRing } from './fx';

/**
 * Reduced-cost mode for CI / low-power devices: dpr 1, no glint noise, no
 * confetti. Enabled by `?fast=1` so the E2E run can opt in without a rebuild.
 */
const FAST =
  (typeof location !== 'undefined' && location.search.includes('fast=1')) ||
  import.meta.env?.VITE_E2E_FAST === '1';

interface Screens {
  title: HTMLElement;
  pickCard: HTMLElement;
  pickPattern: HTMLElement;
  press: HTMLElement;
  foil: HTMLElement;
  finish: HTMLElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

function readSafeArea(): SafeArea {
  const probe = el('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out: SafeArea = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return out;
}

export class Game {
  readonly renderer: Renderer;
  private ui: HTMLElement;
  private toolLayer: HTMLElement;
  private fxLayer: HTMLElement;
  private screens: Screens;

  phase: Phase = 'title';
  build: Build = emptyBuild();

  private tilt = new TiltController();
  private rect: Rect = { x: 0, y: 0, w: 10, h: 14 };
  private safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  private vw = 1;
  private vh = 1;

  private emboss = 0;
  private embossTarget = 0;
  private punch = 0;
  private reveal = 0;
  private spin = 0;
  private spinTarget = 0;
  private clock = 0;
  private lastFrame = 0;
  private coverage = 0;
  private coverTimer = 0;
  private busy = false;

  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastPoint: { x: number; y: number } | null = null;
  private lastMoveTime = 0;

  private rollerEl: HTMLElement;
  private pressEl: HTMLElement;
  private pressPips: HTMLElement[] = [];
  private foilPips: HTMLElement[] = [];
  private tiltBtn: HTMLButtonElement | null = null;
  private finishMsg!: HTMLElement;
  private msgTimer = 0;

  private belowEls: HTMLElement[] = [];
  private aboveEls: HTMLElement[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    if (FAST) this.renderer.quality = 0;

    this.ui = document.getElementById('ui-layer')!;
    this.toolLayer = document.getElementById('tool-layer')!;
    this.fxLayer = document.getElementById('fx-layer')!;

    this.rollerEl = el('div', 'tool', ROLLER_SVG);
    this.rollerEl.hidden = true;
    this.pressEl = el('div', 'tool', PRESS_SVG);
    this.pressEl.hidden = true;
    this.toolLayer.append(this.rollerEl, this.pressEl);

    this.screens = this.buildScreens();
    this.bindInput();

    this.safe = readSafeArea();
    this.layout();
    this.loadCardAssets();
    this.showTitleDemo();
    this.setPhase('title');
  }

  /* ------------------------------------------------------------------ *
   * DOM
   * ------------------------------------------------------------------ */

  private buildScreens(): Screens {
    // --- title ---
    const title = el('div', 'screen is-passthrough');
    title.id = 'screen-title';
    const titleBand = el('div', 'band');
    const titleMark = el('div');
    titleMark.style.textAlign = 'center';
    titleMark.append(
      el('div', 'title-sub', 'ぺたっ！ きらっ！'),
      el('div', 'title-mark', 'ひみつホログラム'),
      el('div', 'title-mark', 'こうじょう'),
    );
    titleBand.append(titleMark);
    const startBand = el('div', 'band');
    const startBtn = el('button', 'big-btn', '▶️ はじめる');
    startBtn.addEventListener('click', () => this.startRun());
    startBand.append(startBtn);
    title.append(titleBand, startBand);
    this.aboveEls.push(titleBand);
    this.belowEls.push(startBand);

    // --- pick base card ---
    const pickCard = el('div', 'screen picker');
    pickCard.append(el('div', 'picker-head', 'どの カード に する？'));
    const cardRow = el('div', 'picker-row');
    CARD_THEMES.forEach((theme, i) => {
      const b = el('button', 'choice');
      b.setAttribute('data-card', String(i));
      b.setAttribute('aria-label', theme.name);
      const thumb = renderCardThumb(i, 240);
      b.append(thumb, el('div', 'choice-name', `${theme.emoji} ${theme.name}`));
      b.addEventListener('click', () => this.chooseCard(i));
      cardRow.append(b);
    });
    pickCard.append(cardRow);

    // --- pick hologram pattern ---
    const pickPattern = el('div', 'screen picker');
    pickPattern.append(el('div', 'picker-head', 'どの きらきら に する？'));
    const patRow = el('div', 'picker-row');
    PATTERNS.forEach((p, i) => {
      const b = el('button', 'choice');
      b.setAttribute('data-pattern', String(i));
      b.setAttribute('aria-label', p.name);
      b.append(renderPatternThumb(i, 240), el('div', 'choice-name', p.name));
      b.addEventListener('click', () => this.choosePattern(i));
      patRow.append(b);
    });
    pickPattern.append(patRow);

    // --- press ---
    const press = el('div', 'screen is-passthrough');
    const pressBand = el('div', 'band');
    const pressHint = el('div', 'hint');
    pressHint.append(el('span', 'hint-emoji', '👆'), el('span', undefined, 'ぺたっ！'));
    const pressPipBox = el('div', 'pips');
    for (let i = 0; i < PRESS_TARGET; i++) {
      const pip = el('div', 'pip');
      this.pressPips.push(pip);
      pressPipBox.append(pip);
    }
    pressHint.append(pressPipBox);
    pressBand.append(pressHint);
    press.append(pressBand);
    // Below the card: out of the way of the working hand, and it fills the
    // space the finish screen's buttons will occupy, so the card never jumps.
    this.belowEls.push(pressBand);

    // --- foil ---
    const foil = el('div', 'screen is-passthrough');
    const foilBand = el('div', 'band');
    const foilHint = el('div', 'hint');
    foilHint.append(el('span', 'hint-emoji', '👉'), el('span', undefined, 'ころころ〜'));
    const foilPipBox = el('div', 'pips');
    for (let i = 0; i < 5; i++) {
      const pip = el('div', 'pip');
      this.foilPips.push(pip);
      foilPipBox.append(pip);
    }
    foilHint.append(foilPipBox);
    foilBand.append(foilHint);
    foil.append(foilBand);
    this.belowEls.push(foilBand);

    // --- finish ---
    // One message slot rather than a banner plus a hint: the card is the star
    // here, and stacking two text bands would squeeze it.
    const finish = el('div', 'screen is-passthrough');
    const bannerBand = el('div', 'band');
    this.finishMsg = el('div', 'finish-banner', '✨ できた！ ✨');
    bannerBand.append(this.finishMsg);

    const actions = el('div', 'band');
    const again = el('button', 'big-btn', '↺ もういちど');
    again.setAttribute('data-action', 'again');
    again.addEventListener('click', () => this.startRun());
    actions.append(again);

    if (deviceTiltSupported()) {
      const tiltBtn = el('button', 'mini-btn', '📱');
      tiltBtn.setAttribute('data-action', 'tilt');
      tiltBtn.setAttribute('aria-label', 'かたむけて あそぶ');
      tiltBtn.addEventListener('click', () => void this.enableDeviceTilt());
      this.tiltBtn = tiltBtn;
      actions.append(tiltBtn);
    }
    finish.append(bannerBand, actions);
    this.aboveEls.push(bannerBand);
    this.belowEls.push(actions);

    const screens: Screens = { title, pickCard, pickPattern, press, foil, finish };
    Object.values(screens).forEach((s) => this.ui.append(s));
    return screens;
  }

  /* ------------------------------------------------------------------ *
   * Assets
   * ------------------------------------------------------------------ */

  private loadCardAssets(): void {
    this.renderer.setBase(renderCard(this.build.card));
    this.renderer.setRelief(renderRelief(this.build.pattern));
    this.renderer.setHidden(renderHidden(this.build.card));
  }

  /** Title screen shows an already-finished card so the magic is visible up front. */
  private showTitleDemo(): void {
    this.build = { card: 0, pattern: 0, presses: PRESS_TARGET };
    this.loadCardAssets();
    this.renderer.clearFoil();
    // Inset, so the printed border still frames the foil patch.
    for (let y = 0.13; y <= 0.88; y += 0.07) {
      for (let x = 0.14; x <= 0.87; x += 0.1) {
        this.renderer.paintFoil(x, y, 0.19);
      }
    }
    this.emboss = 1;
    this.embossTarget = 1;
    this.reveal = 1;
  }

  /* ------------------------------------------------------------------ *
   * Phases
   * ------------------------------------------------------------------ */

  setPhase(p: Phase): void {
    this.phase = p;
    (Object.keys(this.screens) as (keyof Screens)[]).forEach((k) => {
      this.screens[k].classList.toggle('is-active', k === p);
    });
    this.rollerEl.hidden = true;
    this.pressEl.hidden = true;
    this.dragging = false;
    this.tilt.endDrag();
    this.layout();
  }

  startRun(): void {
    sfx.unlock();
    sfx.tap();
    this.build = emptyBuild();
    this.renderer.clearFoil();
    this.coverage = 0;
    this.emboss = 0;
    this.embossTarget = 0;
    this.reveal = 0;
    this.spin = 0;
    this.spinTarget = 0;
    this.busy = false;
    this.updatePips();
    this.setPhase('pickCard');
  }

  chooseCard(i: number): void {
    sfx.unlock();
    sfx.tap();
    this.build.card = i;
    this.renderer.setBase(renderCard(i));
    this.renderer.setHidden(renderHidden(i));
    this.setPhase('pickPattern');
  }

  choosePattern(i: number): void {
    sfx.unlock();
    sfx.sparkle(3, 2);
    this.build.pattern = i;
    this.renderer.setRelief(renderRelief(i));
    this.build.presses = 0;
    this.emboss = 0;
    this.embossTarget = 0;
    this.updatePips();
    this.setPhase('press');
  }

  /** One stamp of the press. Never fails; extra taps are simply ignored. */
  doPress(px: number, py: number): void {
    if (this.busy || this.build.presses >= PRESS_TARGET) return;
    sfx.unlock();
    const step = this.build.presses;
    this.build.presses++;
    this.embossTarget = embossFor(this.build.presses);
    this.punch = 1;
    sfx.stamp(step);
    this.updatePips();

    this.pressEl.hidden = false;
    this.pressEl.style.transform = `translate(${px}px, ${py}px)`;
    this.pressEl.animate(
      [
        { transform: `translate(${px}px, ${py - 130}px) scale(1.1)`, opacity: 0 },
        { transform: `translate(${px}px, ${py}px) scale(1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${px}px, ${py + 8}px) scale(0.94)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${px}px, ${py - 150}px) scale(1.05)`, opacity: 0 },
      ],
      { duration: 620, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => {
      this.pressEl.hidden = true;
    };

    shockRing(this.fxLayer, px, py, this.rect.w * 0.9);
    burst(this.fxLayer, px, py, 10, this.rect.w * 0.5);

    if (this.build.presses >= PRESS_TARGET) {
      this.busy = true;
      sfx.sparkle(5, 3);
      burst(this.fxLayer, this.rect.x, this.rect.y, 20, this.rect.w * 0.9);
      globalThis.setTimeout(() => {
        this.busy = false;
        this.setPhase('foil');
      }, 760);
    }
  }

  private paintAt(px: number, py: number): void {
    const { u, v } = pointToCardUv(px, py, this.rect);
    if (u < -0.25 || u > 1.25 || v < -0.25 || v > 1.25) return;
    this.renderer.paintFoil(u, v, 0.2);
  }

  /** Fill the whole card in one go - used by the test hooks. */
  fillFoil(): void {
    this.sweepFoil();
    this.coverage = this.renderer.foilCoverage();
    this.checkFoilDone();
  }

  /** One machine-neat pass of foil over the entire card. */
  private sweepFoil(): void {
    for (let y = 0.04; y <= 0.97; y += 0.055) {
      for (let x = 0.03; x <= 0.97; x += 0.08) {
        this.renderer.paintFoil(x, y, 0.2);
      }
    }
  }

  private checkFoilDone(): void {
    if (this.phase !== 'foil' || this.busy) return;
    this.updatePips();
    if (foilDone(this.coverage)) {
      this.busy = true;
      sfx.rollStop();
      sfx.sparkle(4, 3);
      // The machine finishes the last corners itself, so a 4-year-old's
      // scribble still comes out as a clean, fully stamped card.
      this.sweepFoil();
      this.coverage = 1;
      this.updatePips();
      burst(this.fxLayer, this.rect.x, this.rect.y, 16, this.rect.w * 0.8);
      globalThis.setTimeout(() => {
        this.busy = false;
        this.enterFinish();
      }, 420);
    }
  }

  private enterFinish(): void {
    this.setPhase('finish');
    this.reveal = 0;
    this.spin = -0.85;
    this.spinTarget = 0;
    sfx.fanfare();
    confetti(this.fxLayer, this.vw, this.vh, FAST ? 0 : 26);
    burst(this.fxLayer, this.rect.x, this.rect.y, 26, this.rect.w);

    // Celebrate first, then tell them what to do - the same slot, so the card
    // keeps all the room it can get.
    this.finishMsg.textContent = '✨ できた！ ✨';
    globalThis.clearTimeout(this.msgTimer);
    this.msgTimer = globalThis.setTimeout(() => {
      if (this.phase !== 'finish') return;
      this.finishMsg.textContent = '🌈 かたむけて みてね';
      this.finishMsg.animate(
        [
          { transform: 'scale(0.6)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 420, easing: 'cubic-bezier(0.2, 1.5, 0.4, 1)' },
      );
      sfx.sparkle(3, 4);
    }, 1700) as unknown as number;
  }

  async enableDeviceTilt(): Promise<void> {
    const ok = await this.tilt.enableDeviceTilt();
    if (ok && this.tiltBtn) {
      this.tiltBtn.textContent = '✅';
      this.tiltBtn.disabled = true;
      sfx.sparkle(3, 4);
    }
  }

  private updatePips(): void {
    this.pressPips.forEach((p, i) => p.classList.toggle('on', i < this.build.presses));
    const filled = Math.round(
      clamp(this.coverage / FOIL_TARGET, 0, 1) * this.foilPips.length,
    );
    this.foilPips.forEach((p, i) => p.classList.toggle('on', i < filled));
  }

  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */

  private bindInput(): void {
    const onDown = (e: PointerEvent) => {
      sfx.unlock();
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      const x = e.clientX;
      const y = e.clientY;
      this.lastPoint = { x, y };

      if (this.phase === 'press') {
        if (isInsideCard(x, y, this.rect, 0.15)) this.doPress(x, y);
        return;
      }
      if (this.phase === 'foil') {
        this.dragging = true;
        this.rollerEl.hidden = false;
        this.rollerEl.style.transform = `translate(${x}px, ${y}px)`;
        this.paintAt(x, y);
        sfx.roll(0.5);
        return;
      }
      if (this.phase === 'finish' || this.phase === 'title') {
        this.dragging = true;
        this.dragStart = { x, y };
        this.tilt.beginDrag();
        this.tilt.setDrag({ x: 0, y: 0 });
      }
    };

    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;

      if (this.phase === 'foil' && this.dragging) {
        this.rollerEl.style.transform = `translate(${x}px, ${y}px)`;
        const prev = this.lastPoint ?? { x, y };
        const dist = Math.hypot(x - prev.x, y - prev.y);
        const steps = Math.max(1, Math.ceil(dist / (this.rect.w * 0.06)));
        for (let i = 1; i <= steps; i++) {
          this.paintAt(lerp(prev.x, x, i / steps), lerp(prev.y, y, i / steps));
        }
        const now = performance.now();
        const dt = Math.max(16, now - this.lastMoveTime);
        sfx.roll(clamp((dist / dt) * 8, 0.1, 1));
        this.lastMoveTime = now;
        if (Math.random() < 0.35) burst(this.fxLayer, x, y, 3, 60);
        this.lastPoint = { x, y };
        return;
      }

      if (this.dragging && (this.phase === 'finish' || this.phase === 'title')) {
        this.tilt.setDrag(
          mapDragToTilt(x - this.dragStart.x, y - this.dragStart.y, this.rect.w, this.rect.h),
        );
      }
      this.lastPoint = { x, y };
    };

    const onUp = () => {
      if (this.phase === 'foil') {
        sfx.rollStop();
        this.rollerEl.hidden = true;
      }
      this.dragging = false;
      this.tilt.endDrag();
      this.lastPoint = null;
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari-only: stop pinch-zoom from hijacking a two-finger fumble.
    (document as EventTarget).addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /* ------------------------------------------------------------------ *
   * Layout + loop
   * ------------------------------------------------------------------ */

  layout(): void {
    this.vw = globalThis.innerWidth || 375;
    this.vh = globalThis.innerHeight || 667;
    const titleish = this.phase === 'title';
    this.rect = computeCardRect(this.vw, this.vh, this.safe, {
      top: titleish ? Math.max(70, this.vh * 0.13) : 0,
      bottom: titleish ? Math.max(10, this.vh * 0.02) : 0,
      scale: titleish ? 0.94 : 1,
    });
    this.renderer.resize(this.vw, this.vh, FAST ? 1 : 2);

    // Bands hug the card instead of using fixed offsets, so nothing ever
    // overlaps it regardless of orientation or notch size.
    const top = rectTop(this.rect);
    const bottom = rectBottom(this.rect);
    const aboveGap = `${Math.max(6, this.vh - top + 10)}px`;
    for (const a of this.aboveEls) a.style.bottom = aboveGap;
    for (const b of this.belowEls) {
      b.style.top = `${Math.min(this.vh - 78, bottom + 14)}px`;
    }
  }

  frame(now: number): void {
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05) || 0.016;
    this.lastFrame = now;
    this.clock += dt;

    // Tilt is lively on the finish/title screens and calm while working.
    const interactive = this.phase === 'finish' || this.phase === 'title';
    const tilt = this.tilt.update(dt, interactive ? 1 : 0.28);

    this.emboss = damp(this.emboss, this.embossTarget, 9, dt);
    this.punch = damp(this.punch, 0, 9, dt);
    this.reveal = damp(this.reveal, this.phase === 'finish' ? 1 : 0, 3, dt);
    this.spin = damp(this.spin, this.spinTarget, 4.5, dt);

    if (this.phase === 'foil' && !this.busy) {
      this.coverTimer += dt;
      if (this.coverTimer > 0.12) {
        this.coverTimer = 0;
        this.coverage = this.renderer.foilCoverage();
        this.checkFoilDone();
      }
    }

    if (!showsCard(this.phase)) {
      this.renderer.clear();
      return;
    }

    const squash = 1 - this.punch * 0.07;
    this.renderer.render({
      rect: {
        x: this.rect.x,
        y: this.rect.y + this.punch * this.rect.h * 0.012,
        w: this.rect.w * squash,
        h: this.rect.h * squash,
      },
      tilt,
      emboss: this.emboss,
      pattern: PATTERNS[this.build.pattern].kind,
      reveal: this.reveal,
      spin: this.spin,
      time: this.clock,
    });
  }

  start(): void {
    const tick = (now: number) => {
      this.frame(now);
      globalThis.requestAnimationFrame(tick);
    };
    globalThis.requestAnimationFrame(tick);

    const relayout = () => this.layout();
    globalThis.addEventListener('resize', relayout);
    globalThis.addEventListener('orientationchange', () => globalThis.setTimeout(relayout, 120));
    globalThis.visualViewport?.addEventListener('resize', relayout);
  }

  /* Exposed for the E2E smoke test. */
  debugState(): Record<string, unknown> {
    return {
      phase: this.phase,
      card: this.build.card,
      pattern: this.build.pattern,
      presses: this.build.presses,
      emboss: Number(this.emboss.toFixed(3)),
      coverage: Number(this.coverage.toFixed(3)),
      tilt: { x: Number(this.tilt.value.x.toFixed(3)), y: Number(this.tilt.value.y.toFixed(3)) },
      rect: this.rect,
    };
  }

  debugTilt(x: number, y: number): void {
    this.tilt.beginDrag();
    this.tilt.setDrag({ x, y });
  }

  debugReleaseTilt(): void {
    this.tilt.endDrag();
  }

  /**
   * Force a frame and read back the average colour at the centre of the card.
   * Lets the smoke test prove that tilting really does change what is on screen.
   */
  debugSample(): [number, number, number] {
    this.frame(performance.now());
    return this.renderer.readRegion(this.rect.x, this.rect.y, this.rect.w * 0.6, this.rect.h * 0.4);
  }
}

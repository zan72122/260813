import { CARD_THEMES, renderCard, renderCardThumb } from '../art/cards';
import { renderKinegram } from '../art/kinegram';
import { STAMP_MOTIFS } from '../art/stamps';
import { StampPlacement, renderRelief, renderStampThumb } from '../art/relief';
import { PRESS_SVG, ROLLER_SVG } from '../art/sprites';
import { sfx } from '../core/audio';
import {
  Director,
  gratingDirectorFromStroke,
  pitchFromSpeed,
} from '../core/field';
import {
  Rect,
  SafeArea,
  computeCardRect,
  isInsideCard,
  isLandscape,
  pointToCardUv,
  rectBottom,
  rectTop,
} from '../core/layout';
import { clamp, damp, easeOutBack, lerp } from '../core/math';
import { TiltController, deviceTiltNeedsPermission, mapDragToTilt } from '../core/tilt';
import { Renderer } from '../gl/renderer';
import {
  CardRecord,
  addPoint,
  addStamp,
  beginStroke,
  loadAlbum,
  newRecord,
  pointCount,
  saveToAlbum,
  stampsOf,
  strokePoints,
} from './album';
import {
  FOIL_TARGET,
  PRESS_TARGET,
  Phase,
  canFinishFoil,
  embossFor,
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

/** Roller half-width, in card uv. */
const ROLLER_RADIUS = 0.11;

interface Screens {
  title: HTMLElement;
  pickCard: HTMLElement;
  pickStamp: HTMLElement;
  press: HTMLElement;
  foil: HTMLElement;
  finish: HTMLElement;
  album: HTMLElement;
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

  /** The card being made, in the exact form it gets stored and replayed. */
  private record: CardRecord = newRecord(0, 0);
  private album: CardRecord[] = [];
  /** True while looking at a card from the album, so it is not saved twice. */
  private viewingSaved = false;

  private tilt = new TiltController();
  private rect: Rect = { x: 0, y: 0, w: 10, h: 14 };
  private safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };
  private vw = 1;
  private vh = 1;

  private emboss = 0;
  private embossTarget = 0;
  private punch = 0;
  private reveal = 0;
  private entrance = 1;
  private spin = 0;
  private spinTarget = 0;
  private clock = 0;
  private lastFrame = 0;
  private coverage = 0;
  private coverTimer = 0;
  private busy = false;

  // UV lamp
  private uvOn = false;
  private uvMode = 0;
  private light = { u: 0.5, v: 0.5, r: 0.3 };

  // rolling
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private lastPaintUv: { u: number; v: number } | null = null;
  private lastMoveTime = 0;

  private rollerEl: HTMLElement;
  private pressEl: HTMLElement;
  private pressPips: HTMLElement[] = [];
  private foilPips: HTMLElement[] = [];
  private tiltBtn: HTMLButtonElement | null = null;
  private doneBtn!: HTMLButtonElement;
  private foilHint!: HTMLElement;
  private uvBtn!: HTMLButtonElement;
  private finishMsg!: HTMLElement;
  private albumGrid!: HTMLElement;
  private albumEmpty!: HTMLElement;
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
    this.album = loadAlbum();
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
    const titleAlbumBtn = el('button', 'mini-btn', '🗄');
    titleAlbumBtn.setAttribute('data-action', 'album');
    titleAlbumBtn.setAttribute('aria-label', 'たな');
    titleAlbumBtn.addEventListener('click', () => this.openAlbum());
    startBand.append(startBtn, titleAlbumBtn);
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
      b.append(renderCardThumb(i, 240), el('div', 'choice-name', `${theme.emoji} ${theme.name}`));
      b.addEventListener('click', () => this.chooseCard(i));
      cardRow.append(b);
    });
    pickCard.append(cardRow);

    // --- pick press head ---
    const pickStamp = el('div', 'screen picker');
    pickStamp.append(el('div', 'picker-head', 'どの はんこ に する？'));
    const stampRow = el('div', 'picker-row');
    STAMP_MOTIFS.forEach((m, i) => {
      const b = el('button', 'choice');
      b.setAttribute('data-stamp', String(i));
      b.setAttribute('aria-label', m.name);
      b.append(renderStampThumb(i, 240), el('div', 'choice-name', `${m.emoji} ${m.name}`));
      b.addEventListener('click', () => this.chooseStamp(i));
      stampRow.append(b);
    });
    pickStamp.append(stampRow);

    // --- press ---
    const press = el('div', 'screen is-passthrough');
    const pressBand = el('div', 'band');
    const pressHint = el('div', 'hint');
    pressHint.append(el('span', 'hint-emoji', '👆'), el('span', undefined, 'すきな ところに ぺたっ！'));
    const pressPipBox = el('div', 'pips');
    for (let i = 0; i < PRESS_TARGET; i++) {
      const pip = el('div', 'pip');
      this.pressPips.push(pip);
      pressPipBox.append(pip);
    }
    pressHint.append(pressPipBox);
    pressBand.append(pressHint);
    press.append(pressBand);
    this.belowEls.push(pressBand);

    // --- foil ---
    const foil = el('div', 'screen is-passthrough');
    const foilBand = el('div', 'band');
    const foilHint = el('div', 'hint');
    this.foilHint = foilHint;
    foilHint.append(el('span', 'hint-emoji', '👉'), el('span', 'hint-text', 'ころころ〜'));
    const foilPipBox = el('div', 'pips');
    for (let i = 0; i < 5; i++) {
      const pip = el('div', 'pip');
      this.foilPips.push(pip);
      foilPipBox.append(pip);
    }
    foilHint.append(foilPipBox);
    this.doneBtn = el('button', 'big-btn', '✨ できた！');
    this.doneBtn.setAttribute('data-action', 'done');
    this.doneBtn.hidden = true;
    this.doneBtn.addEventListener('click', () => this.finishFoil());
    foilBand.append(foilHint, this.doneBtn);
    foil.append(foilBand);
    this.belowEls.push(foilBand);

    // --- finish ---
    const finish = el('div', 'screen is-passthrough');
    const bannerBand = el('div', 'band');
    this.finishMsg = el('div', 'finish-banner', '✨ できた！ ✨');
    bannerBand.append(this.finishMsg);

    const actions = el('div', 'band');
    const again = el('button', 'big-btn', '↺ もういちど');
    again.setAttribute('data-action', 'again');
    again.addEventListener('click', () => this.startRun());
    this.uvBtn = el('button', 'mini-btn', '🔦');
    this.uvBtn.setAttribute('data-action', 'uv');
    this.uvBtn.setAttribute('aria-label', 'ひみつライト');
    this.uvBtn.addEventListener('click', () => this.toggleUv());
    const albumBtn = el('button', 'mini-btn', '🗄');
    albumBtn.setAttribute('data-action', 'album');
    albumBtn.setAttribute('aria-label', 'たな');
    albumBtn.addEventListener('click', () => this.openAlbum());
    actions.append(again, this.uvBtn, albumBtn);

    if (deviceTiltNeedsPermission()) {
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

    // --- album ---
    const album = el('div', 'screen picker');
    album.append(el('div', 'picker-head', '🗄 たな'));
    this.albumGrid = el('div', 'album-grid');
    this.albumEmpty = el('div', 'album-empty', 'まだ ないよ');
    const albumActions = el('div', 'picker-row');
    const makeBtn = el('button', 'big-btn', '＋ つくる');
    makeBtn.setAttribute('data-action', 'make');
    makeBtn.addEventListener('click', () => this.startRun());
    albumActions.append(makeBtn);
    album.append(this.albumGrid, this.albumEmpty, albumActions);

    const screens: Screens = { title, pickCard, pickStamp, press, foil, finish, album };
    Object.values(screens).forEach((s) => this.ui.append(s));
    return screens;
  }

  /* ------------------------------------------------------------------ *
   * Building a card from a record
   * ------------------------------------------------------------------ */

  /** Push a record into the renderer, replaying every stroke it holds. */
  private applyRecord(rec: CardRecord): void {
    const stamps: StampPlacement[] = stampsOf(rec);
    this.renderer.setBase(renderCard(rec.card));
    this.renderer.setRelief(renderRelief(rec.motif, stamps));
    this.renderer.setKinegram(renderKinegram(rec.motif, stamps));
    this.renderer.clearFoil();

    for (const stroke of rec.strokes) {
      const pts = strokePoints(stroke);
      let prev = pts[0];
      if (!prev) continue;
      this.paintSegment(prev.u, prev.v, prev.u, prev.v, prev.pitch);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        this.paintSegment(prev.u, prev.v, p.u, p.v, p.pitch);
        prev = p;
      }
    }
    this.coverage = this.renderer.foilCoverage();
  }

  /** Only place the stamps have influence over the ruling is via what the child rolls. */
  private paintSegment(u0: number, v0: number, u1: number, v1: number, pitch01: number): void {
    const dir: Director = gratingDirectorFromStroke(u1 - u0, v1 - v0);
    this.renderer.paintStroke(u0, v0, u1, v1, ROLLER_RADIUS, dir, pitch01);
  }

  /** Rebuild the relief + secret picture after a stamp lands. */
  private refreshStampArt(): void {
    const stamps = stampsOf(this.record);
    this.renderer.setRelief(renderRelief(this.record.motif, stamps));
    this.renderer.setKinegram(renderKinegram(this.record.motif, stamps));
  }

  /** Title screen shows an already-finished card so the magic is visible up front. */
  private showTitleDemo(): void {
    const demo = newRecord(0, 0);
    addStamp(demo, 0.5, 0.34);
    addStamp(demo, 0.3, 0.66);
    addStamp(demo, 0.72, 0.72);
    // A hand-rolled looking serpentine, so the title card reads as made, not generated.
    beginStroke(demo);
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const u = 0.16 + 0.68 * (0.5 - 0.5 * Math.cos(t * Math.PI * 5));
      const v = 0.1 + 0.8 * t;
      addPoint(demo, u, v, 0.6);
    }
    this.record = demo;
    this.applyRecord(demo);
    this.emboss = 1;
    this.embossTarget = 1;
    this.reveal = 1;
    this.viewingSaved = true;
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
    if (p !== 'finish') this.setUv(false);
    this.layout();
  }

  startRun(): void {
    sfx.unlock();
    sfx.tap();
    // iOS only grants motion access from inside a user gesture. Asking here,
    // on a deliberate button press, means physical tilt is already working by
    // the time the finished card appears - no small button to hunt for.
    if (!this.tilt.deviceEnabled) void this.enableDeviceTilt();

    this.record = newRecord(0, 0);
    this.viewingSaved = false;
    this.renderer.clearFoil();
    this.coverage = 0;
    this.emboss = 0;
    this.embossTarget = 0;
    this.reveal = 0;
    this.spin = 0;
    this.spinTarget = 0;
    this.entrance = 1;
    this.busy = false;
    this.doneBtn.hidden = true;
    this.updatePips();
    this.setPhase('pickCard');
  }

  chooseCard(i: number): void {
    sfx.unlock();
    sfx.tap();
    this.record.card = i;
    this.renderer.setBase(renderCard(i));
    this.setPhase('pickStamp');
  }

  chooseStamp(i: number): void {
    sfx.unlock();
    sfx.sparkle(3, 2);
    this.record.motif = i;
    this.record.stamps = [];
    this.refreshStampArt();
    this.emboss = 0;
    this.embossTarget = 0;
    this.updatePips();
    this.setPhase('press');
  }

  private stampCount(): number {
    return this.record.stamps.length / 2;
  }

  /** One press of the stamp, wherever the finger landed. Extra taps are ignored. */
  doPress(px: number, py: number): void {
    if (this.busy || this.stampCount() >= PRESS_TARGET) return;
    sfx.unlock();
    const { u, v } = pointToCardUv(px, py, this.rect);
    const step = this.stampCount();
    addStamp(this.record, clamp(u, 0.12, 0.88), clamp(v, 0.1, 0.9));
    this.refreshStampArt();
    this.embossTarget = embossFor(this.stampCount());
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

    shockRing(this.fxLayer, px, py, this.rect.w * 0.7);
    burst(this.fxLayer, px, py, 10, this.rect.w * 0.45);

    if (this.stampCount() >= PRESS_TARGET) {
      this.busy = true;
      sfx.sparkle(5, 3);
      burst(this.fxLayer, this.rect.x, this.rect.y, 20, this.rect.w * 0.9);
      globalThis.setTimeout(() => {
        this.busy = false;
        this.setPhase('foil');
      }, 760);
    }
  }

  /** Roll foil in a straight machine pass - used by the test hooks. */
  fillFoil(): void {
    beginStroke(this.record);
    let prev: { u: number; v: number } | null = null;
    for (let row = 0; row < 9; row++) {
      const v = 0.06 + (row / 8) * 0.88;
      for (let k = 0; k <= 12; k++) {
        const t = row % 2 === 0 ? k / 12 : 1 - k / 12;
        const u = 0.05 + t * 0.9;
        if (addPoint(this.record, u, v, 0.5) && prev) this.paintSegment(prev.u, prev.v, u, v, 0.5);
        prev = { u, v };
      }
    }
    this.coverage = this.renderer.foilCoverage();
    this.updatePips();
    this.finishFoil();
  }

  /** The child decides the card is done. There is no minimum standard. */
  finishFoil(): void {
    if (this.phase !== 'foil' || this.busy) return;
    this.busy = true;
    sfx.rollStop();
    this.rollerEl.hidden = true;
    globalThis.setTimeout(() => {
      this.busy = false;
      this.enterFinish();
    }, 180);
  }

  private enterFinish(): void {
    this.setPhase('finish');
    this.reveal = 0;
    this.entrance = 0;
    this.spin = -0.85;
    this.spinTarget = 0;
    sfx.fanfare();
    confetti(this.fxLayer, this.vw, this.vh, FAST ? 0 : 26);
    burst(this.fxLayer, this.rect.x, this.rect.y, 26, this.rect.w);

    if (!this.viewingSaved) {
      this.record.t = Date.now();
      this.album = saveToAlbum(this.record);
    }

    // Celebrate first, then say what to do - one slot, so the card keeps the room.
    this.finishMsg.textContent = '✨ できた！ ✨';
    globalThis.clearTimeout(this.msgTimer);
    this.msgTimer = globalThis.setTimeout(() => {
      if (this.phase !== 'finish' || this.uvOn) return;
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

  /* ------------------------------------------------------------------ *
   * UV lamp
   * ------------------------------------------------------------------ */

  toggleUv(): void {
    this.setUv(!this.uvOn);
  }

  private setUv(on: boolean): void {
    if (this.uvOn === on) return;
    this.uvOn = on;
    this.uvBtn.textContent = on ? '🌈' : '🔦';
    document.body.classList.toggle('is-uv', on);
    if (on) {
      sfx.sparkle(2, 5);
      this.finishMsg.textContent = '🔦 なぞって さがしてね';
      this.light = { u: 0.5, v: 0.5, r: 0.3 };
    } else if (this.phase === 'finish') {
      this.finishMsg.textContent = '🌈 かたむけて みてね';
    }
  }

  /* ------------------------------------------------------------------ *
   * Album
   * ------------------------------------------------------------------ */

  openAlbum(): void {
    sfx.unlock();
    sfx.tap();
    this.album = loadAlbum();
    this.albumGrid.replaceChildren();
    this.albumEmpty.hidden = this.album.length > 0;

    const live = this.record;
    for (const rec of this.album) {
      const btn = el('button', 'album-item');
      btn.setAttribute('data-album-item', String(rec.t));
      btn.append(this.renderThumb(rec));
      btn.addEventListener('click', () => this.openSaved(rec));
      this.albumGrid.append(btn);
    }
    // Put the card that was on screen back, so leaving the album is seamless.
    this.applyRecord(live);
    this.setPhase('album');
  }

  /** Rebuild a stored card and grab a picture of it for the shelf. */
  private renderThumb(rec: CardRecord): HTMLCanvasElement {
    this.applyRecord(rec);
    const w = 150;
    const h = w / 0.7;
    this.renderer.render({
      rect: { x: this.vw / 2, y: this.vh / 2, w: w * 0.86, h: h * 0.86 },
      tilt: { x: 0.34, y: -0.16 },
      emboss: 1,
      reveal: 1,
      spin: 0,
      time: 0,
      uvMode: 0,
      light: this.light,
    });
    const img = this.renderer.readRegionRGBA(this.vw / 2, this.vh / 2, w, h);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')?.putImageData(img, 0, 0);
    return c;
  }

  private openSaved(rec: CardRecord): void {
    sfx.unlock();
    this.record = rec;
    this.viewingSaved = true;
    this.applyRecord(rec);
    this.emboss = 1;
    this.embossTarget = 1;
    this.enterFinish();
  }

  async enableDeviceTilt(): Promise<void> {
    const ok = await this.tilt.enableDeviceTilt();
    if (ok && this.tiltBtn) {
      this.tiltBtn.textContent = '✅';
      this.tiltBtn.disabled = true;
    }
  }

  private updatePips(): void {
    const stamped = this.stampCount();
    this.pressPips.forEach((p, i) => p.classList.toggle('on', i < stamped));
    const filled = Math.round(clamp(this.coverage / FOIL_TARGET, 0, 1) * this.foilPips.length);
    this.foilPips.forEach((p, i) => p.classList.toggle('on', i < filled));
    // Once "done" appears the instruction has done its job, so the hint drops
    // its words - otherwise the two together overflow a narrow phone.
    const canFinish = canFinishFoil(this.coverage);
    if (this.doneBtn.hidden === canFinish) this.doneBtn.hidden = !canFinish;
    this.foilHint.classList.toggle('is-compact', canFinish);
  }

  /* ------------------------------------------------------------------ *
   * Input
   * ------------------------------------------------------------------ */

  private beginRoll(x: number, y: number): void {
    this.dragging = true;
    this.rollerEl.hidden = false;
    this.rollerEl.style.transform = `translate(${x}px, ${y}px)`;
    const { u, v } = pointToCardUv(x, y, this.rect);
    beginStroke(this.record);
    if (addPoint(this.record, u, v, 0.5)) {
      this.paintSegment(u, v, u, v, 0.5);
      this.lastPaintUv = { u, v };
    }
    this.lastMoveTime = performance.now();
    sfx.roll(0.5);
  }

  /**
   * Paint only the points that were recorded, so a replayed card is identical
   * to the one the child rolled - which is what makes the album exact.
   */
  private continueRoll(x: number, y: number): void {
    this.rollerEl.style.transform = `translate(${x}px, ${y}px)`;
    const { u, v } = pointToCardUv(x, y, this.rect);
    const prev = this.lastPaintUv;
    const now = performance.now();
    const dt = Math.max(0.008, (now - this.lastMoveTime) / 1000);
    const dist = prev ? Math.hypot(u - prev.u, v - prev.v) : 0;
    const pitch = pitchFromSpeed(dist / dt);

    if (addPoint(this.record, u, v, pitch)) {
      if (prev) this.paintSegment(prev.u, prev.v, u, v, pitch);
      this.lastPaintUv = { u, v };
      this.lastMoveTime = now;
      sfx.roll(clamp(dist / dt / 1.2, 0.12, 1));
      if (Math.random() < 0.3) burst(this.fxLayer, x, y, 3, 60);
    }
  }

  private bindInput(): void {
    const onDown = (e: PointerEvent) => {
      sfx.unlock();
      if ((e.target as HTMLElement | null)?.closest('button')) return;
      const x = e.clientX;
      const y = e.clientY;

      if (this.phase === 'press') {
        if (isInsideCard(x, y, this.rect, 0.15)) this.doPress(x, y);
        return;
      }
      if (this.phase === 'foil' && !this.busy) {
        this.beginRoll(x, y);
        return;
      }
      if (this.phase === 'finish' || this.phase === 'title') {
        this.dragging = true;
        if (this.uvOn) {
          this.moveLamp(x, y);
          return;
        }
        this.dragStart = { x, y };
        this.tilt.beginDrag();
        this.tilt.setDrag({ x: 0, y: 0 });
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!this.dragging) return;
      const x = e.clientX;
      const y = e.clientY;

      if (this.phase === 'foil') {
        this.continueRoll(x, y);
        return;
      }
      if (this.phase === 'finish' || this.phase === 'title') {
        if (this.uvOn) {
          this.moveLamp(x, y);
          return;
        }
        this.tilt.setDrag(
          mapDragToTilt(x - this.dragStart.x, y - this.dragStart.y, this.rect.w, this.rect.h),
        );
      }
    };

    const onUp = () => {
      if (this.phase === 'foil') {
        sfx.rollStop();
        this.rollerEl.hidden = true;
        this.coverage = this.renderer.foilCoverage();
        this.updatePips();
      }
      this.dragging = false;
      this.lastPaintUv = null;
      this.tilt.endDrag();
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointercancel', onUp, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari-only: stop pinch-zoom from hijacking a two-finger fumble.
    (document as EventTarget).addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private moveLamp(x: number, y: number): void {
    const { u, v } = pointToCardUv(x, y, this.rect);
    this.light = { u: clamp(u, -0.2, 1.2), v: clamp(v, -0.2, 1.2), r: 0.3 };
  }

  /* ------------------------------------------------------------------ *
   * Layout + loop
   * ------------------------------------------------------------------ */

  layout(): void {
    this.vw = globalThis.innerWidth || 375;
    this.vh = globalThis.innerHeight || 667;
    const landscape = isLandscape(this.vw, this.vh);
    const titleish = this.phase === 'title' && !landscape;
    this.rect = computeCardRect(this.vw, this.vh, this.safe, {
      top: titleish ? Math.max(70, this.vh * 0.13) : 0,
      bottom: titleish ? Math.max(10, this.vh * 0.02) : 0,
      scale: titleish ? 0.94 : 1,
    });
    this.renderer.resize(this.vw, this.vh, FAST ? 1 : 2);

    for (const a of this.aboveEls) this.placeBand(a, 'above', landscape);
    for (const b of this.belowEls) this.placeBand(b, 'below', landscape);
  }

  private placeBand(band: HTMLElement, side: 'above' | 'below', landscape: boolean): void {
    const s = band.style;
    band.classList.toggle('is-column', landscape);

    if (landscape) {
      const cardLeft = this.rect.x - this.rect.w / 2;
      const cardRight = this.rect.x + this.rect.w / 2;
      s.top = '0px';
      s.bottom = '0px';
      if (side === 'above') {
        s.left = `${this.safe.left + 6}px`;
        s.right = `${Math.max(8, this.vw - cardLeft + 14)}px`;
      } else {
        s.left = `${Math.min(this.vw - 8, cardRight + 14)}px`;
        s.right = `${this.safe.right + 6}px`;
      }
      return;
    }

    s.left = '0px';
    s.right = '0px';
    if (side === 'above') {
      s.top = 'auto';
      s.bottom = `${Math.max(6, this.vh - rectTop(this.rect) + 10)}px`;
    } else {
      s.bottom = 'auto';
      s.top = `${Math.min(this.vh - 78, rectBottom(this.rect) + 14)}px`;
    }
  }

  frame(now: number): void {
    const dt = clamp((now - this.lastFrame) / 1000, 0, 0.05) || 0.016;
    this.lastFrame = now;
    this.clock += dt;

    // Tilt is lively on the finish/title screens and calm while working.
    const interactive = this.phase === 'finish' || this.phase === 'title';
    const tilt = this.tilt.update(dt, interactive && !this.uvOn ? 1 : 0.28);

    this.emboss = damp(this.emboss, this.embossTarget, 9, dt);
    this.punch = damp(this.punch, 0, 9, dt);
    this.reveal = damp(this.reveal, this.phase === 'finish' ? 1 : 0, 3, dt);
    this.spin = damp(this.spin, this.spinTarget, 4.5, dt);
    this.uvMode = damp(this.uvMode, this.uvOn ? 1 : 0, 8, dt);
    this.entrance = clamp(this.entrance + dt / 0.7, 0, 1);

    if (this.phase === 'foil' && !this.busy && this.dragging) {
      this.coverTimer += dt;
      if (this.coverTimer > 0.15) {
        this.coverTimer = 0;
        this.coverage = this.renderer.foilCoverage();
        this.updatePips();
      }
    }

    if (!showsCard(this.phase)) {
      this.renderer.clear();
      return;
    }

    // Squash on each press; a springy pop when the finished card appears.
    const scale = (1 - this.punch * 0.07) * lerp(0.78, 1, easeOutBack(this.entrance));
    this.renderer.render({
      rect: {
        x: this.rect.x,
        y: this.rect.y + this.punch * this.rect.h * 0.012,
        w: this.rect.w * scale,
        h: this.rect.h * scale,
      },
      tilt,
      emboss: this.emboss,
      reveal: this.reveal,
      spin: this.spin,
      time: this.clock,
      uvMode: this.uvMode,
      light: this.light,
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

  /* ------------------------------------------------------------------ *
   * Exposed for the E2E smoke test
   * ------------------------------------------------------------------ */

  debugState(): Record<string, unknown> {
    return {
      phase: this.phase,
      card: this.record.card,
      motif: this.record.motif,
      presses: this.stampCount(),
      points: pointCount(this.record),
      emboss: Number(this.emboss.toFixed(3)),
      coverage: Number(this.coverage.toFixed(3)),
      uv: this.uvOn,
      albumCount: this.album.length,
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

  /** Press at a card-uv position, so a test can place stamps deterministically. */
  debugPress(u = 0.5, v = 0.5): void {
    this.doPress(this.rect.x + (u - 0.5) * this.rect.w, this.rect.y + (v - 0.5) * this.rect.h);
  }

  /** Roll a given path in card uv, exactly as if a finger had traced it. */
  debugStroke(points: [number, number][], pitch = 0.5): void {
    beginStroke(this.record);
    let prev: { u: number; v: number } | null = null;
    for (const [u, v] of points) {
      if (addPoint(this.record, u, v, pitch)) {
        if (prev) this.paintSegment(prev.u, prev.v, u, v, pitch);
        else this.paintSegment(u, v, u, v, pitch);
        prev = { u, v };
      }
    }
    this.coverage = this.renderer.foilCoverage();
    this.updatePips();
  }

  /**
   * Force a frame and read back the average colour at the centre of the card.
   * Lets the smoke test prove that tilting really does change what is on screen.
   */
  debugSample(): [number, number, number] {
    this.frame(performance.now());
    return this.renderer.readRegion(this.rect.x, this.rect.y, this.rect.w * 0.6, this.rect.h * 0.4);
  }

  /** Full-resolution pixels of the card, for comparing two builds. */
  debugPixels(): number[] {
    this.frame(performance.now());
    const img = this.renderer.readRegionRGBA(
      this.rect.x,
      this.rect.y,
      this.rect.w * 0.7,
      this.rect.h * 0.5,
    );
    return Array.from(img.data);
  }
}

import type { Phase } from '../game/types.ts';
import { ICONS } from './icons.ts';

export interface OverlayCallbacks {
  onPlay: () => void;
  onToggleMute: () => void;
  onToggleReducedMotion: () => void;
  onReplaySame: () => void;
  onReplayShuffle: () => void;
  onReplayFreePlay: () => void;
  onFreePlayMode: (mode: 'playroom' | 'lunch' | 'nap') => void;
  onFreePlayExit: () => void;
}

const DAY_DIAL_PROGRESS: Record<Phase, number> = {
  TITLE: 0.06,
  PLAY_CLEANUP: 0.16,
  LUNCH_SETUP: 0.42,
  LUNCH_CLEANUP: 0.52,
  NAP_SETUP: 0.72,
  WAKE_RESTORE: 0.88,
  REPLAY: 0.96,
  FREE_PLAY: 0.5,
};

function el(tag: string, className: string, html?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class Overlay {
  private root: HTMLElement;
  private callbacks: OverlayCallbacks;

  private titleLayer: HTMLElement;
  private replayLayer: HTMLElement;
  private freeplayLayer: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private motionBtn: HTMLButtonElement;
  private dayDialSun: SVGCircleElement;

  constructor(root: HTMLElement, callbacks: OverlayCallbacks) {
    this.root = root;
    this.callbacks = callbacks;

    // Title
    this.titleLayer = el('div', 'title-layer');
    const titleButton = document.createElement('button');
    titleButton.className = 'title-button interactive';
    titleButton.setAttribute('aria-label', 'play');
    titleButton.innerHTML = ICONS.play;
    titleButton.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onPlay();
    });
    this.titleLayer.appendChild(titleButton);

    // Top controls
    const topControls = el('div', 'top-controls');
    this.muteBtn = document.createElement('button');
    this.muteBtn.className = 'icon-btn interactive';
    this.muteBtn.setAttribute('aria-label', 'mute');
    this.muteBtn.innerHTML = ICONS.speakerOn;
    this.muteBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleMute();
    });
    this.motionBtn = document.createElement('button');
    this.motionBtn.className = 'icon-btn interactive';
    this.motionBtn.setAttribute('aria-label', 'reduced motion');
    this.motionBtn.innerHTML = ICONS.sparkle;
    this.motionBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleReducedMotion();
    });
    topControls.appendChild(this.muteBtn);
    topControls.appendChild(this.motionBtn);

    // Day dial
    const dayDial = el('div', 'day-dial');
    dayDial.innerHTML = `<svg viewBox="0 0 96 52" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 46 A42 42 0 0 1 90 46" stroke="#C9A876" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/>
      <circle id="day-dial-sun" cx="6" cy="46" r="7" fill="#F7D97B"/>
    </svg>`;
    this.dayDialSun = dayDial.querySelector('#day-dial-sun') as unknown as SVGCircleElement;

    // Replay cards
    this.replayLayer = el('div', 'replay-layer');
    const sameDayCard = document.createElement('button');
    sameDayCard.className = 'replay-card interactive';
    sameDayCard.setAttribute('aria-label', 'replay same day');
    sameDayCard.innerHTML = ICONS.replaySameDay;
    sameDayCard.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onReplaySame();
    });
    const shuffleCard = document.createElement('button');
    shuffleCard.className = 'replay-card interactive';
    shuffleCard.setAttribute('aria-label', 'shuffle');
    shuffleCard.innerHTML = ICONS.shuffle;
    shuffleCard.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onReplayShuffle();
    });
    const freePlayCard = document.createElement('button');
    freePlayCard.className = 'replay-card interactive';
    freePlayCard.setAttribute('aria-label', 'free play');
    freePlayCard.innerHTML = ICONS.house;
    freePlayCard.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onReplayFreePlay();
    });
    this.replayLayer.appendChild(sameDayCard);
    this.replayLayer.appendChild(shuffleCard);
    this.replayLayer.appendChild(freePlayCard);

    // Free play controls
    this.freeplayLayer = el('div', 'freeplay-layer');
    const playroomBtn = document.createElement('button');
    playroomBtn.className = 'freeplay-btn interactive';
    playroomBtn.setAttribute('aria-label', 'playroom');
    playroomBtn.innerHTML = ICONS.toybox;
    playroomBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onFreePlayMode('playroom');
    });
    const lunchBtn = document.createElement('button');
    lunchBtn.className = 'freeplay-btn interactive';
    lunchBtn.setAttribute('aria-label', 'lunch room');
    lunchBtn.innerHTML = ICONS.bowl;
    lunchBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onFreePlayMode('lunch');
    });
    const napBtn = document.createElement('button');
    napBtn.className = 'freeplay-btn interactive';
    napBtn.setAttribute('aria-label', 'nap room');
    napBtn.innerHTML = ICONS.moon;
    napBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onFreePlayMode('nap');
    });
    const exitBtn = document.createElement('button');
    exitBtn.className = 'freeplay-btn exit interactive';
    exitBtn.setAttribute('aria-label', 'back');
    exitBtn.innerHTML = ICONS.back;
    exitBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onFreePlayExit();
    });
    this.freeplayLayer.appendChild(playroomBtn);
    this.freeplayLayer.appendChild(lunchBtn);
    this.freeplayLayer.appendChild(napBtn);
    this.freeplayLayer.appendChild(exitBtn);

    const versionTag = el('div', 'version-tag', `v${__APP_VERSION__}`);

    this.root.appendChild(dayDial);
    this.root.appendChild(topControls);
    this.root.appendChild(this.titleLayer);
    this.root.appendChild(this.replayLayer);
    this.root.appendChild(this.freeplayLayer);
    this.root.appendChild(versionTag);
  }

  setPhase(phase: Phase): void {
    this.titleLayer.classList.toggle('hidden', phase !== 'TITLE');
    this.replayLayer.classList.toggle('visible', phase === 'REPLAY');
    this.freeplayLayer.classList.toggle('visible', phase === 'FREE_PLAY');
    this.setDayDialProgress(DAY_DIAL_PROGRESS[phase]);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = muted ? ICONS.speakerOff : ICONS.speakerOn;
    this.muteBtn.classList.toggle('off', muted);
  }

  setReducedMotion(value: boolean): void {
    this.motionBtn.innerHTML = value ? ICONS.sparkleSlash : ICONS.sparkle;
    this.motionBtn.classList.toggle('off', value);
    document.body.classList.toggle('reduced-motion', value);
  }

  setDayDialProgress(t: number): void {
    const angle = Math.PI - t * Math.PI;
    const cx = 48 + Math.cos(angle) * 42;
    const cy = 46 - Math.sin(angle) * 42;
    this.dayDialSun.setAttribute('cx', String(cx));
    this.dayDialSun.setAttribute('cy', String(cy));
  }
}

declare const __APP_VERSION__: string;

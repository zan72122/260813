import { MODEL_LABEL, MODEL_ORDER, type ModelId } from '../sim/models';
import { CHALLENGES } from '../game/challenges';
import {
  iconArch,
  iconBack,
  iconBridge,
  iconFlower,
  iconHand,
  iconPlay,
  iconReset,
  iconSoundOff,
  iconSoundOn,
  iconStar,
  iconWeight,
} from './icons';

export type HudView =
  | { kind: 'title' }
  | { kind: 'lab'; model: ModelId }
  | { kind: 'challengeMenu'; cleared: boolean[] }
  | { kind: 'challenge'; index: number };

export interface HudCallbacks {
  onEnterLab: () => void;
  onEnterChallengeMenu: () => void;
  onSelectModel: (id: ModelId) => void;
  onSelectChallenge: (index: number) => void;
  onBack: () => void;
  onAddWeight: () => void;
  onReset: () => void;
  onRetry: () => void;
  onNext: () => void;
  onToggleSound: () => void;
}

const MODEL_ICON: Record<ModelId, () => string> = {
  bridge: iconBridge,
  arch: iconArch,
  flower: iconFlower,
};

/** 画面の上にかぶせる DOM。指で押しやすい大きなボタンだけ。 */
export class Hud {
  private view: HudView = { kind: 'title' };
  private soundOn = true;
  private progressEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;

  constructor(
    private root: HTMLElement,
    private cb: HudCallbacks,
  ) {
    root.addEventListener('click', this.handleClick);
  }

  private handleClick = (e: Event): void => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-act]');
    if (!target) return;
    const act = target.dataset.act;
    const val = target.dataset.val ?? '';
    switch (act) {
      case 'lab':
        this.cb.onEnterLab();
        break;
      case 'challenge':
        this.cb.onEnterChallengeMenu();
        break;
      case 'model':
        this.cb.onSelectModel(val as ModelId);
        break;
      case 'pick':
        this.cb.onSelectChallenge(Number(val));
        break;
      case 'back':
        this.cb.onBack();
        break;
      case 'weight':
        this.cb.onAddWeight();
        break;
      case 'reset':
        this.cb.onReset();
        break;
      case 'retry':
        this.cb.onRetry();
        break;
      case 'next':
        this.cb.onNext();
        break;
      case 'sound':
        this.cb.onToggleSound();
        break;
    }
  };

  setSound(on: boolean): void {
    this.soundOn = on;
    const btn = this.root.querySelector<HTMLElement>('[data-act="sound"]');
    if (btn) btn.innerHTML = on ? iconSoundOn() : iconSoundOff();
  }

  show(view: HudView): void {
    this.view = view;
    this.root.innerHTML = this.html(view);
    this.progressEl = this.root.querySelector<HTMLElement>('.bar-fill');
    this.overlayEl = null;
  }

  get current(): HudView {
    return this.view;
  }

  setProgress(v: number): void {
    if (this.progressEl) this.progressEl.style.width = `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
  }

  showSuccess(hasNext: boolean): void {
    if (this.overlayEl) return;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <div class="win">
        <div class="stars">${iconStar()}${iconStar()}${iconStar()}</div>
        <div class="win-text">やったー！</div>
        <div class="win-btns">
          <button class="round" data-act="retry" aria-label="もういちど">${iconReset()}</button>
          ${hasNext ? `<button class="round primary" data-act="next" aria-label="つぎ">${iconPlay()}</button>` : ''}
          <button class="round" data-act="back" aria-label="もどる">${iconBack()}</button>
        </div>
      </div>`;
    this.root.appendChild(el);
    this.overlayEl = el;
  }

  hideSuccess(): void {
    this.overlayEl?.remove();
    this.overlayEl = null;
  }

  get successVisible(): boolean {
    return this.overlayEl !== null;
  }

  private topBar(extra = ''): string {
    return `
      <div class="topbar">
        <button class="round" data-act="back" aria-label="もどる">${iconBack()}</button>
        <div class="top-mid">${extra}</div>
        <button class="round" data-act="sound" aria-label="おと">${this.soundOn ? iconSoundOn() : iconSoundOff()}</button>
      </div>`;
  }

  private html(view: HudView): string {
    switch (view.kind) {
      case 'title':
        return `
          <div class="title-screen">
            <div class="title-card">
              <h1>ぎゅっと！<br><span class="accent">にじちからラボ</span></h1>
              <p class="tagline">${iconHand()}<span>おすと にじ</span></p>
            </div>
            <div class="menu">
              <button class="menu-btn lab" data-act="lab">
                <span class="ic">${iconFlower()}</span><span class="tx">ラボ</span>
              </button>
              <button class="menu-btn chal" data-act="challenge">
                <span class="ic">${iconStar('#fff')}</span><span class="tx">チャレンジ</span>
              </button>
            </div>
          </div>`;

      case 'lab': {
        const models = MODEL_ORDER.map(
          (id) => `
            <button class="pill ${id === view.model ? 'on' : ''}" data-act="model" data-val="${id}">
              <span class="ic">${MODEL_ICON[id]()}</span><span class="tx">${MODEL_LABEL[id]}</span>
            </button>`,
        ).join('');
        return `
          ${this.topBar('')}
          <div class="bottombar">
            <div class="pills">${models}</div>
            <div class="tools">
              <button class="round tool" data-act="weight" aria-label="おもり">${iconWeight()}</button>
              <button class="round tool" data-act="reset" aria-label="はじめから">${iconReset()}</button>
            </div>
          </div>`;
      }

      case 'challengeMenu': {
        const cards = CHALLENGES.map(
          (c, i) => `
            <button class="card" data-act="pick" data-val="${i}">
              <span class="card-ic">${c.icon()}</span>
              <span class="card-tx">${c.label}</span>
              ${view.cleared[i] ? `<span class="card-star">${iconStar()}</span>` : ''}
            </button>`,
        ).join('');
        return `${this.topBar('')}<div class="cards">${cards}</div>`;
      }

      case 'challenge': {
        const c = CHALLENGES[view.index];
        return `
          ${this.topBar(`
            <div class="task">
              <span class="task-ic">${c.icon()}</span>
              <span class="task-tx">${c.hint}</span>
            </div>
            <div class="bar"><div class="bar-fill"></div><span class="bar-star">${iconStar()}</span></div>
          `)}`;
      }
    }
  }
}

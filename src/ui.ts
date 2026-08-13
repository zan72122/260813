/** DOM まわりのこまごま。ゲームの状態は game.ts が持つ。 */

import type { SlideDef } from './core/slides';

export type ScreenName = 'title' | 'select' | 'observe' | 'clear';
export type Mode = 'free' | 'quest';

export interface Dom {
  app: HTMLElement;
  canvas: HTMLCanvasElement;
  btnFree: HTMLButtonElement;
  btnQuest: HTMLButtonElement;
  btnSound: HTMLButtonElement;
  btnSelectBack: HTMLButtonElement;
  selectTitle: HTMLElement;
  cards: HTMLElement;
  btnHome: HTMLButtonElement;
  questSwatch: HTMLElement;
  questStars: HTMLElement;
  freeCount: HTMLElement;
  btnPolar: HTMLButtonElement;
  polarText: HTMLElement;
  btnSpin: HTMLButtonElement;
  btnNextSlide: HTMLButtonElement;
  coach: HTMLElement;
  coachEmoji: HTMLElement;
  coachText: HTMLElement;
  btnAgain: HTMLButtonElement;
  btnOther: HTMLButtonElement;
  clearSub: HTMLElement;
}

function need<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`element #${id} not found`);
  return el as T;
}

export function queryDom(): Dom {
  return {
    app: need('app'),
    canvas: need<HTMLCanvasElement>('stage'),
    btnFree: need<HTMLButtonElement>('btn-free'),
    btnQuest: need<HTMLButtonElement>('btn-quest'),
    btnSound: need<HTMLButtonElement>('btn-sound'),
    btnSelectBack: need<HTMLButtonElement>('btn-select-back'),
    selectTitle: need('select-title'),
    cards: need('slide-cards'),
    btnHome: need<HTMLButtonElement>('btn-home'),
    questSwatch: need('quest-swatch'),
    questStars: need('quest-stars'),
    freeCount: need('free-count'),
    btnPolar: need<HTMLButtonElement>('btn-polar'),
    polarText: need('polar-text'),
    btnSpin: need<HTMLButtonElement>('btn-spin'),
    btnNextSlide: need<HTMLButtonElement>('btn-next-slide'),
    coach: need('coach'),
    coachEmoji: need('coach-emoji'),
    coachText: need('coach-text'),
    btnAgain: need<HTMLButtonElement>('btn-again'),
    btnOther: need<HTMLButtonElement>('btn-other'),
    clearSub: need('clear-sub'),
  };
}

export function setScreen(dom: Dom, screen: ScreenName): void {
  dom.app.dataset.screen = screen;
}

export function setMode(dom: Dom, mode: Mode): void {
  dom.app.dataset.mode = mode;
}

export function buildCards(
  dom: Dom,
  slides: SlideDef[],
  cleared: Set<string>,
  onPick: (def: SlideDef) => void,
): void {
  dom.cards.replaceChildren();
  for (const def of slides) {
    const card = document.createElement('button');
    card.className = 'card';
    card.dataset.testid = `card-${def.id}`;
    card.style.setProperty('--c1', def.cardFrom);
    card.style.setProperty('--c2', def.cardTo);
    card.setAttribute('aria-label', def.name);

    const emoji = document.createElement('span');
    emoji.className = 'card-emoji';
    emoji.textContent = def.emoji;

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = def.name;

    const sub = document.createElement('span');
    sub.className = 'card-sub';
    sub.textContent = def.sub;

    const stars = document.createElement('span');
    stars.className = 'card-stars';
    stars.textContent = cleared.has(def.id) ? '⭐⭐⭐' : '';

    card.append(emoji, name, sub, stars);
    card.addEventListener('click', () => onPick(def));
    dom.cards.append(card);
  }
}

export function renderStars(el: HTMLElement, total: number, done: number): void {
  el.textContent = '⭐'.repeat(done) + '☆'.repeat(Math.max(0, total - done));
}

export function showCoach(
  dom: Dom,
  emoji: string,
  text: string,
  where: 'field' | 'switch' = 'field',
): void {
  if (dom.coachText.textContent === text && !dom.coach.hidden) return;
  dom.coachEmoji.textContent = emoji;
  dom.coachText.textContent = text;
  dom.coach.classList.toggle('at-switch', where === 'switch');
  dom.coach.hidden = false;
}

export function hideCoach(dom: Dom): void {
  dom.coach.hidden = true;
  dom.coachText.textContent = '';
}

const STORAGE_KEY = 'kurukuru-cleared-v1';

export function loadCleared(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr: unknown = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveCleared(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* プライベートモードなどでは保存しない */
  }
}

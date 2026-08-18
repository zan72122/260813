import { SaveData, saveSave } from './save';
import { APRON_COLORS, BOWL_RIMS, PLATE_STYLES } from './materials';

const svgNS = 'http://www.w3.org/2000/svg';

function hex(c: number) { return '#' + c.toString(16).padStart(6, '0'); }

/** ミュート/モーション/ホームのアイコン */
const ICONS = {
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a8.5 8.5 0 0 1 0 12"/></svg>',
  soundLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/><line x1="16" y1="9" x2="22" y2="15"/><line x1="22" y1="9" x2="16" y2="15"/></svg>',
  motion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/></svg>',
  motionOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 12h18"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v9h14v-9"/></svg>',
};

function apronIcon(color: string): string {
  return `<svg viewBox="0 0 48 48"><path d="M16 6h16v8c4 2 7 6 7 12v14a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V26c0-6 3-10 7-12z" fill="${color}" stroke="#00000022" stroke-width="1.5"/><path d="M16 6c0 5 3 8 8 8s8-3 8-8" fill="none" stroke="#ffffffaa" stroke-width="2.5"/></svg>`;
}
function bowlIcon(color: string): string {
  return `<svg viewBox="0 0 48 48"><path d="M6 20h36c0 12-8 20-18 20S6 32 6 20z" fill="#e7edf0" stroke="#00000018" stroke-width="1.5"/><rect x="4" y="16" width="40" height="6" rx="3" fill="${color}"/></svg>`;
}
function plateIcon(base: string, accent: string): string {
  let dots = '';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dots += `<circle cx="${24 + Math.cos(a) * 16}" cy="${24 + Math.sin(a) * 16}" r="2.6" fill="${accent}"/>`;
  }
  return `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="${base}" stroke="#00000018" stroke-width="1.5"/><circle cx="24" cy="24" r="12" fill="#ffffff"/>${dots}</svg>`;
}
const replayIcons = {
  restart: '<svg viewBox="0 0 48 48"><circle cx="24" cy="26" r="13" fill="#fdf3d8" stroke="#e0b96a" stroke-width="2"/><path d="M24 6a18 18 0 0 1 18 18" fill="none" stroke="#e78fb3" stroke-width="4.5" stroke-linecap="round"/><path d="M45 19l-3 7-6-4z" fill="#e78fb3"/></svg>',
  stretch: '<svg viewBox="0 0 48 48"><ellipse cx="10" cy="24" rx="7" ry="8" fill="#fdf6e4" stroke="#e0b96a" stroke-width="2"/><ellipse cx="38" cy="24" rx="7" ry="8" fill="#fdf6e4" stroke="#e0b96a" stroke-width="2"/><path d="M14 21c6-3 14-3 20 0M14 27c6 3 14 3 20 0" fill="none" stroke="#e0b96a" stroke-width="2.4" stroke-linecap="round"/></svg>',
  fill: '<svg viewBox="0 0 48 48"><path d="M12 22c0-7 5-11 12-11s12 4 12 11c0 9-5 15-12 15s-12-6-12-15z" fill="#fdf6e4" stroke="#e0b96a" stroke-width="2"/><path d="M20 11l4-5 4 5" fill="none" stroke="#e0b96a" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="27" r="6" fill="#f9e8b8"/></svg>',
};

export type ReplayChoice = 'restart' | 'stretch' | 'fill';

export class UI {
  private layer = document.getElementById('uiLayer')!;
  private topbar: HTMLDivElement;
  private muteBtn: HTMLButtonElement;
  private motionBtn: HTMLButtonElement;
  private homeBtn: HTMLButtonElement;
  private introPanel: HTMLDivElement | null = null;
  private replayPanel: HTMLDivElement | null = null;
  onMuteToggle: (() => void) | null = null;
  onMotionToggle: (() => void) | null = null;
  onHome: (() => void) | null = null;

  constructor() {
    this.topbar = document.createElement('div');
    this.topbar.className = 'topbar';
    this.muteBtn = this.iconBtn(ICONS.sound, () => this.onMuteToggle?.());
    this.motionBtn = this.iconBtn(ICONS.motion, () => this.onMotionToggle?.());
    this.homeBtn = this.iconBtn(ICONS.home, () => this.onHome?.());
    this.topbar.append(this.homeBtn, this.motionBtn, this.muteBtn);
    this.layer.appendChild(this.topbar);
  }

  private iconBtn(svg: string, cb: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'iconbtn';
    b.innerHTML = svg;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', cb);
    return b;
  }

  setMuted(m: boolean) { this.muteBtn.innerHTML = m ? ICONS.muted : ICONS.sound; }
  setVolumeStep(step: number) {
    this.muteBtn.innerHTML = [ICONS.sound, ICONS.soundLow, ICONS.muted][step % 3];
  }
  setMotion(reduced: boolean) { this.motionBtn.innerHTML = reduced ? ICONS.motionOff : ICONS.motion; }

  /** 導入: 装飾選択 + はじめる */
  showIntro(save: SaveData, onStart: () => void) {
    this.hideIntro();
    const panel = document.createElement('div');
    panel.className = 'panel';
    const mkRow = (
      items: string[], selected: number, cb: (i: number) => void,
    ) => {
      const row = document.createElement('div');
      row.className = 'row';
      const btns: HTMLButtonElement[] = [];
      items.forEach((svg, i) => {
        const b = document.createElement('button');
        b.className = 'bigbtn' + (i === selected ? ' selected' : '');
        b.innerHTML = svg;
        b.addEventListener('click', () => {
          btns.forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          cb(i);
        });
        btns.push(b);
        row.appendChild(b);
      });
      return row;
    };
    panel.appendChild(mkRow(
      APRON_COLORS.map(c => apronIcon(hex(c))), save.apron,
      i => { save.apron = i; saveSave(save); this.onDecor?.('apron', i); },
    ));
    panel.appendChild(mkRow(
      BOWL_RIMS.map(c => bowlIcon(hex(c))), save.bowlRim,
      i => { save.bowlRim = i; saveSave(save); this.onDecor?.('bowl', i); },
    ));
    panel.appendChild(mkRow(
      PLATE_STYLES.map(p => plateIcon(hex(p.base), hex(p.accent))), save.plateStyle,
      i => { save.plateStyle = i; saveSave(save); this.onDecor?.('plate', i); },
    ));
    const play = document.createElement('button');
    play.className = 'playbtn';
    play.innerHTML = '<svg viewBox="0 0 24 24" style="width:1.1em;height:1.1em;vertical-align:-0.18em;margin-right:0.3em"><path d="M7 4.5v15l13-7.5z" fill="#7a4a12"/></svg>はじめる！';
    play.addEventListener('click', () => onStart());
    panel.appendChild(play);
    this.layer.appendChild(panel);
    this.introPanel = panel;
  }
  onDecor: ((kind: 'apron' | 'bowl' | 'plate', i: number) => void) | null = null;

  hideIntro() {
    this.introPanel?.remove();
    this.introPanel = null;
  }

  /** リプレイ選択。dismissable なら背景タップで閉じられる */
  showReplay(onChoice: (c: ReplayChoice) => void, dismissable = false) {
    this.hideReplay();
    const panel = document.createElement('div');
    panel.className = 'panel';
    if (dismissable) {
      const backdrop = document.createElement('div');
      backdrop.style.cssText = 'position:absolute;inset:0;pointer-events:auto;';
      backdrop.addEventListener('click', () => this.hideReplay());
      panel.appendChild(backdrop);
    }
    const row = document.createElement('div');
    row.className = 'row';
    row.style.position = 'relative';
    const defs: [ReplayChoice, string, string][] = [
      ['restart', replayIcons.restart, 'さいしょから'],
      ['stretch', replayIcons.stretch, 'びよーんだけ'],
      ['fill', replayIcons.fill, 'トロトロから'],
    ];
    for (const [key, svg, label] of defs) {
      const b = document.createElement('button');
      b.className = 'bigbtn';
      b.innerHTML = svg + `<span class="lbl">${label}</span>`;
      b.addEventListener('click', () => { this.hideReplay(); onChoice(key); });
      row.appendChild(b);
    }
    panel.appendChild(row);
    this.layer.appendChild(panel);
    this.replayPanel = panel;
  }
  hideReplay() {
    this.replayPanel?.remove();
    this.replayPanel = null;
  }
  get replayShown() { return !!this.replayPanel; }
}
void svgNS;

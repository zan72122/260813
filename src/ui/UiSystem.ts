import type { EventBus, GamePhase, QualityTier, ActionIntent, UiSystem as UiSystemContract } from '../core';
import { loadPersistedSettings, persistMuted, persistQuality } from '../accessibility';

// ---- auditorium palette (docs/VISUAL_DIRECTION.md "客席 V2: 青・白・金") ----
const COLOR_DEEP_BLUE = '#2e4a7d';
const COLOR_PALE_BLUE = '#7d95c4';
const COLOR_WARM_WHITE = '#f3ede1';
const COLOR_GOLD = '#c9a54e';
const CHOICE_QUALITY_ORDER: readonly QualityTier[] = ['low', 'medium', 'high'];

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(inner: string, viewBox = '0 0 24 24'): string {
  return `<svg xmlns="${SVG_NS}" viewBox="${viewBox}" width="100%" height="100%" fill="none">${inner}</svg>`;
}

/** Musical note; a diagonal slash overlays it when muted. Text-free per docs/VISUAL_DIRECTION.md UI rule. */
function muteIconSvg(muted: boolean): string {
  const note = `<path d="M9 16.5a2.5 2.5 0 1 1-2.5-2.5 2.5 2.5 0 0 1 2.5 2.5Z" fill="${COLOR_GOLD}"/>
    <path d="M9 16.5V4.8l8-2v10.2" stroke="${COLOR_GOLD}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 12.8a2.5 2.5 0 1 1-2.5-2.5 2.5 2.5 0 0 1 2.5 2.5Z" fill="${COLOR_GOLD}"/>`;
  const slash = muted ? `<line x1="3.5" y1="20.5" x2="20.5" y2="3.5" stroke="${COLOR_WARM_WHITE}" stroke-width="2.4" stroke-linecap="round"/>` : '';
  return svg(note + slash);
}

/** Three ascending bars; filled count communicates the quality tier (low=1, medium=2, high=3). */
function qualityIconSvg(tier: QualityTier): string {
  const filledCount = CHOICE_QUALITY_ORDER.indexOf(tier) + 1;
  const bars = [
    { x: 4, y: 13, h: 7 },
    { x: 10.5, y: 9, h: 11 },
    { x: 17, y: 4, h: 16 }
  ];
  const rects = bars
    .map((bar, i) => {
      const color = i < filledCount ? COLOR_GOLD : COLOR_PALE_BLUE;
      return `<rect x="${bar.x}" y="${bar.y}" width="3.2" height="${bar.h}" rx="1" fill="${color}"/>`;
    })
    .join('');
  return svg(rects);
}

/** Door with an outward arrow — leaves free-rope play back to the choice screen. */
function exitIconSvg(): string {
  return svg(`
    <rect x="4" y="3" width="9" height="18" rx="1" stroke="${COLOR_GOLD}" stroke-width="1.6"/>
    <circle cx="10.5" cy="12" r="0.9" fill="${COLOR_GOLD}"/>
    <path d="M13 12h8M18 8.5 21.5 12 18 15.5" stroke="${COLOR_WARM_WHITE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  `);
}

/** Same-transform replay: a looping arrow around a short rope squiggle. */
function replayIconSvg(): string {
  return svg(`
    <path d="M12 4a8 8 0 1 1-6.9 4" stroke="${COLOR_DEEP_BLUE}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M5.5 4v4.4h4.4" stroke="${COLOR_DEEP_BLUE}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M9.5 15c1-1.6 3.5-1.6 4.5 0s3.5 1.6 4.5 0" stroke="${COLOR_GOLD}" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  `, '0 0 24 24');
}

/** A different scene: two overlapping picture frames (a room silhouette and a tree silhouette). */
function otherSceneIconSvg(): string {
  return svg(`
    <rect x="2.5" y="4" width="12" height="16" rx="1" fill="${COLOR_PALE_BLUE}" opacity="0.9"/>
    <path d="M5 20V13l3-4 3 4v7z" fill="${COLOR_DEEP_BLUE}"/>
    <rect x="9.5" y="4" width="12" height="16" rx="1" fill="none" stroke="${COLOR_GOLD}" stroke-width="1.6"/>
    <circle cx="18.5" cy="9" r="2.4" fill="${COLOR_GOLD}"/>
  `, '0 0 24 24');
}

/** Free rope play: a hand shape gripping a loose, un-looped rope. */
function freeRopeIconSvg(): string {
  return svg(`
    <path d="M8 21c-3-6-2-11 2-15" stroke="${COLOR_GOLD}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M14 4c1.8 3.6 1.8 8-1 12" stroke="${COLOR_GOLD}" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.6"/>
    <rect x="9.5" y="12.5" width="7" height="5.5" rx="2.4" fill="${COLOR_DEEP_BLUE}"/>
    <path d="M10.5 12.5v-1.2a1.5 1.5 0 0 1 3 0v1.2M13.5 12.5v-1.9a1.5 1.5 0 0 1 3 0v1.9" stroke="${COLOR_DEEP_BLUE}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  `, '0 0 24 24');
}

interface ChoiceButtonSpec {
  readonly className: string;
  readonly ariaLabel: string;
  readonly icon: string;
  /** Wave 3: emitted directly as ActionIntent{kind:'choiceSelect'} instead of a synthetic tap. */
  readonly option: 'replay' | 'other' | 'free';
}

const CHOICE_BUTTONS: readonly ChoiceButtonSpec[] = [
  { className: 'sus-choice-replay', ariaLabel: 'play the same transformation again', icon: replayIconSvg(), option: 'replay' },
  { className: 'sus-choice-otherScene', ariaLabel: 'go to a different scenery', icon: otherSceneIconSvg(), option: 'other' },
  { className: 'sus-choice-freeRope', ariaLabel: 'pull the rope freely', icon: freeRopeIconSvg(), option: 'free' }
];

/**
 * Real icon-only UI (no words, per docs/VISUAL_DIRECTION.md): a small
 * mute/quality corner cluster, an exit-free-play button (freePlay phase
 * only), and the after-finale choice screen (3 large picture buttons).
 *
 * Takes the shared EventBus via its constructor (`new UiSystem(bus)`), not
 * via mount() — see src/core/interfaces.ts's UiSystem doc comment for the
 * documented construction convention. Wave 3: App.ts wires this in as the
 * real implementation, and the choice buttons emit ActionIntent{kind:
 * 'choiceSelect'} directly instead of a synthetic positional 'tap'.
 */
export class UiSystem implements UiSystemContract {
  private root: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private muteButton: HTMLButtonElement | null = null;
  private qualityButton: HTMLButtonElement | null = null;
  private exitButton: HTMLButtonElement | null = null;
  private choiceOverlay: HTMLDivElement | null = null;
  private unsubscribers: Array<() => void> = [];

  private muted: boolean;
  private quality: QualityTier;
  private phase: GamePhase = 'boot';

  constructor(private readonly bus: EventBus) {
    const persisted = loadPersistedSettings();
    this.muted = persisted.muted ?? false;
    this.quality = persisted.quality ?? 'medium';
  }

  mount(root: HTMLElement, onIntent: (intent: ActionIntent) => void): void {
    this.root = root;

    const container = document.createElement('div');
    container.className = 'sus-ui';
    container.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:sans-serif;';
    this.container = container;

    this.muteButton = this.makeCornerButton('sus-mute', 'top', 'right', 0, muteIconSvg(this.muted), 'toggle mute', () => {
      this.muted = !this.muted;
      persistMuted(this.muted);
      this.refreshIcons();
      onIntent({ kind: 'uiToggle', control: 'mute' });
    });

    this.qualityButton = this.makeCornerButton(
      'sus-quality',
      'top',
      'right',
      1,
      qualityIconSvg(this.quality),
      'toggle quality',
      () => {
        const idx = CHOICE_QUALITY_ORDER.indexOf(this.quality);
        this.quality = CHOICE_QUALITY_ORDER[(idx + 1) % CHOICE_QUALITY_ORDER.length]!;
        persistQuality(this.quality);
        this.refreshIcons();
        onIntent({ kind: 'uiToggle', control: 'quality' });
      }
    );

    this.exitButton = this.makeCornerButton('sus-exit', 'top', 'left', 0, exitIconSvg(), 'exit free play', () => {
      onIntent({ kind: 'uiToggle', control: 'exitFree' });
    });
    this.exitButton.style.display = 'none';

    container.appendChild(this.muteButton);
    container.appendChild(this.qualityButton);
    container.appendChild(this.exitButton);

    this.choiceOverlay = this.buildChoiceOverlay(onIntent);
    container.appendChild(this.choiceOverlay);

    root.appendChild(container);

    this.unsubscribers.push(
      this.bus.on('phaseChanged', (event) => this.onPhaseChanged(event.to)),
      this.bus.on('qualityChanged', (event) => {
        this.quality = event.tier;
        this.refreshIcons();
      })
    );

    this.onPhaseChanged(this.phase);
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    if (this.container && this.root && this.container.parentElement === this.root) {
      this.root.removeChild(this.container);
    }
    this.root = null;
    this.container = null;
    this.muteButton = null;
    this.qualityButton = null;
    this.exitButton = null;
    this.choiceOverlay = null;
  }

  private onPhaseChanged(phase: GamePhase): void {
    this.phase = phase;
    if (this.exitButton) this.exitButton.style.display = phase === 'freePlay' ? '' : 'none';
    if (this.choiceOverlay) {
      const visible = phase === 'choice';
      this.choiceOverlay.style.display = visible ? 'flex' : 'none';
      this.choiceOverlay.style.pointerEvents = visible ? 'auto' : 'none';
    }
  }

  private refreshIcons(): void {
    if (this.muteButton) this.muteButton.innerHTML = muteIconSvg(this.muted);
    if (this.qualityButton) this.qualityButton.innerHTML = qualityIconSvg(this.quality);
  }

  private makeCornerButton(
    testClass: string,
    vAnchor: 'top' | 'bottom',
    hAnchor: 'left' | 'right',
    slot: number,
    iconHtml: string,
    ariaLabel: string,
    onClick: () => void
  ): HTMLButtonElement {
    const SIZE = 44;
    const GAP = 8;
    const MARGIN = 10;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sus-btn ${testClass}`;
    button.setAttribute('aria-label', ariaLabel);
    const offset = MARGIN + slot * (SIZE + GAP);
    button.style.cssText = `
      position:absolute; ${vAnchor}:${MARGIN}px; ${hAnchor}:${offset}px;
      width:${SIZE}px; height:${SIZE}px; border-radius:50%;
      background:${COLOR_DEEP_BLUE}; border:1.5px solid ${COLOR_GOLD};
      padding:9px; box-sizing:border-box; pointer-events:auto; cursor:pointer;
      box-shadow:0 1px 4px rgba(0,0,0,0.35); touch-action:manipulation;
    `.trim();
    button.innerHTML = iconHtml;
    button.addEventListener('click', onClick);
    return button;
  }

  private buildChoiceOverlay(onIntent: (intent: ActionIntent) => void): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'sus-choice';
    overlay.style.cssText = `
      position:absolute; inset:0; display:none; pointer-events:none;
      align-items:center; justify-content:center; gap:5vmin;
      background:linear-gradient(180deg, rgba(46,74,125,0.55), rgba(10,8,20,0.75));
    `.trim();

    for (const spec of CHOICE_BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sus-choice-btn ${spec.className}`;
      button.setAttribute('aria-label', spec.ariaLabel);
      button.style.cssText = `
        width:min(26vw, 26vh, 160px); height:min(26vw, 26vh, 160px);
        border-radius:18px; background:${COLOR_WARM_WHITE}; border:3px solid ${COLOR_GOLD};
        padding:16%; box-sizing:border-box; pointer-events:auto; cursor:pointer;
        box-shadow:0 4px 14px rgba(0,0,0,0.4);
      `.trim();
      button.innerHTML = spec.icon;
      button.addEventListener('click', () => {
        onIntent({ kind: 'choiceSelect', option: spec.option });
      });
      overlay.appendChild(button);
    }

    return overlay;
  }
}

/**
 * Null-object stub — kept as the documented fallback path. `App.ts` (owned by
 * the Integrator, read-only for this area) currently wires this in; swapping
 * in the real `UiSystem` above requires an App.ts change (see report).
 */
export class NullUiSystem implements UiSystemContract {
  mount(_root: HTMLElement, _onIntent: (intent: ActionIntent) => void): void {
    // TODO(owner C): render icon UI, subscribe to bus, forward uiToggle via onIntent.
  }

  dispose(): void {
    // TODO(owner C): remove DOM nodes, unsubscribe from bus.
  }
}

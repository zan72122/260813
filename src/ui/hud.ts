import { STYLE, TIMING } from '../style';

/**
 * The only 2D layer: an intro wordmark that dissolves, and a wordless
 * replay glyph after the reveal. No cards, no panels, no text instructions.
 */
export class Hud {
  private root: HTMLDivElement;
  private title: HTMLDivElement;
  private replay: HTMLButtonElement;
  onReplay: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = `
      position: fixed; inset: 0; pointer-events: none;
      font-family: ${STYLE.ui.font};
    `;

    // Title wordmark — thin brass line + name, fades away as play begins.
    this.title = document.createElement('div');
    this.title.style.cssText = `
      position: absolute; left: 50%; transform: translateX(-50%);
      top: calc(env(safe-area-inset-top, 0px) + 7%);
      color: ${STYLE.palette.uiInk}; text-align: center;
      opacity: 0; transition: opacity 1.8s ease;
      letter-spacing: 0.35em; text-indent: 0.35em;
      font-size: clamp(15px, 2.6vw, 22px); font-weight: 500;
      text-shadow: 0 1px 14px rgba(10, 20, 40, 0.55);
    `;
    this.title.innerHTML = `
      <div style="font-size: 0.55em; letter-spacing: 0.6em; text-indent: 0.6em;
                  color: ${STYLE.palette.uiLine}; margin-bottom: 0.7em;">✦</div>
      <div style="white-space: nowrap;">ウォーターフォール</div>
      <div style="white-space: nowrap; margin-top: 0.35em;">ヘアガーデン</div>
      <div style="margin: 0.9em auto 0; width: 3.5em; height: 1px;
                  background: linear-gradient(90deg, transparent, ${STYLE.palette.uiLine}, transparent);"></div>
    `;
    this.root.appendChild(this.title);

    // Replay — a quiet circular glyph, bottom center, appears after the afterglow.
    const size = STYLE.ui.replayButtonSize;
    this.replay = document.createElement('button');
    this.replay.setAttribute('aria-label', 'もういちど');
    this.replay.style.cssText = `
      position: absolute; left: 50%; transform: translateX(-50%) scale(0.9);
      bottom: calc(env(safe-area-inset-bottom, 0px) + 6%);
      width: ${size}px; height: ${size}px; border-radius: ${STYLE.ui.replayCornerRadius};
      border: ${STYLE.ui.lineWeight}px solid ${STYLE.palette.uiLine};
      background: rgba(21, 34, 56, 0.35);
      backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      color: ${STYLE.palette.uiLine}; cursor: pointer;
      opacity: 0; pointer-events: none;
      transition: opacity ${TIMING.replayFadeIn}s ease, transform ${TIMING.replayFadeIn}s ease;
      display: flex; align-items: center; justify-content: center;
      -webkit-tap-highlight-color: transparent; outline: none; padding: 0;
    `;
    this.replay.innerHTML = `
      <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none"
           stroke="${STYLE.palette.uiLine}" stroke-width="1.6" stroke-linecap="round">
        <path d="M 12 4 A 8 8 0 1 1 5.2 7.8" />
        <path d="M 5.5 3.5 L 5.2 7.8 L 9.4 7.6" />
      </svg>
    `;
    this.replay.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.replay.addEventListener('click', () => this.onReplay?.());
    this.root.appendChild(this.replay);

    container.appendChild(this.root);
  }

  showTitle(): void {
    requestAnimationFrame(() => (this.title.style.opacity = '0.92'));
  }

  hideTitle(): void {
    this.title.style.opacity = '0';
  }

  showReplay(): void {
    this.replay.style.pointerEvents = 'auto';
    this.replay.style.opacity = String(STYLE.ui.uiOpacity);
    this.replay.style.transform = 'translateX(-50%) scale(1)';
  }

  hideReplay(): void {
    this.replay.style.pointerEvents = 'none';
    this.replay.style.opacity = '0';
    this.replay.style.transform = 'translateX(-50%) scale(0.9)';
  }
}

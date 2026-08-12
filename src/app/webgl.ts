/**
 * WebGL2 capability detection and the friendly no-text fallback card.
 * ARCHITECTURE_CONTRACT "Error policy": "WebGL2 unavailable → friendly
 * static fallback card (drawn, no text dependency) with a picture of the
 * elevator; no crash."
 */

import { PALETTE } from '../contracts/constants.ts';

export function isWebGL2Supported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
}

/**
 * A small hand-drawn inline SVG: the tower's inclined leg with a yellow
 * cabin partway up. No text, no external resources, so it works even when
 * WebGL2 (and therefore the whole 3D scene) is unavailable.
 */
function elevatorIllustrationSvg(): string {
  return `<svg viewBox="0 0 200 260" width="100%" height="100%" role="img" aria-label="elevator" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="200" height="260" fill="${PALETTE.skyZenith}" />
    <rect x="0" y="180" width="200" height="80" fill="${PALETTE.skyHorizon}" />
    <g stroke="${PALETTE.iron}" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M 70 250 L 130 30" />
      <path d="M 130 250 L 70 30" />
      <path d="M 76 210 L 124 210" />
      <path d="M 82 170 L 118 170" />
      <path d="M 88 130 L 112 130" />
      <path d="M 94 90 L 106 90" />
    </g>
    <g transform="translate(100 150) rotate(-36)">
      <rect x="-18" y="-14" width="36" height="28" rx="4" fill="${PALETTE.cabinOchre}" stroke="${PALETTE.iron}" stroke-width="2" />
      <circle cx="0" cy="0" r="5" fill="${PALETTE.waterTeal}" />
    </g>
    <circle cx="100" cy="30" r="10" fill="${PALETTE.brass}" stroke="${PALETTE.iron}" stroke-width="2" />
  </svg>`;
}

/** Render the fallback card into `root`, replacing its contents. */
export function renderFallbackCard(root: HTMLElement): void {
  root.replaceChildren();
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'width:100%',
    'height:100%',
    `background:${PALETTE.skyZenith}`,
  ].join(';');
  const figure = document.createElement('div');
  figure.style.cssText = 'width:min(70vmin,480px);height:min(90vmin,620px);';
  figure.innerHTML = elevatorIllustrationSvg();
  wrap.appendChild(figure);
  root.appendChild(wrap);
}

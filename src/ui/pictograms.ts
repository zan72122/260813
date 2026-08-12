// src/ui/pictograms.ts — pure SVG-string builders. No DOM access: every
// export returns a markup string the caller assigns to `.innerHTML`. Kept
// pure (and framework-free) so pictogram shape logic is unit-testable
// without a browser, per docs/ARCHITECTURE_CONTRACT.md's "no reading
// required" mandate — every icon must read as a recognizable pictogram at
// a glance, clear at 72px.

import type { HintGesture } from './hints';

const SVG_OPEN = (viewBox: string, extraClass = '') =>
  `<svg viewBox="${viewBox}" class="${extraClass}" aria-hidden="true" focusable="false">`;
const SVG_CLOSE = '</svg>';

/** A simple mitten-style hand blob, reused (rotated/flipped by caller CSS) across gestures. */
function handPath(): string {
  return (
    'M22 46c-3 0-6-2-6-6v-8c0-3 2-5 4-5s4 2 4 5v2c0-3 2-5 4-5s4 2 4 5v1c0-3 2-5 4-5s4 2 4 5v3c2-1 4 0 5 2 2 3 1 8-2 12l-5 7c-3 3-6 4-10 4h-3c-5 0-9-3-9-8z'
  );
}

function arrowRotationForGesture(gesture: HintGesture): number {
  switch (gesture) {
    case 'drag-down':
      return 90;
    case 'drag-up':
      return -90;
    case 'drag-to':
      return 45;
    case 'swipe-right':
      return 0;
    default:
      return 0;
  }
}

const GESTURES_WITH_ARROW: readonly HintGesture[] = ['drag-down', 'drag-up', 'drag-to', 'swipe-right'];
const GESTURES_WITH_PULSE: readonly HintGesture[] = ['tap', 'tap-hold'];

/** Hand + directional arrow (or a tap pulse ring for tap/tap-hold gestures). */
export function buildHintPictogram(gesture: HintGesture): string {
  const rotation = arrowRotationForGesture(gesture);
  const hasArrow = GESTURES_WITH_ARROW.includes(gesture);
  const hasPulse = GESTURES_WITH_PULSE.includes(gesture);
  const pulse = hasPulse
    ? '<circle class="hint-pulse-ring" cx="48" cy="42" r="16"></circle>'
    : '';
  const arrow = hasArrow
    ? `<g class="hint-arrow-group" transform="rotate(${rotation} 48 26)"><path class="hint-arrow" d="M18 26h38m-12-12 12 12-12 12"></path></g>`
    : '';
  const hand = `<path class="hint-hand" d="${handPath()}" transform="translate(14 40)"></path>`;
  return `${SVG_OPEN('0 0 96 96', 'hint-svg')}${pulse}${arrow}${hand}${SVG_CLOSE}`;
}

/** Two identical parallel I-beams — "same beam shape" replay option. */
export function sameBeamIcon(): string {
  const beam = (x: number) =>
    `<g transform="translate(${x} 14)">` +
    '<rect x="0" y="0" width="16" height="68" rx="2" fill="currentColor"></rect>' +
    '<line x1="3" y1="10" x2="13" y2="18" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '<line x1="3" y1="26" x2="13" y2="34" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '<line x1="3" y1="42" x2="13" y2="50" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '<line x1="3" y1="58" x2="13" y2="66" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '</g>';
  return `${SVG_OPEN('0 0 96 96', 'menu-icon menu-icon-tower')}${beam(28)}${beam(52)}${SVG_CLOSE}`;
}

/** A straight girder next to an X-braced panel — "different beam shape". */
export function differentBeamIcon(): string {
  const girder =
    '<g transform="translate(20 14)">' +
    '<rect x="0" y="0" width="16" height="68" rx="2" fill="currentColor"></rect>' +
    '<line x1="3" y1="14" x2="13" y2="22" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '<line x1="3" y1="34" x2="13" y2="42" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '<line x1="3" y1="54" x2="13" y2="62" stroke="var(--iron-900)" stroke-width="2"></line>' +
    '</g>';
  const xpanel =
    '<g transform="translate(54 14)">' +
    '<rect x="0" y="0" width="20" height="68" rx="2" fill="none" stroke="currentColor" stroke-width="4"></rect>' +
    '<line x1="0" y1="0" x2="20" y2="34" stroke="currentColor" stroke-width="3"></line>' +
    '<line x1="20" y1="0" x2="0" y2="34" stroke="currentColor" stroke-width="3"></line>' +
    '<line x1="0" y1="34" x2="20" y2="68" stroke="currentColor" stroke-width="3"></line>' +
    '<line x1="20" y1="34" x2="0" y2="68" stroke="currentColor" stroke-width="3"></line>' +
    '</g>';
  const swap =
    '<path d="M12 48a34 34 0 0 1 58-18m6 6v-10h-10M84 48a34 34 0 0 1-58 18m-6-6v10h10" ' +
    'fill="none" stroke="var(--brass-400)" stroke-width="3" stroke-linecap="round"></path>';
  return `${SVG_OPEN('0 0 96 96', 'menu-icon menu-icon-shuffle')}${swap}${girder}${xpanel}${SVG_CLOSE}`;
}

/** A rivet head with radiating heat lines — "play rivet". */
export function glowingRivetIcon(): string {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map(
      (deg) =>
        `<line x1="48" y1="48" x2="48" y2="18" transform="rotate(${deg} 48 48)" ` +
        'stroke="var(--heat-hot)" stroke-width="3" stroke-linecap="round" opacity="0.85"></line>',
    )
    .join('');
  return (
    `${SVG_OPEN('0 0 96 96', 'menu-icon menu-icon-rivet')}` +
    rays +
    '<circle cx="48" cy="48" r="20" fill="var(--heat-hot)"></circle>' +
    '<circle cx="48" cy="48" r="20" fill="none" stroke="var(--tower-700)" stroke-width="3"></circle>' +
    '<circle cx="42" cy="42" r="5" fill="var(--heat-white)" opacity="0.8"></circle>' +
    SVG_CLOSE
  );
}

/** A crane silhouette on a rail with an upward chevron — "play climb". */
export function climbingCraneIcon(): string {
  return (
    `${SVG_OPEN('0 0 96 96', 'menu-icon menu-icon-climb')}` +
    '<rect x="14" y="78" width="68" height="6" rx="2" fill="currentColor"></rect>' +
    '<rect x="40" y="20" width="10" height="58" fill="currentColor"></rect>' +
    '<path d="M45 20 74 34v6L45 34Z" fill="currentColor"></path>' +
    '<line x1="70" y1="36" x2="70" y2="52" stroke="currentColor" stroke-width="3"></line>' +
    '<rect x="63" y="52" width="14" height="10" rx="2" fill="var(--brass-400)"></rect>' +
    '<path d="M30 30 20 18m0 0h9m-9 0v9" fill="none" stroke="var(--heat-hot)" stroke-width="4" ' +
    'stroke-linecap="round" stroke-linejoin="round"></path>' +
    SVG_CLOSE
  );
}

/** Speaker with sound waves; waves are replaced by a strike-through when muted. */
export function speakerIcon(muted: boolean): string {
  const cone =
    '<path d="M18 30v12h8l12 10V20l-12 10z" fill="currentColor"></path>';
  const waves = muted
    ? '<path d="M44 30 58 44M58 30 44 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>'
    : '<path d="M44 26a16 16 0 0 1 0 20M50 20a24 24 0 0 1 0 32" fill="none" stroke="currentColor" ' +
      'stroke-width="3.5" stroke-linecap="round"></path>';
  return `${SVG_OPEN('0 0 72 64')}${cone}${waves}${SVG_CLOSE}`;
}

export function pauseIcon(): string {
  return (
    `${SVG_OPEN('0 0 64 64')}` +
    '<rect x="18" y="14" width="10" height="36" rx="2" fill="currentColor"></rect>' +
    '<rect x="36" y="14" width="10" height="36" rx="2" fill="currentColor"></rect>' +
    SVG_CLOSE
  );
}

export function playIcon(): string {
  return `${SVG_OPEN('0 0 64 64')}<path d="M22 14v36l28-18z" fill="currentColor"></path>${SVG_CLOSE}`;
}

export function backArrowIcon(): string {
  return (
    `${SVG_OPEN('0 0 64 64')}` +
    '<path d="M40 16 22 32l18 16M24 32h22" fill="none" stroke="currentColor" stroke-width="6" ' +
    'stroke-linecap="round" stroke-linejoin="round"></path>' +
    SVG_CLOSE
  );
}

/** Steam-pressure gauge dial used on the loading screen. */
export function buildSteamGaugeSvg(): string {
  const ticks = [-58, -43.5, -29, -14.5, 0, 14.5, 29, 43.5, 58]
    .map(
      (deg) =>
        `<line class="gauge-tick" x1="50" y1="12" x2="50" y2="19" transform="rotate(${deg} 50 50)"></line>`,
    )
    .join('');
  return (
    `${SVG_OPEN('0 0 100 100')}` +
    '<circle class="gauge-face" cx="50" cy="50" r="44"></circle>' +
    '<path class="gauge-arc-hot" d="M18 76 A40 40 0 0 1 28 24"></path>' +
    ticks +
    '<line class="gauge-needle" x1="50" y1="50" x2="50" y2="16"></line>' +
    '<circle class="gauge-hub" cx="50" cy="50" r="6"></circle>' +
    SVG_CLOSE
  );
}

/** Lever handle for the title-screen brass plate. */
export function leverIcon(): string {
  return (
    `${SVG_OPEN('0 0 64 64')}` +
    '<circle cx="32" cy="46" r="8" fill="currentColor"></circle>' +
    '<rect x="28" y="12" width="8" height="34" rx="4" fill="currentColor"></rect>' +
    '<circle cx="32" cy="16" r="7" fill="currentColor"></circle>' +
    SVG_CLOSE
  );
}

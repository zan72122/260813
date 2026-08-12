/**
 * Big brass level wheel (PRODUCT_SPEC verb 3), bottom-center during
 * `transition`. `EiffelUiLayer` drives `spinBy` from
 * `rotationDeltaRadians` drag deltas (purely a responsive visual — the
 * leveling assist itself lives in gameplay) and `setBubbleTiltDeg` from
 * `snapshot.cabinWorldTiltDeg` so the child sees cause -> effect.
 */

import { PALETTE } from '../../contracts/constants.ts';
import { DATA_TESTID } from '../../contracts/testing.ts';
import { bubbleLevelGlyph } from '../icons.ts';
import { appendAll, svgEl, svgRoot } from '../svg.ts';

/** Decorative amplification of cabinWorldTiltDeg for the hub bubble, purely
 * a visual-legibility choice (NOT a MATH_CONTRACT motion quantity) — the
 * hard physics clamp stays CABIN_MAX_WORLD_TILT_DEG regardless of how this
 * indicator is drawn. */
const BUBBLE_VISUAL_GAIN = 3.5;

export interface LevelWheelHandle {
  readonly root: HTMLElement;
  /** Rotate the wheel face by an additional signed delta (radians), accumulating. */
  spinBy(deltaRadians: number): void;
  /** Mirror the cabin's current world tilt in the hub's bubble-level pictogram. */
  setBubbleTiltDeg(tiltDeg: number): void;
}

export function createLevelWheel(): LevelWheelHandle {
  const root = document.createElement('div');
  root.className = 'eiffel-control eiffel-wheel';
  root.dataset.testid = DATA_TESTID.levelWheel;

  const face = document.createElement('div');
  face.className = 'eiffel-wheel-face';
  face.appendChild(buildWheelSvg());
  root.appendChild(face);

  const hub = document.createElement('div');
  hub.className = 'eiffel-wheel-hub';
  const bubble = bubbleLevelGlyph();
  hub.appendChild(bubble);
  root.appendChild(hub);

  let angle = 0;

  function spinBy(deltaRadians: number): void {
    angle += deltaRadians;
    face.style.setProperty('--eiffel-wheel-angle', `${angle}rad`);
  }

  function setBubbleTiltDeg(tiltDeg: number): void {
    bubble.style.setProperty('--eiffel-bubble-tilt', `${(-tiltDeg * BUBBLE_VISUAL_GAIN).toFixed(2)}deg`);
  }

  return { root, spinBy, setBubbleTiltDeg };
}

/** A brass spoked wheel face, drawn (not photographic), matching the museum-cutaway palette. */
function buildWheelSvg(): SVGSVGElement {
  const svg = svgRoot('0 0 100 100', 'eiffel-wheel-svg');
  const spokes: SVGElement[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i * Math.PI) / 3;
    spokes.push(
      svgEl('line', {
        x1: 50,
        y1: 50,
        x2: 50 + 42 * Math.cos(a),
        y2: 50 + 42 * Math.sin(a),
        stroke: PALETTE.iron,
        'stroke-width': 6,
        'stroke-linecap': 'round',
      }),
    );
  }
  appendAll(svg, [
    svgEl('circle', { cx: 50, cy: 50, r: 46, fill: 'none', stroke: PALETTE.brass, 'stroke-width': 9 }),
    ...spokes,
    svgEl('circle', { cx: 50, cy: 50, r: 12, fill: PALETTE.brass, stroke: PALETTE.iron, 'stroke-width': 2 }),
  ]);
  return svg;
}

/**
 * Hand-drawn inline-SVG pictograms. Museum-cutaway palette only (brass /
 * iron / cabin ochre) — VISUAL_ACCEPTANCE's forbidden list (no neon, no
 * dashboard glyphs) applies to controls too. No text, no emoji.
 */

import { PALETTE } from '../contracts/constants.ts';
import { appendAll, svgEl, svgRoot } from './svg.ts';

const IRON = PALETTE.iron;
const BRASS = PALETTE.brass;
const OCHRE = PALETTE.cabinOchre;
const CREAM = '#f6ecd9';

/** Pause (two bars) / resume (triangle) corner-button glyph. */
export function pauseGlyph(mode: 'pause' | 'play'): SVGSVGElement {
  const svg = svgRoot('0 0 48 48', 'eiffel-icon');
  if (mode === 'pause') {
    appendAll(svg, [
      svgEl('rect', { x: 14, y: 12, width: 7, height: 24, rx: 2, fill: CREAM }),
      svgEl('rect', { x: 27, y: 12, width: 7, height: 24, rx: 2, fill: CREAM }),
    ]);
  } else {
    svg.appendChild(svgEl('path', { d: 'M17 12 L34 24 L17 36 Z', fill: CREAM }));
  }
  return svg;
}

/** Bell / mute-bell corner-button glyph. */
export function soundGlyph(enabled: boolean): SVGSVGElement {
  const svg = svgRoot('0 0 48 48', 'eiffel-icon');
  appendAll(svg, [
    svgEl('path', {
      d: 'M24 10c-6 0-9 5-9 11v6l-3 5h24l-3-5v-6c0-6-3-11-9-11z',
      fill: CREAM,
    }),
    svgEl('path', { d: 'M20 34a4 4 0 0 0 8 0z', fill: CREAM }),
  ]);
  if (!enabled) {
    svg.appendChild(
      svgEl('line', {
        x1: 9,
        y1: 9,
        x2: 39,
        y2: 39,
        stroke: OCHRE,
        'stroke-width': 4.5,
        'stroke-linecap': 'round',
      }),
    );
  }
  return svg;
}

/** Solid up/down triangle for throttle faces. */
export function directionGlyph(direction: 1 | -1): SVGSVGElement {
  const svg = svgRoot('0 0 48 48', 'eiffel-icon');
  const path =
    direction === 1 ? 'M24 12 L36 32 L12 32 Z' : 'M24 36 L12 16 L36 16 Z';
  svg.appendChild(svgEl('path', { d: path, fill: CREAM }));
  return svg;
}

/** Small pointing-hand pictogram used by the idle ghost-hand demo. */
export function handGlyph(): SVGSVGElement {
  const svg = svgRoot('0 0 48 48', 'eiffel-icon eiffel-hand-glyph');
  appendAll(svg, [
    svgEl('path', {
      d: 'M20 44V24a3 3 0 0 1 6 0v6l2-1a3 3 0 0 1 4 4l-1 8a6 6 0 0 1-6 6h-1a10 10 0 0 1-4-4z',
      fill: CREAM,
      stroke: IRON,
      'stroke-width': 1.5,
    }),
    svgEl('circle', { cx: 23, cy: 18, r: 5, fill: CREAM, stroke: IRON, 'stroke-width': 1.5 }),
  ]);
  return svg;
}

/** Replay tile: ochre cabin box with an up arrow — "ride again". */
export function replayAgainGlyph(): SVGSVGElement {
  const svg = svgRoot('0 0 64 64', 'eiffel-icon');
  appendAll(svg, [
    svgEl('rect', { x: 20, y: 30, width: 24, height: 22, rx: 3, fill: OCHRE, stroke: IRON, 'stroke-width': 2 }),
    svgEl('rect', { x: 26, y: 38, width: 12, height: 14, fill: CREAM, opacity: 0.85 }),
    svgEl('path', { d: 'M32 8 L44 24 L20 24 Z', fill: BRASS, stroke: IRON, 'stroke-width': 2 }),
  ]);
  return svg;
}

/** Replay tile: ochre cabin box with a down arrow — "ride down". */
export function replayDescendGlyph(): SVGSVGElement {
  const svg = svgRoot('0 0 64 64', 'eiffel-icon');
  appendAll(svg, [
    svgEl('rect', { x: 20, y: 12, width: 24, height: 22, rx: 3, fill: OCHRE, stroke: IRON, 'stroke-width': 2 }),
    svgEl('rect', { x: 26, y: 18, width: 12, height: 14, fill: CREAM, opacity: 0.85 }),
    svgEl('path', { d: 'M32 56 L44 40 L20 40 Z', fill: BRASS, stroke: IRON, 'stroke-width': 2 }),
  ]);
  return svg;
}

/** Replay tile: two brass pistons — "machine room free play". */
export function replayMachineGlyph(): SVGSVGElement {
  const svg = svgRoot('0 0 64 64', 'eiffel-icon');
  appendAll(svg, [
    svgEl('rect', { x: 8, y: 44, width: 48, height: 8, rx: 2, fill: IRON }),
    svgEl('rect', { x: 14, y: 26, width: 14, height: 18, rx: 2, fill: BRASS, stroke: IRON, 'stroke-width': 2 }),
    svgEl('rect', { x: 36, y: 20, width: 14, height: 24, rx: 2, fill: BRASS, stroke: IRON, 'stroke-width': 2 }),
    svgEl('circle', { cx: 21, cy: 20, r: 5, fill: IRON }),
    svgEl('circle', { cx: 43, cy: 14, r: 5, fill: IRON }),
  ]);
  return svg;
}

/** Replay tile: track bending steeper — "slope-change replay". */
export function replayTransitionGlyph(): SVGSVGElement {
  const svg = svgRoot('0 0 64 64', 'eiffel-icon');
  svg.appendChild(
    svgEl('path', {
      d: 'M10 54 L30 34 A14 14 0 0 1 40 22 L46 8',
      fill: 'none',
      stroke: BRASS,
      'stroke-width': 5,
      'stroke-linecap': 'round',
    }),
  );
  appendAll(svg, [
    svgEl('circle', { cx: 10, cy: 54, r: 3.5, fill: IRON }),
    svgEl('circle', { cx: 46, cy: 8, r: 3.5, fill: IRON }),
  ]);
  return svg;
}

/** Thick bubble-level pictogram for the level-wheel hub. */
export function bubbleLevelGlyph(): SVGSVGElement {
  const svg = svgRoot('0 0 48 16', 'eiffel-icon eiffel-bubble-glyph');
  appendAll(svg, [
    svgEl('rect', { x: 1, y: 1, width: 46, height: 14, rx: 7, fill: 'none', stroke: IRON, 'stroke-width': 2 }),
    svgEl('line', { x1: 24, y1: 1, x2: 24, y2: 15, stroke: IRON, 'stroke-width': 1.5, opacity: 0.5 }),
    svgEl('circle', { cx: 24, cy: 8, r: 5.5, fill: PALETTE.waterTeal, class: 'eiffel-bubble-dot' }),
  ]);
  return svg;
}

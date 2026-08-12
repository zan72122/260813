// src/ui/icons.ts
// All icons are code-drawn SVG — no emoji, no external fonts, no image
// assets (MASTER_SPEC non-goals / ACCEPTANCE A9). Every function returns a
// fresh <svg> element sized to fill its button via CSS.

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(viewBox: string): SVGSVGElement {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('width', '100%');
  el.setAttribute('height', '100%');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  return el;
}

function path(d: string, fill: string): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  el.setAttribute('d', d);
  el.setAttribute('fill', fill);
  return el;
}

function circle(cx: number, cy: number, r: number, fill: string): SVGCircleElement {
  const el = document.createElementNS(SVG_NS, 'circle');
  el.setAttribute('cx', String(cx));
  el.setAttribute('cy', String(cy));
  el.setAttribute('r', String(r));
  el.setAttribute('fill', fill);
  return el;
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  width: number,
): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  el.setAttribute('x1', String(x1));
  el.setAttribute('y1', String(y1));
  el.setAttribute('x2', String(x2));
  el.setAttribute('y2', String(y2));
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', String(width));
  el.setAttribute('stroke-linecap', 'round');
  return el;
}

/** Speaker glyph, with sound-wave arcs when unmuted or a slash when muted. */
export function createMuteIcon(muted: boolean, color = '#0a1a2f'): SVGSVGElement {
  const root = svg('0 0 24 24');
  root.append(path('M3 9v6h4l5 5V4L7 9H3z', color));
  if (!muted) {
    root.append(path('M16.5 8.5a5 5 0 0 1 0 7', 'none'));
    const arc1 = document.createElementNS(SVG_NS, 'path');
    arc1.setAttribute('d', 'M16 8.8a4.6 4.6 0 0 1 0 6.4');
    arc1.setAttribute('stroke', color);
    arc1.setAttribute('stroke-width', '1.6');
    arc1.setAttribute('fill', 'none');
    arc1.setAttribute('stroke-linecap', 'round');
    root.append(arc1);
    const arc2 = document.createElementNS(SVG_NS, 'path');
    arc2.setAttribute('d', 'M18.6 6.4a8.2 8.2 0 0 1 0 11.2');
    arc2.setAttribute('stroke', color);
    arc2.setAttribute('stroke-width', '1.6');
    arc2.setAttribute('fill', 'none');
    arc2.setAttribute('stroke-linecap', 'round');
    root.append(arc2);
  } else {
    root.append(line(15.5, 8.5, 21, 15.5, '#c0392b', 2.2));
    root.append(line(21, 8.5, 15.5, 15.5, '#c0392b', 2.2));
  }
  return root;
}

/** Sun glyph; a soft overlay disc dims it to represent the "dim light" state. */
export function createDimLightIcon(dimmed: boolean, color = '#e8a93a'): SVGSVGElement {
  const root = svg('0 0 24 24');
  root.append(circle(12, 12, 5, color));
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  for (const deg of rays) {
    const rad = (deg * Math.PI) / 180;
    const x1 = 12 + Math.cos(rad) * 7.5;
    const y1 = 12 + Math.sin(rad) * 7.5;
    const x2 = 12 + Math.cos(rad) * 10.5;
    const y2 = 12 + Math.sin(rad) * 10.5;
    root.append(line(x1, y1, x2, y2, color, 1.8));
  }
  if (dimmed) {
    const overlay = circle(12, 12, 11, 'rgba(10,26,47,0.55)');
    root.append(overlay);
  }
  return root;
}

/** Fountain spray with a circular "again" arrow — "same fountain again". */
export function createReplaySameIcon(color = '#2f6fb0'): SVGSVGElement {
  const root = svg('0 0 48 48');
  root.append(path('M22 30h4v10h-4z', color));
  root.append(path('M14 30h20l-3 4H17z', '#8fbfe6'));
  root.append(line(24, 8, 24, 20, color, 2.4));
  root.append(line(24, 8, 18, 16, color, 2.4));
  root.append(line(24, 8, 30, 16, color, 2.4));
  const arrow = document.createElementNS(SVG_NS, 'path');
  arrow.setAttribute(
    'd',
    'M36 30a12 12 0 1 0 -3.2 8.2',
  );
  arrow.setAttribute('stroke', '#3d8a4f');
  arrow.setAttribute('stroke-width', '2.6');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke-linecap', 'round');
  root.append(arrow);
  root.append(path('M31 39l4.5 1.5-1-4.7z', '#3d8a4f'));
  return root;
}

/** Simple garden gate / tree — "restart from the garden". */
export function createReplayRestartIcon(color = '#3d8a4f'): SVGSVGElement {
  const root = svg('0 0 48 48');
  root.append(path('M20 44V28h8v16z', '#8a5a2b'));
  root.append(circle(24, 16, 12, color));
  root.append(circle(14, 22, 7, color));
  root.append(circle(34, 22, 7, color));
  return root;
}

/** Wrench over a valve wheel — "free valve play". */
export function createReplayFreeValveIcon(color = '#b0752f'): SVGSVGElement {
  const root = svg('0 0 48 48');
  root.append(circle(20, 24, 12, 'none'));
  const wheel = document.createElementNS(SVG_NS, 'circle');
  wheel.setAttribute('cx', '20');
  wheel.setAttribute('cy', '24');
  wheel.setAttribute('r', '11');
  wheel.setAttribute('fill', 'none');
  wheel.setAttribute('stroke', color);
  wheel.setAttribute('stroke-width', '3');
  root.append(wheel);
  for (const deg of [0, 60, 120, 180, 240, 300]) {
    const rad = (deg * Math.PI) / 180;
    const x1 = 20 + Math.cos(rad) * 8;
    const y1 = 24 + Math.sin(rad) * 8;
    const x2 = 20 + Math.cos(rad) * 13.5;
    const y2 = 24 + Math.sin(rad) * 13.5;
    root.append(line(x1, y1, x2, y2, color, 2.4));
  }
  const wrench = document.createElementNS(SVG_NS, 'path');
  wrench.setAttribute(
    'd',
    'M31 12a6 6 0 0 0 -8.3 7.3l-9.6 9.6 3.6 3.6 9.6-9.6A6 6 0 0 0 31 12z',
  );
  wrench.setAttribute('fill', '#5a5f66');
  root.append(wrench);
  return root;
}

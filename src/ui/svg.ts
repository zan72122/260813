/**
 * Tiny inline-SVG DOM builder. Every pictogram in this game is hand-drawn
 * with these primitives — no external assets, no `<img>`, no emoji glyphs
 * standing in for controls (PRODUCT_SPEC "pictograms only").
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number>> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

export function svgRoot(viewBox: string, extraClass?: string): SVGSVGElement {
  const svg = svgEl('svg', { viewBox, xmlns: SVG_NS });
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (extraClass) svg.classList.add(...extraClass.split(' ').filter(Boolean));
  return svg;
}

export function appendAll(parent: SVGElement, children: readonly SVGElement[]): void {
  for (const child of children) parent.appendChild(child);
}

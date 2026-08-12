/**
 * Pure pictogram builders. Every export returns a plain SVG markup string
 * (no DOM APIs used, no `document` dependency) — deliberately pure so they
 * are unit-testable under Vitest's `node` environment without a DOM
 * implementation (see tests/unit/ui-pictograms.test.ts). Callers
 * (loadingScreen.ts, hud.ts, ...) set `.innerHTML` on a container element
 * with the returned string.
 *
 * NO TEXT RULE: none of these strings contain human-readable text content
 * — every SVG here is `aria-hidden="true"` (decorative); any accessible
 * name lives on the surrounding interactive DOM element's `aria-label`
 * (added by the ui/*.ts modules that consume these builders), never inside
 * the markup itself. `isWellFormedSvg`/`hasNoTextContent` below exist so
 * tests can assert both properties directly on the generated strings.
 */

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Wraps inner markup in a decorative (aria-hidden) SVG root with a square viewBox. */
function svg(inner: string, viewBox = '0 0 100 100'): string {
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${inner}</svg>`;
}

/**
 * Very small structural well-formedness check (balanced tags) — intentionally
 * not a full XML parser (none is available under the Vitest `node`
 * environment used for this project's unit tests; see docs/ARCHITECTURE_CONTRACT
 * — no DOM lib is installed). Good enough to catch a mismatched/unclosed
 * tag in a hand-written template.
 */
export function isWellFormedSvg(markup: string): boolean {
  const trimmed = markup.trim();
  if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) return false;
  const tagPattern = /<\/?([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(trimmed)) !== null) {
    const full = match[0];
    const name = match[1];
    const selfClosing = match[2];
    if (!name) return false;
    if (selfClosing === '/') continue; // self-closing, e.g. <circle ... />
    if (full.startsWith('</')) {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

/** True if the markup has no human-readable text between tags (attribute values are fine). */
export function hasNoTextContent(markup: string): boolean {
  const betweenTags = markup.replace(/<[^>]*>/g, '');
  const textRuns = betweenTags.split('').filter((s) => s.length > 0);
  return textRuns.every((run) => run.trim().length === 0);
}

const PAPER = '#e9dcc4';
const INK = '#4a3428';
const BRASS = '#b08d3f';

/**
 * Tower silhouette line-art that "draws in" as `progress` (0..1) advances,
 * via stroke-dashoffset. At progress=0 the path is fully hidden
 * (dashoffset == length); at progress=1 it is fully revealed (dashoffset 0).
 */
export function towerSilhouette(progress: number): string {
  const p = clamp01(progress);
  const path =
    'M50 8 L38 78 L28 92 M50 8 L62 78 L72 92 M50 8 L44 40 L56 40 Z M32 55 L68 55 M36 70 L64 70';
  const length = 320; // approximate total path length, stable across renders
  const offset = length * (1 - p);
  return svg(
    `<path d="${path}" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${length}" stroke-dashoffset="${offset}"/>`,
  );
}

/** Large pulsing ▶ start badge — first tap resolves the audio-unlock promise. `pulsing=false` renders a static badge (reducedMotion). */
export function startBadge(pulsing: boolean): string {
  const pulseClass = pulsing ? ' class="eiffel-pulse"' : '';
  return svg(
    `<circle cx="50" cy="50" r="46"${pulseClass} fill="${PAPER}" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M40 32 L72 50 L40 68 Z" fill="${INK}"/>`,
  );
}

/** Speaker pictogram, on/off state. */
export function speakerIcon(on: boolean): string {
  const cone = '<path d="M20 40 L36 40 L54 24 L54 76 L36 60 L20 60 Z" fill="currentColor"/>';
  if (!on) {
    return svg(
      `${cone}<line x1="66" y1="34" x2="90" y2="66" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>` +
        `<line x1="90" y1="34" x2="66" y2="66" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>`,
    );
  }
  return svg(
    `${cone}<path d="M66 34 A26 26 0 0 1 66 66" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M74 22 A42 42 0 0 1 74 78" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.6"/>`,
  );
}

/** ‖ pause pictogram. */
export function pauseIcon(): string {
  return svg(
    `<rect x="28" y="22" width="16" height="56" rx="4" fill="currentColor"/>` +
      `<rect x="56" y="22" width="16" height="56" rx="4" fill="currentColor"/>`,
  );
}

/** ▶ resume pictogram — used both as the loading-screen start badge triangle and the pause-overlay resume badge. */
export function playIcon(): string {
  return svg(`<path d="M36 24 L78 50 L36 76 Z" fill="currentColor"/>`);
}

/** One tiny leg-progress pictogram; `locked` fills/locks it. */
export function legIcon(locked: boolean): string {
  const fill = locked ? BRASS : 'none';
  return svg(
    `<path d="M50 10 L36 70 L28 90 M50 10 L64 70 L72 90" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>` +
      `<circle cx="50" cy="10" r="8" fill="${fill}" stroke="currentColor" stroke-width="4"/>`,
  );
}

/** ↻ giant central replay pictogram. */
export function replayIcon(): string {
  return svg(
    `<path d="M50 14 A36 36 0 1 1 21 33" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M18 14 L21 33 L40 29 Z" fill="currentColor"/>`,
  );
}

/** Reload pictogram used by the error fallback screen (visually identical family to replayIcon, kept distinct for intent clarity). */
export function reloadIcon(): string {
  return svg(
    `<path d="M50 16 A34 34 0 1 1 20 40" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>` +
      `<path d="M17 18 L20 40 L40 35 Z" fill="currentColor"/>`,
  );
}

export type HintDemoKind = 'gateDrag' | 'pumpStrokes' | 'wedgeSlide' | 'hammerTap';

/**
 * Translucent ghost-hand demonstrating the expected gesture for the given
 * kind. When `reducedMotion` is true, returns a single static frame (no
 * `<animateTransform>`/`<animate>` elements) instead of the animated
 * version — see docs/PRODUCT_SPEC.md prefers-reduced-motion requirement.
 */
export function ghostHand(kind: HintDemoKind, reducedMotion: boolean): string {
  const hand =
    '<path d="M42 30 L42 62 Q42 70 50 70 L58 70 Q66 70 66 62 L66 40 L60 40 L60 34 Q60 28 54 28 Q48 28 48 34 L48 42 L42 42 Z" fill="#f2e6cf" stroke="#8a6a45" stroke-width="2" opacity="0.75"/>';

  let motion = '';
  let transform: string;
  if (kind === 'gateDrag') {
    transform = 'translate(0 -14)';
    if (!reducedMotion) {
      motion =
        '<animateTransform attributeName="transform" type="translate" values="0 -14; 0 14; 0 -14" dur="1.6s" repeatCount="indefinite"/>';
    }
  } else if (kind === 'pumpStrokes') {
    transform = 'translate(0 0)';
    if (!reducedMotion) {
      motion =
        '<animateTransform attributeName="transform" type="translate" values="0 10; 0 -10; 0 10" dur="1s" repeatCount="indefinite"/>';
    }
  } else if (kind === 'wedgeSlide') {
    transform = 'translate(-12 0)';
    if (!reducedMotion) {
      motion =
        '<animateTransform attributeName="transform" type="translate" values="-12 0; 12 0; -12 0" dur="1.4s" repeatCount="indefinite"/>';
    }
  } else {
    transform = 'translate(0 0)';
    if (!reducedMotion) {
      motion =
        '<animateTransform attributeName="transform" type="translate" values="0 0; 0 12; 0 0" dur="0.5s" repeatCount="indefinite"/>';
    }
  }

  return svg(`<g transform="${transform}">${hand}${motion}</g>`);
}

/** Static friendly error-fallback scene: tower silhouette + wrench/tool marks. No error jargon — purely pictographic. */
export function errorScene(): string {
  return svg(
    `<path d="M50 12 L38 76 L28 90 M50 12 L62 76 L72 90 M44 40 L56 40" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="76" cy="70" r="10" fill="none" stroke="${BRASS}" stroke-width="4"/>` +
      `<path d="M69 63 L83 77 M83 63 L69 77" stroke="${BRASS}" stroke-width="4" stroke-linecap="round"/>`,
  );
}

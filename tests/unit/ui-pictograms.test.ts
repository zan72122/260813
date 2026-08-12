import { describe, expect, it } from 'vitest';
import {
  errorScene,
  ghostHand,
  hasNoTextContent,
  isWellFormedSvg,
  legIcon,
  pauseIcon,
  playIcon,
  reloadIcon,
  replayIcon,
  speakerIcon,
  startBadge,
  towerSilhouette,
} from '../../src/ui/svg';
import type { HintDemoKind } from '../../src/ui/svg';

const DEMO_KINDS: HintDemoKind[] = ['gateDrag', 'pumpStrokes', 'wedgeSlide', 'hammerTap'];

const ALL_STATIC_BUILDERS: string[] = [
  towerSilhouette(0),
  towerSilhouette(0.5),
  towerSilhouette(1),
  startBadge(true),
  startBadge(false),
  speakerIcon(true),
  speakerIcon(false),
  pauseIcon(),
  playIcon(),
  legIcon(true),
  legIcon(false),
  replayIcon(),
  reloadIcon(),
  errorScene(),
  ...DEMO_KINDS.flatMap((k) => [ghostHand(k, true), ghostHand(k, false)]),
];

describe('pictogram SVG builders', () => {
  it('every builder returns well-formed (balanced-tag) SVG markup', () => {
    for (const markup of ALL_STATIC_BUILDERS) {
      expect(isWellFormedSvg(markup)).toBe(true);
    }
  });

  it('every builder is decorative and carries zero human-readable text content (NO TEXT RULE)', () => {
    for (const markup of ALL_STATIC_BUILDERS) {
      expect(hasNoTextContent(markup)).toBe(true);
      expect(markup).toContain('aria-hidden="true"');
    }
  });

  describe('towerSilhouette draw-in progress', () => {
    it('reveals more of the path (smaller dashoffset) as progress increases', () => {
      const at0 = towerSilhouette(0);
      const atHalf = towerSilhouette(0.5);
      const at1 = towerSilhouette(1);
      const offsetOf = (svg: string): number => Number(/stroke-dashoffset="([\d.]+)"/.exec(svg)?.[1]);
      expect(offsetOf(at0)).toBeGreaterThan(offsetOf(atHalf));
      expect(offsetOf(atHalf)).toBeGreaterThan(offsetOf(at1));
      expect(offsetOf(at1)).toBe(0);
    });

    it('clamps out-of-range progress into [0,1]', () => {
      expect(towerSilhouette(-5)).toBe(towerSilhouette(0));
      expect(towerSilhouette(5)).toBe(towerSilhouette(1));
    });
  });

  describe('startBadge pulsing (reduced-motion branch)', () => {
    it('pulsing=true adds the CSS pulse class', () => {
      expect(startBadge(true)).toContain('eiffel-pulse');
    });
    it('pulsing=false renders a static badge with no pulse class', () => {
      expect(startBadge(false)).not.toContain('eiffel-pulse');
    });
  });

  describe('speakerIcon on/off states differ', () => {
    it('on and off markup are distinct', () => {
      expect(speakerIcon(true)).not.toBe(speakerIcon(false));
    });
  });

  describe('legIcon locked/unlocked states differ', () => {
    it('locked and unlocked markup are distinct', () => {
      expect(legIcon(true)).not.toBe(legIcon(false));
    });
  });

  describe('ghostHand reduced-motion branch', () => {
    it('animates (contains SMIL animateTransform) when reducedMotion is false, for every gesture kind', () => {
      for (const kind of DEMO_KINDS) {
        expect(ghostHand(kind, false)).toContain('<animateTransform');
      }
    });

    it('is static (no SMIL animation elements) when reducedMotion is true, for every gesture kind', () => {
      for (const kind of DEMO_KINDS) {
        const markup = ghostHand(kind, true);
        expect(markup).not.toContain('<animateTransform');
        expect(markup).not.toContain('<animate ');
        expect(isWellFormedSvg(markup)).toBe(true);
      }
    });

    it('each gesture kind produces a distinct animated transform path', () => {
      const variants = new Set(DEMO_KINDS.map((k) => ghostHand(k, false)));
      expect(variants.size).toBe(DEMO_KINDS.length);
    });
  });

  describe('isWellFormedSvg / hasNoTextContent helpers themselves', () => {
    it('reject an unclosed tag', () => {
      expect(isWellFormedSvg('<svg><path d="M0 0"></svg>')).toBe(false);
    });
    it('reject markup not starting/ending with <svg>...</svg>', () => {
      expect(isWellFormedSvg('<div><svg></svg></div>')).toBe(false);
    });
    it('accept self-closing tags', () => {
      expect(isWellFormedSvg('<svg><circle cx="1" cy="1" r="1"/></svg>')).toBe(true);
    });
    it('detect stray readable text between tags', () => {
      expect(hasNoTextContent('<svg><text>hello</text></svg>')).toBe(false);
    });
    it('allows whitespace-only text runs between tags', () => {
      expect(hasNoTextContent('<svg>\n  <circle/>\n</svg>')).toBe(true);
    });
  });
});

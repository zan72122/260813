/**
 * F9 (review round 1): the magnifier lens previously anchored top-right —
 * the exact same corner `src/ui/hud.ts`'s sound toggle occupies — so the
 * brass ring sat directly on top of it in every viewport (confirmed
 * visually in the pre-fix artifacts/qa/*\/magnifier.png captures). These
 * tests exercise the pure anchor math (`magnifierAnchorCss`, split out of
 * `MagnifierImpl` specifically so it's testable without `document` — see
 * that function's own doc comment) against the 4 real viewport sizes this
 * game ships QA captures for (playwright.config.ts's 4 projects) and lock
 * in that the lens+ring bounding box never overlaps either top HUD corner
 * button, in any of them.
 */
import { describe, expect, it } from 'vitest';
import { MAGNIFIER_LENS_RADIUS, MAGNIFIER_MARGIN, magnifierAnchorCss } from '../../src/render/magnifier';

/** `.eiffel-corner-btn` (src/styles/base.css): 56x56 CSS px, 12px from each edge. Safe-area insets are additional (only ever push these further from the corner, never closer), so testing against the zero-inset baseline is the tightest/worst case. */
const HUD_BUTTON_SIZE = 56;
const HUD_BUTTON_MARGIN = 12;

/** The brass ring frame renders `MAGNIFIER_LENS_RADIUS * 2.22` across (magnifier.ts's `ringMesh`) — its half-extent is what can actually collide with something, not just the inner lens circle. */
const RING_HALF_EXTENT = (MAGNIFIER_LENS_RADIUS * 2.22) / 2;

/** The 4 viewports every QA screenshot (and this fix) must work in — playwright.config.ts. */
const VIEWPORTS = [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
] as const;

function ringBounds(w: number, h: number): { left: number; right: number; top: number; bottom: number } {
  const { cx, cy } = magnifierAnchorCss(w, h);
  return {
    left: cx - RING_HALF_EXTENT,
    right: cx + RING_HALF_EXTENT,
    top: cy - RING_HALF_EXTENT,
    bottom: cy + RING_HALF_EXTENT,
  };
}

function rectsOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe('magnifierAnchorCss (F9)', () => {
  it('anchors bottom-right, not top-right: the anchor point sits in the viewport\'s lower-right quadrant on every supported viewport', () => {
    for (const { width, height } of VIEWPORTS) {
      const { cx, cy } = magnifierAnchorCss(width, height);
      expect(cx).toBeGreaterThan(width / 2);
      expect(cy).toBeGreaterThan(height / 2);
    }
  });

  it('the lens+ring bounding box never overlaps the top-right (sound) HUD button, on any of the 4 supported viewports', () => {
    for (const { width, height } of VIEWPORTS) {
      const btn = {
        left: width - HUD_BUTTON_MARGIN - HUD_BUTTON_SIZE,
        right: width - HUD_BUTTON_MARGIN,
        top: HUD_BUTTON_MARGIN,
        bottom: HUD_BUTTON_MARGIN + HUD_BUTTON_SIZE,
      };
      const ring = ringBounds(width, height);
      expect(rectsOverlap(ring, btn), `overlap at ${String(width)}x${String(height)}`).toBe(false);
    }
  });

  it('the lens+ring bounding box never overlaps the top-left (pause) HUD button, on any of the 4 supported viewports', () => {
    const btn = { left: HUD_BUTTON_MARGIN, right: HUD_BUTTON_MARGIN + HUD_BUTTON_SIZE, top: HUD_BUTTON_MARGIN, bottom: HUD_BUTTON_MARGIN + HUD_BUTTON_SIZE };
    for (const { width, height } of VIEWPORTS) {
      const ring = ringBounds(width, height);
      expect(rectsOverlap(ring, btn)).toBe(false);
    }
  });

  it('the lens+ring bounding box stays fully within the viewport (no clipping off-screen) on every supported viewport', () => {
    for (const { width, height } of VIEWPORTS) {
      const ring = ringBounds(width, height);
      expect(ring.left).toBeGreaterThanOrEqual(0);
      expect(ring.top).toBeGreaterThanOrEqual(0);
      expect(ring.right).toBeLessThanOrEqual(width);
      expect(ring.bottom).toBeLessThanOrEqual(height);
    }
  });

  it('is anchored exactly MAGNIFIER_MARGIN + MAGNIFIER_LENS_RADIUS in from the right/bottom edges', () => {
    const { cx, cy } = magnifierAnchorCss(1000, 800);
    expect(cx).toBeCloseTo(1000 - MAGNIFIER_MARGIN - MAGNIFIER_LENS_RADIUS, 9);
    expect(cy).toBeCloseTo(800 - MAGNIFIER_MARGIN - MAGNIFIER_LENS_RADIUS, 9);
  });

  it('degenerate (zero/negative) viewport sizes never produce NaN/negative-radius nonsense', () => {
    const { cx, cy } = magnifierAnchorCss(0, -5);
    expect(Number.isFinite(cx)).toBe(true);
    expect(Number.isFinite(cy)).toBe(true);
  });
});

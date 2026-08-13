import { describe, expect, it } from 'vitest';
import {
  CARD_ASPECT,
  computeCardRect,
  isInsideCard,
  isLandscape,
  pointToCardUv,
  rectBottom,
  rectTop,
} from '../../src/core/layout';

const VIEWPORTS: [string, number, number][] = [
  ['iPhone SE portrait', 375, 667],
  ['iPhone 14 Pro portrait', 393, 852],
  ['iPhone 14 Pro landscape', 852, 393],
  ['iPad portrait', 820, 1180],
  ['iPad landscape', 1180, 820],
  ['tiny', 240, 320],
];

describe('computeCardRect', () => {
  it.each(VIEWPORTS)('keeps the card on screen and correctly shaped on %s', (_n, vw, vh) => {
    const r = computeCardRect(vw, vh);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.w / r.h).toBeCloseTo(CARD_ASPECT, 5);
    expect(rectTop(r)).toBeGreaterThanOrEqual(0);
    expect(rectBottom(r)).toBeLessThanOrEqual(vh);
    expect(r.x - r.w / 2).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w / 2).toBeLessThanOrEqual(vw);
  });

  it('leaves room for the UI bands above and below in portrait', () => {
    const r = computeCardRect(393, 852);
    expect(rectTop(r)).toBeGreaterThan(40);
    expect(852 - rectBottom(r)).toBeGreaterThan(80);
  });

  it('uses nearly the full height in landscape, where the UI sits in columns', () => {
    const r = computeCardRect(852, 393);
    expect(r.h).toBeGreaterThan(393 * 0.8);
  });

  it('respects safe-area insets', () => {
    const safe = { top: 59, right: 0, bottom: 34, left: 0 };
    const r = computeCardRect(393, 852, safe);
    expect(rectTop(r)).toBeGreaterThanOrEqual(59);
    expect(rectBottom(r)).toBeLessThanOrEqual(852 - 34);
  });

  it('applies per-phase tweaks without leaving the viewport', () => {
    const r = computeCardRect(393, 852, undefined, { top: 110, scale: 0.94 });
    const plain = computeCardRect(393, 852);
    expect(r.h).toBeLessThan(plain.h);
    expect(rectTop(r)).toBeGreaterThan(0);
    expect(rectBottom(r)).toBeLessThanOrEqual(852);
  });

  it('never collapses on an absurdly small viewport', () => {
    const r = computeCardRect(80, 90);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe('pointToCardUv / isInsideCard', () => {
  const rect = { x: 200, y: 400, w: 300, h: 428.57 };

  it('maps the centre to (0.5, 0.5)', () => {
    const uv = pointToCardUv(rect.x, rect.y, rect);
    expect(uv.u).toBeCloseTo(0.5, 5);
    expect(uv.v).toBeCloseTo(0.5, 5);
  });

  it('maps the top-left corner to (0, 0)', () => {
    const uv = pointToCardUv(rect.x - rect.w / 2, rect.y - rect.h / 2, rect);
    expect(uv.u).toBeCloseTo(0, 5);
    expect(uv.v).toBeCloseTo(0, 5);
  });

  it('detects points outside the card', () => {
    expect(isInsideCard(rect.x, rect.y, rect)).toBe(true);
    expect(isInsideCard(rect.x + rect.w, rect.y, rect)).toBe(false);
  });

  it('accepts near-misses when given slack, so small fingers still count', () => {
    const justOutside = rect.x + rect.w / 2 + 10;
    expect(isInsideCard(justOutside, rect.y, rect)).toBe(false);
    expect(isInsideCard(justOutside, rect.y, rect, 0.15)).toBe(true);
  });
});

describe('isLandscape', () => {
  it('splits on the wider-than-tall test', () => {
    expect(isLandscape(852, 393)).toBe(true);
    expect(isLandscape(393, 852)).toBe(false);
    expect(isLandscape(500, 500)).toBe(false);
  });
});

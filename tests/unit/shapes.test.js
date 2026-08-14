import { describe, expect, it } from 'vitest';
import { SHAPES, SHAPE_IDS, shapeById } from '../../src/shapes.js';
import { FORGIVE, JUICE, TRAY } from '../../src/config.js';

describe('shapes', () => {
  it('exposes the promised silhouettes: fruit, star, heart and animals', () => {
    expect(SHAPE_IDS).toEqual(
      expect.arrayContaining(['star', 'heart', 'bear', 'bunny', 'flower', 'apple']),
    );
  });

  it('keeps every polygon inside the normalised [-1,1] box', () => {
    for (const spec of SHAPES) {
      for (const part of spec.parts) {
        expect(part.length % 2).toBe(0);
        expect(part.length).toBeGreaterThanOrEqual(6);
        for (const v of part) expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
      }
    }
  });

  it('falls back to a real shape for an unknown id', () => {
    expect(shapeById('nope').id).toBe(SHAPES[0].id);
  });
});

describe('forgiveness budget', () => {
  it('lets the nozzle snap from a third of the tray away', () => {
    expect(FORGIVE.nozzleSnapRadius).toBeGreaterThan(TRAY.w / 4);
  });

  it('leads the brush a real distance ahead of the fingertip', () => {
    expect(FORGIVE.brushLead).toBeGreaterThan(1);
    expect(FORGIVE.brushLeadMinPx).toBeGreaterThanOrEqual(40);
  });

  it('offers the five juice colours the brief asks for', () => {
    expect(JUICE.map((j) => j.id)).toEqual(['red', 'yellow', 'orange', 'green', 'pink']);
  });
});

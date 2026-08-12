import { describe, expect, it } from 'vitest';
import { beamProfileFor, BEAM_LENGTH } from '../beamShapes';
import type { BeamShape } from '../../contracts/types';

const SHAPES: BeamShape[] = ['girder', 'xpanel', 'curved'];

describe('beamProfileFor', () => {
  it.each(SHAPES)('produces a non-empty member list for %s', (shape) => {
    const profile = beamProfileFor(shape);
    expect(profile.members.length).toBeGreaterThan(3);
    expect(profile.shape).toBe(shape);
  });

  it.each(SHAPES)('every member stays within the beam length bounds for %s', (shape) => {
    const profile = beamProfileFor(shape);
    for (const m of profile.members) {
      expect(m.ax).toBeGreaterThanOrEqual(-1e-9);
      expect(m.bx).toBeGreaterThanOrEqual(-1e-9);
      expect(m.ax).toBeLessThanOrEqual(BEAM_LENGTH + 1e-9);
      expect(m.bx).toBeLessThanOrEqual(BEAM_LENGTH + 1e-9);
    }
  });

  it.each(SHAPES)('produces distinct rivet joints for %s', (shape) => {
    const profile = beamProfileFor(shape);
    expect(profile.rivets.length).toBeGreaterThan(2);
    // no exact duplicates
    const seen = new Set(profile.rivets.map((r) => `${r.x.toFixed(3)},${r.y.toFixed(3)}`));
    expect(seen.size).toBe(profile.rivets.length);
  });

  it('gives each shape a distinct factory tag', () => {
    const tags = new Set(SHAPES.map((s) => beamProfileFor(s).factoryTag));
    expect(tags.size).toBe(SHAPES.length);
  });

  it('is deterministic (pure function of shape only)', () => {
    const a = beamProfileFor('xpanel');
    const b = beamProfileFor('xpanel');
    expect(a).toEqual(b);
  });
});

import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_FIELD_COLOR,
  PITCH_MAX,
  PITCH_MIN,
  SPEED_FOR_COARSEST,
  axisFromDirector,
  blendDirectors,
  coherence,
  decodeSigned,
  directorFromAngle,
  directorFromDelta,
  encodeSigned,
  fieldColor,
  gratingDirectorFromStroke,
  pitchFromSpeed,
} from '../../src/core/field';

/** Are two axes the same line, ignoring which way along it they point? */
function sameAxis(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(Math.abs(a.x * b.x + a.y * b.y) - 1) < 1e-6;
}

describe('director encoding', () => {
  it('gives the same value for a stroke and the same stroke reversed', () => {
    const fwd = directorFromDelta(3, 1);
    const back = directorFromDelta(-3, -1);
    expect(back.c).toBeCloseTo(fwd.c, 12);
    expect(back.s).toBeCloseTo(fwd.s, 12);
  });

  it('is scale invariant - only the direction matters', () => {
    const small = directorFromDelta(0.02, 0.01);
    const large = directorFromDelta(200, 100);
    expect(small.c).toBeCloseTo(large.c, 10);
    expect(small.s).toBeCloseTo(large.s, 10);
  });

  it('round-trips an angle back to the same axis', () => {
    for (const deg of [0, 17, 45, 89, 90, 134, 179]) {
      const th = (deg * Math.PI) / 180;
      const axis = axisFromDirector(directorFromAngle(th));
      expect(sameAxis(axis, { x: Math.cos(th), y: Math.sin(th) })).toBe(true);
    }
  });

  it('treats a zero-length move as having no direction', () => {
    const d = directorFromDelta(0, 0);
    expect(coherence(d)).toBe(0);
  });

  it('always produces a unit-length director for a real stroke', () => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-3, 7],
    ]) {
      expect(coherence(directorFromDelta(dx, dy))).toBeCloseTo(1, 10);
    }
  });
});

describe('blending, and the coherence that falls out of it', () => {
  it('keeps full coherence when strokes agree', () => {
    const a = directorFromDelta(1, 0);
    const b = directorFromDelta(4, 0);
    expect(coherence(blendDirectors(a, b, 0.5))).toBeCloseTo(1, 10);
  });

  it('keeps full coherence when a stroke is retraced backwards', () => {
    // The whole reason for the doubled angle: a plain vector would cancel here.
    const a = directorFromDelta(1, 0.5);
    const b = directorFromDelta(-1, -0.5);
    expect(coherence(blendDirectors(a, b, 0.5))).toBeCloseTo(1, 10);
  });

  it('cancels to zero coherence when strokes cross at right angles', () => {
    const a = directorFromDelta(1, 0);
    const b = directorFromDelta(0, 1);
    expect(coherence(blendDirectors(a, b, 0.5))).toBeCloseTo(0, 10);
  });

  it('lands part-way for a partial disagreement', () => {
    const a = directorFromDelta(1, 0);
    const b = directorFromAngle(Math.PI / 4);
    const c = coherence(blendDirectors(a, b, 0.5));
    expect(c).toBeGreaterThan(0.5);
    expect(c).toBeLessThan(1);
  });

  it('never reports coherence above 1', () => {
    expect(coherence({ c: 3, s: 4 })).toBe(1);
  });
});

describe('grating direction', () => {
  it('runs across the stroke, not along it', () => {
    const along = axisFromDirector(directorFromDelta(1, 0));
    const across = axisFromDirector(gratingDirectorFromStroke(1, 0));
    expect(Math.abs(along.x * across.x + along.y * across.y)).toBeCloseTo(0, 10);
  });

  it('matches an explicit quarter turn of the stroke', () => {
    for (const [dx, dy] of [
      [1, 0],
      [2, 5],
      [-3, 1],
    ]) {
      const turned = directorFromDelta(-dy, dx);
      const g = gratingDirectorFromStroke(dx, dy);
      expect(g.c).toBeCloseTo(turned.c, 10);
      expect(g.s).toBeCloseTo(turned.s, 10);
    }
  });
});

describe('byte packing', () => {
  it('round-trips signed values within one byte of precision', () => {
    for (const v of [-1, -0.5, 0, 0.25, 1]) {
      expect(decodeSigned(encodeSigned(v))).toBeCloseTo(v, 2);
    }
  });

  it('clamps out-of-range values instead of wrapping', () => {
    expect(encodeSigned(5)).toBe(255);
    expect(encodeSigned(-5)).toBe(0);
  });

  it('encodes an unpainted field as no direction and a middling pitch', () => {
    const [r, g, b] = NEUTRAL_FIELD_COLOR;
    expect(decodeSigned(r)).toBeCloseTo(0, 2);
    expect(decodeSigned(g)).toBeCloseTo(0, 2);
    expect(b / 255).toBeCloseTo(0.5, 2);
  });

  it('produces three in-range bytes for any stroke', () => {
    const col = fieldColor(directorFromDelta(1, -2), 0.8);
    for (const ch of col) {
      expect(Number.isInteger(ch)).toBe(true);
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(255);
    }
  });
});

describe('pitch from stroke speed', () => {
  it('cuts the finest ruling when the finger barely moves', () => {
    expect(pitchFromSpeed(0)).toBe(1);
  });

  it('cuts the coarsest ruling at and beyond the fast limit', () => {
    expect(pitchFromSpeed(SPEED_FOR_COARSEST)).toBe(0);
    expect(pitchFromSpeed(SPEED_FOR_COARSEST * 4)).toBe(0);
  });

  it('falls monotonically in between', () => {
    let prev = 2;
    for (let s = 0; s <= SPEED_FOR_COARSEST; s += 0.2) {
      const p = pitchFromSpeed(s);
      expect(p).toBeLessThan(prev);
      prev = p;
    }
  });

  it('spans a range that is actually visible', () => {
    expect(PITCH_MAX / PITCH_MIN).toBeGreaterThan(1.5);
  });
});

import { describe, expect, it } from 'vitest';
import { BASE_RADIUS, APEX_RADIUS, legRadiusAt, legOffsetAt, legTangentAt, LEG_ANGLES } from '../curve';

describe('legRadiusAt', () => {
  it('starts at the base radius at t=0', () => {
    expect(legRadiusAt(0)).toBeCloseTo(BASE_RADIUS, 5);
  });

  it('ends at the apex radius at t=1', () => {
    expect(legRadiusAt(1)).toBeCloseTo(APEX_RADIUS, 5);
  });

  it('is monotonically non-increasing (inward curve, never bulges out)', () => {
    let prev = legRadiusAt(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const r = legRadiusAt(t);
      expect(r).toBeLessThanOrEqual(prev + 1e-9);
      prev = r;
    }
  });

  it('is concave: it curves inward faster near the base than linear', () => {
    const linearMid = (BASE_RADIUS + APEX_RADIUS) / 2;
    expect(legRadiusAt(0.5)).toBeLessThan(linearMid);
  });

  it('clamps out-of-range t', () => {
    expect(legRadiusAt(-1)).toBeCloseTo(legRadiusAt(0), 5);
    expect(legRadiusAt(2)).toBeCloseTo(legRadiusAt(1), 5);
  });
});

describe('legOffsetAt', () => {
  it('places the four legs at distinct quadrants at the base', () => {
    const offsets = LEG_ANGLES.map((a) => legOffsetAt(a, 0));
    expect(offsets[0]?.x).toBeGreaterThan(0);
    expect(offsets[0]?.z).toBeGreaterThan(0);
    expect(offsets[1]?.x).toBeLessThan(0);
    expect(offsets[2]?.x).toBeLessThan(0);
    expect(offsets[2]?.z).toBeLessThan(0);
  });

  it('converges legs toward the axis at the apex', () => {
    const base = legOffsetAt(LEG_ANGLES[0]!, 0);
    const apex = legOffsetAt(LEG_ANGLES[0]!, 1);
    const distBase = Math.hypot(base.x, base.z);
    const distApex = Math.hypot(apex.x, apex.z);
    expect(distApex).toBeLessThan(distBase);
  });
});

describe('legTangentAt', () => {
  it('returns a unit-length vector', () => {
    const tan = legTangentAt(LEG_ANGLES[0]!, 0.5);
    const len = Math.hypot(tan.x, tan.y, tan.z);
    expect(len).toBeCloseTo(1, 4);
  });

  it('points generally upward (positive y) while climbing', () => {
    const tan = legTangentAt(LEG_ANGLES[0]!, 0.5);
    expect(tan.y).toBeGreaterThan(0);
  });
});

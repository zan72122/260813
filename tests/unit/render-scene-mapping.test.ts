import { describe, expect, it } from 'vitest';
import { legOffsetToWorldY, LEG_OFFSET_WORLD_SCALE } from '../../src/scene/mapping';
import {
  GIRDER_RING_Y,
  GROUND_Y,
  LEG_BASE_RADIUS,
  LEG_TOP_RADIUS,
  jackAnchorXZ,
  legAngleRad,
  legBaseXZ,
  legOutwardYawRadians,
  legRadialUnit,
  legTangentUnit,
  legTopXZ,
  sandboxAnchorXZ,
} from '../../src/scene/layout';
import { INITIAL_OFFSET_MAX, INITIAL_OFFSET_MIN, SAND_UNDERSHOOT_MAX, SAND_UNDERSHOOT_MIN } from '../../src/contracts/constants';
import type { LegId } from '../../src/contracts/types';

const LEGS: LegId[] = [0, 1, 2, 3];

describe('legOffsetToWorldY', () => {
  it('is linear with exactly the documented LEG_OFFSET_WORLD_SCALE factor', () => {
    expect(legOffsetToWorldY(0)).toBe(0);
    expect(legOffsetToWorldY(10)).toBeCloseTo(10 * LEG_OFFSET_WORLD_SCALE, 10);
    expect(legOffsetToWorldY(-5)).toBeCloseTo(-5 * LEG_OFFSET_WORLD_SCALE, 10);
  });

  it('is strictly monotonically increasing across the full legOffsetY range the leg model actually produces', () => {
    // Range: [-SAND_UNDERSHOOT_MAX, +INITIAL_OFFSET_MAX] covers every value legOffsetY can take (see contracts/legModel.ts).
    const samples: number[] = [];
    for (let v = -SAND_UNDERSHOOT_MAX - 1; v <= INITIAL_OFFSET_MAX + 1; v += 0.37) samples.push(v);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (a === undefined || b === undefined) continue;
      expect(legOffsetToWorldY(b)).toBeGreaterThan(legOffsetToWorldY(a));
    }
  });

  it('is monotonic under randomized pairwise comparisons too (order-preserving)', () => {
    let seed = 12345;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) {
      const a = (rand() - 0.5) * 2 * (INITIAL_OFFSET_MAX + SAND_UNDERSHOOT_MAX);
      const b = (rand() - 0.5) * 2 * (INITIAL_OFFSET_MAX + SAND_UNDERSHOOT_MAX);
      if (a === b) continue;
      const cmp = a < b;
      expect(legOffsetToWorldY(a) < legOffsetToWorldY(b)).toBe(cmp);
    }
  });

  it('the full initial-offset range maps to a clearly-visible (not imperceptible, not absurd) world-space gap', () => {
    const worldGap = legOffsetToWorldY(INITIAL_OFFSET_MAX) - legOffsetToWorldY(0);
    expect(worldGap).toBeGreaterThan(0.5); // legible against the ~32-unit tower
    expect(worldGap).toBeLessThan(GIRDER_RING_Y * 0.5); // never dwarfs the tower itself
  });
});

describe('scene/layout: tower geometry (pure)', () => {
  it('LEG_BASE_RADIUS > LEG_TOP_RADIUS (legs splay outward toward the ground)', () => {
    expect(LEG_BASE_RADIUS).toBeGreaterThan(LEG_TOP_RADIUS);
  });

  it('every leg is placed at a distinct 90°-spaced angle', () => {
    const angles = LEGS.map(legAngleRad);
    const uniq = new Set(angles.map((a) => Math.round((a * 1000) % (Math.PI * 2 * 1000))));
    expect(uniq.size).toBe(4);
    for (let i = 0; i < LEGS.length; i++) {
      for (let j = i + 1; j < LEGS.length; j++) {
        const iAngle = angles[i];
        const jAngle = angles[j];
        if (iAngle === undefined || jAngle === undefined) continue;
        const diff = Math.abs(iAngle - jAngle) % (Math.PI * 2);
        const normalized = Math.min(diff, Math.PI * 2 - diff);
        expect(normalized).toBeGreaterThan(0.1);
      }
    }
  });

  it('legBaseXZ sits farther from the tower center than legTopXZ, for every leg', () => {
    for (const leg of LEGS) {
      const base = legBaseXZ(leg);
      const top = legTopXZ(leg);
      const baseDist = Math.hypot(base.x, base.z);
      const topDist = Math.hypot(top.x, top.z);
      expect(baseDist).toBeGreaterThan(topDist);
      expect(baseDist).toBeCloseTo(LEG_BASE_RADIUS, 6);
      expect(topDist).toBeCloseTo(LEG_TOP_RADIUS, 6);
    }
  });

  it('radial and tangential unit vectors are perpendicular unit vectors for every leg', () => {
    for (const leg of LEGS) {
      const r = legRadialUnit(leg);
      const t = legTangentUnit(leg);
      expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 9);
      expect(Math.hypot(t.x, t.z)).toBeCloseTo(1, 9);
      expect(r.x * t.x + r.z * t.z).toBeCloseTo(0, 9);
    }
  });

  it('sandboxAnchorXZ and jackAnchorXZ sit on opposite tangential sides of the leg, equidistant from its centerline', () => {
    for (const leg of LEGS) {
      const base = legBaseXZ(leg);
      const sandbox = sandboxAnchorXZ(leg);
      const jack = jackAnchorXZ(leg);
      const dSand = Math.hypot(sandbox.x - base.x, sandbox.z - base.z);
      const dJack = Math.hypot(jack.x - base.x, jack.z - base.z);
      expect(dSand).toBeCloseTo(dJack, 6);
      // Midpoint of sandbox/jack should sit back on the leg's own centerline.
      const midX = (sandbox.x + jack.x) / 2;
      const midZ = (sandbox.z + jack.z) / 2;
      expect(midX).toBeCloseTo(base.x, 6);
      expect(midZ).toBeCloseTo(base.z, 6);
    }
  });

  it('legOutwardYawRadians rotates local +Z exactly onto the leg\'s world radial-outward direction', () => {
    for (const leg of LEGS) {
      const theta = legOutwardYawRadians(leg);
      // Three.js rotateY convention: local(0,0,1) -> (sinθ, 0, cosθ)
      const worldX = Math.sin(theta);
      const worldZ = Math.cos(theta);
      const outward = legRadialUnit(leg);
      expect(worldX).toBeCloseTo(outward.x, 9);
      expect(worldZ).toBeCloseTo(outward.z, 9);
    }
  });

  it('GROUND_Y is below GIRDER_RING_Y (legs rise from the ground to the ring)', () => {
    expect(GROUND_Y).toBeLessThan(GIRDER_RING_Y);
  });

  it('INITIAL_OFFSET/SAND_UNDERSHOOT bounds imported from contracts are sane (sanity guard against a broken import)', () => {
    expect(INITIAL_OFFSET_MIN).toBeLessThan(INITIAL_OFFSET_MAX);
    expect(SAND_UNDERSHOOT_MIN).toBeLessThan(SAND_UNDERSHOOT_MAX);
  });
});

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  braidSpine, weaveOffset, dropT, DROP_COUNT, BRAID_CYCLES,
  waterfallControls, petalRadius, petalCenter, PETAL_COUNT,
  coilPoint, flowerBasis, hangControls, FLOWER_CENTER, HEAD_CENTER, HEAD_RADIUS
} from '../src/hair/braidMath';

describe('braid spine', () => {
  it('stays outside the head and runs left to right', () => {
    for (let i = 0; i <= 10; i++) {
      const p = braidSpine(i / 10);
      expect(p.distanceTo(HEAD_CENTER)).toBeGreaterThan(HEAD_RADIUS * 0.9);
    }
    expect(braidSpine(0).x).toBeLessThan(0);
    expect(braidSpine(1).x).toBeGreaterThan(0);
  });
});

describe('weave', () => {
  it('three strands stay phase-separated (a real braid, not a bundle)', () => {
    for (const t of [0.1, 0.33, 0.61, 0.9]) {
      const us = [0, 1, 2].map((k) => weaveOffset(t, k).u);
      const spread = Math.max(...us) - Math.min(...us);
      expect(spread).toBeGreaterThan(0.8);
    }
  });
  it('repeats once per weave cycle', () => {
    const a = weaveOffset(0.2, 0);
    const b = weaveOffset(0.2 + 1 / BRAID_CYCLES, 0);
    expect(a.u).toBeCloseTo(b.u, 5);
    expect(a.w).toBeCloseTo(b.w, 5);
  });
});

describe('waterfall drops', () => {
  it('drop points are strictly ordered along the arc, inside (0,1)', () => {
    for (let i = 0; i < DROP_COUNT; i++) {
      expect(dropT(i)).toBeGreaterThan(0);
      expect(dropT(i)).toBeLessThan(1);
      if (i > 0) expect(dropT(i)).toBeGreaterThan(dropT(i - 1));
    }
  });
  it('a settled strand falls well below its start', () => {
    const t = dropT(1);
    const rest = waterfallControls(t, 0);
    const fallen = waterfallControls(t, 1);
    const tipDrop = rest[0].y - fallen[fallen.length - 1].y;
    expect(tipDrop).toBeGreaterThan(0.5);
  });
});

describe('petals', () => {
  it('keeps the trace of the hand: unequal pulls give unequal widths', () => {
    const pulls = [1, 0.4, 0.8, 0.2, 0.6];
    const w = (i: number) => petalRadius(petalCenter(i), pulls, 0.03, 0.085);
    expect(w(0)).toBeGreaterThan(w(1));
    expect(w(2)).toBeGreaterThan(w(3));
    const all = pulls.map((_, i) => w(i));
    expect(new Set(all.map((v) => v.toFixed(4))).size).toBe(PETAL_COUNT);
  });
  it('zero pull leaves the base ribbon width', () => {
    const w = petalRadius(0.5, new Array(PETAL_COUNT).fill(0), 0.03, 0.085);
    expect(w).toBeLessThan(0.031);
  });
});

describe('coil', () => {
  const basis = flowerBasis();
  const hang = hangControls();
  it('c=0 leaves the hanging tail untouched', () => {
    for (const [i, hp] of hang.entries()) {
      const s = i / (hang.length - 1);
      expect(coilPoint(s, 0, hp, basis).distanceTo(hp)).toBeLessThan(1e-6);
    }
  });
  it('at full coil the tip reaches the flower heart and the root stays anchored', () => {
    const tip = coilPoint(1, 1, hang[hang.length - 1], basis);
    expect(tip.distanceTo(FLOWER_CENTER)).toBeLessThan(0.06);
    const root = coilPoint(0, 1, hang[0], basis);
    expect(root.distanceTo(hang[0])).toBeLessThan(0.02);
  });
  it('wound points lie near the flower plane', () => {
    const n = FLOWER_CENTER.clone(); // reuse as scratch
    for (const s of [0.5, 0.7, 0.9]) {
      const p = coilPoint(s, 1, hang[Math.round(s * (hang.length - 1))], basis);
      const d = new THREE.Vector3().subVectors(p, FLOWER_CENTER);
      void n;
      const off = Math.abs(d.dot(new THREE.Vector3(0.72, 0.18, 0.67).normalize()));
      expect(off).toBeLessThan(0.08);
    }
  });
});

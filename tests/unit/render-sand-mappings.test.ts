import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  grainCountForLevel,
  pileHeightForLevel,
  pileRadiusForLevel,
  STREAM_MAX_OPACITY,
  STREAM_MAX_WIDTH,
  STREAM_MIN_WIDTH,
  streamOpacityForRate,
  streamScrollSpeedForRate,
  streamWidthForRate,
  surfaceYForLevel,
} from '../../src/visual/sand/mappings';
import { PARTICLE_BUDGET, PARTICLE_BUDGET_LOW, SAND_MAX_RATE } from '../../src/contracts/constants';
import { dustOffsetForProgress, dustOpacityForProgress } from '../../src/visual/dust';
import { advanceStreamScroll } from '../../src/visual/sand/sandVisual';

describe('streamWidthForRate / streamOpacityForRate', () => {
  it('0 rate -> hairline width, 0 opacity (gate closed = invisible stream)', () => {
    expect(streamWidthForRate(0)).toBe(STREAM_MIN_WIDTH);
    expect(streamOpacityForRate(0)).toBe(0);
  });

  it('SAND_MAX_RATE -> full width, full opacity', () => {
    expect(streamWidthForRate(SAND_MAX_RATE)).toBeCloseTo(STREAM_MAX_WIDTH, 9);
    expect(streamOpacityForRate(SAND_MAX_RATE)).toBeCloseTo(STREAM_MAX_OPACITY, 9);
  });

  it('is monotonically increasing in rate (gate open amount visibly tracks the stream)', () => {
    const rates = [0, 0.5, 1, 2, 3, 4, 5, SAND_MAX_RATE];
    for (let i = 1; i < rates.length; i++) {
      const prev = rates[i - 1] ?? 0;
      const curr = rates[i] ?? 0;
      expect(streamWidthForRate(curr)).toBeGreaterThanOrEqual(streamWidthForRate(prev));
      expect(streamOpacityForRate(curr)).toBeGreaterThanOrEqual(streamOpacityForRate(prev));
    }
  });

  it('clamps rates beyond SAND_MAX_RATE rather than overshooting', () => {
    expect(streamWidthForRate(SAND_MAX_RATE * 5)).toBeCloseTo(STREAM_MAX_WIDTH, 9);
    expect(streamOpacityForRate(SAND_MAX_RATE * 5)).toBeCloseTo(STREAM_MAX_OPACITY, 9);
  });

  it('scroll speed is also monotonic and strictly positive even at rate=0 (a resting stream is not perfectly frozen-looking if reused)', () => {
    expect(streamScrollSpeedForRate(0)).toBeGreaterThan(0);
    expect(streamScrollSpeedForRate(SAND_MAX_RATE)).toBeGreaterThan(streamScrollSpeedForRate(0));
  });
});

describe('grainCountForLevel', () => {
  it('is 0 at sandLevel=0 and exactly particleMax at sandLevel=1', () => {
    expect(grainCountForLevel(0, PARTICLE_BUDGET)).toBe(0);
    expect(grainCountForLevel(1, PARTICLE_BUDGET)).toBe(PARTICLE_BUDGET);
  });

  it('respects the low-tier particle budget cap', () => {
    expect(grainCountForLevel(1, PARTICLE_BUDGET_LOW)).toBe(PARTICLE_BUDGET_LOW);
    expect(grainCountForLevel(1, PARTICLE_BUDGET_LOW)).toBeLessThan(PARTICLE_BUDGET);
  });

  it('is monotonically non-decreasing in sandLevel', () => {
    let prev = -1;
    for (let level = 0; level <= 1; level += 0.1) {
      const n = grainCountForLevel(level, PARTICLE_BUDGET);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('clamps out-of-range sandLevel defensively', () => {
    expect(grainCountForLevel(-1, PARTICLE_BUDGET)).toBe(0);
    expect(grainCountForLevel(2, PARTICLE_BUDGET)).toBe(PARTICLE_BUDGET);
  });
});

describe('surfaceYForLevel', () => {
  it('interpolates linearly between floorY (empty) and fullY (full)', () => {
    expect(surfaceYForLevel(0, 0, 1)).toBe(0);
    expect(surfaceYForLevel(1, 0, 1)).toBe(1);
    expect(surfaceYForLevel(0.5, 0, 2)).toBe(1);
  });
});

describe('pileHeightForLevel / pileRadiusForLevel', () => {
  it('the pile is empty while the sandbox is full, and maximal once fully depleted (inverse of sandLevel)', () => {
    expect(pileHeightForLevel(1, 5)).toBe(0);
    expect(pileHeightForLevel(0, 5)).toBe(5);
    expect(pileRadiusForLevel(1, 3)).toBe(0);
    expect(pileRadiusForLevel(0, 3)).toBe(3);
  });

  it('is monotonically non-increasing in sandLevel (pile only grows as sand drains)', () => {
    let prevH = Infinity;
    for (let level = 0; level <= 1; level += 0.1) {
      const h = pileHeightForLevel(level, 5);
      expect(h).toBeLessThanOrEqual(prevH);
      prevH = h;
    }
  });
});

describe('dust puff progress curves', () => {
  it('offset starts at 0 and grows toward the max distance; opacity starts high and fades to 0', () => {
    expect(dustOffsetForProgress(0)).toBe(0);
    expect(dustOpacityForProgress(1)).toBe(0);
    expect(dustOpacityForProgress(0)).toBeGreaterThan(0);
  });

  it('offset is monotonically non-decreasing, opacity is monotonically non-increasing over progress', () => {
    let prevOffset = -1;
    let prevOpacity = Infinity;
    for (let p = 0; p <= 1; p += 0.1) {
      const off = dustOffsetForProgress(p);
      const op = dustOpacityForProgress(p);
      expect(off).toBeGreaterThanOrEqual(prevOffset);
      expect(op).toBeLessThanOrEqual(prevOpacity);
      prevOffset = off;
      prevOpacity = op;
    }
  });
});

describe('advanceStreamScroll', () => {
  function meshWithTexture(): THREE.Mesh {
    const tex = new THREE.Texture();
    tex.offset.set(0, 0);
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex }));
  }

  it('scrolls the texture V-offset over time — the "scrolling-UV stream mesh" requirement', () => {
    const mesh = meshWithTexture();
    const mat = mesh.material as THREE.MeshBasicMaterial;
    advanceStreamScroll(mesh, 1, SAND_MAX_RATE);
    expect(mat.map?.offset.y).not.toBe(0);
  });

  it('scrolls faster at a higher flow rate (speed visibly tracks gate openness)', () => {
    const slow = meshWithTexture();
    const fast = meshWithTexture();
    advanceStreamScroll(slow, 1, 0.5);
    advanceStreamScroll(fast, 1, SAND_MAX_RATE);
    const slowMat = slow.material as THREE.MeshBasicMaterial;
    const fastMat = fast.material as THREE.MeshBasicMaterial;
    const slowDelta = Math.abs(slowMat.map?.offset.y ?? 0);
    const fastDelta = Math.abs(fastMat.map?.offset.y ?? 0);
    expect(fastDelta).toBeGreaterThan(slowDelta);
  });

  it('is a no-op (does not throw) when the material has no texture', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    expect(() => {
      advanceStreamScroll(mesh, 1, SAND_MAX_RATE);
    }).not.toThrow();
  });
});

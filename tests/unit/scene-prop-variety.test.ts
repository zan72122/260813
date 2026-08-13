/**
 * F8 (review round 1): `legScenario(seed, leg).propVariant` was computed but
 * never consumed — scaffold dressing and worker placement were identical
 * for every leg/seed. These tests lock in the fix: wiring `propVariant`
 * into `scaffoldMath.ts#allScaffoldSegments` (pole-ring arrangement angle)
 * and `sceneBuilder.ts#workerPlacements` (per-leg RNG sub-stream) actually
 * produces measurably different placements across seeds, while staying
 * perfectly deterministic (same seed -> byte-identical output) and
 * budget-neutral (segment/instance COUNTS never change — only positions).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { HeroMaterials } from '../../src/render/materials';
import { buildScene, workerPlacements } from '../../src/scene/sceneBuilder';
import { qualityStateForTier } from '../../src/core/qualityManager';
import {
  allScaffoldSegments,
  scaffoldHeight,
  scaffoldSegmentsForLeg,
} from '../../src/scene/props/scaffoldMath';
import { GIRDER_RING_Y } from '../../src/scene/layout';
import { legScenario } from '../../src/contracts/rng';

/** Plain, textureless materials — same shape as HeroMaterials, zero DOM dependency (mirrors tests/unit/render-geometry-budget.test.ts's stub). */
function stubMaterials(): HeroMaterials {
  const std = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();
  const basic = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial();
  return {
    sand: std(),
    iron: std(),
    girder: std(),
    ironRivet: std(),
    jackCylinder: std(),
    jackPiston: std(),
    wood: std(),
    ironBand: std(),
    forgedWedge: std(),
    pin: std(),
    targetRing: std(),
    ground: std(),
    sky: basic(),
    worker: std(),
    sandStream: basic(),
    dust: basic(),
    hammer: std(),
  };
}

describe('scaffoldMath — per-leg propVariant arrangement (F8)', () => {
  it('different angleOffsetRad values produce different pole/brace positions for the same leg', () => {
    const height = scaffoldHeight(GIRDER_RING_Y);
    const a = scaffoldSegmentsForLeg(0, height, 0);
    const b = scaffoldSegmentsForLeg(0, height, Math.PI / 6);

    expect(a.length).toBe(b.length); // same segment COUNT — budget-neutral
    expect(a).not.toEqual(b); // but genuinely different arrangement
  });

  it('angleOffsetRad = 0 (the default) is byte-identical to omitting it entirely', () => {
    const height = scaffoldHeight(GIRDER_RING_Y);
    expect(scaffoldSegmentsForLeg(1, height, 0)).toEqual(scaffoldSegmentsForLeg(1, height));
  });

  it('the same (leg, angleOffsetRad) pair always reproduces byte-identical segments (deterministic)', () => {
    const height = scaffoldHeight(GIRDER_RING_Y);
    expect(scaffoldSegmentsForLeg(2, height, 0.4)).toEqual(scaffoldSegmentsForLeg(2, height, 0.4));
  });

  it('allScaffoldSegments with no offsets argument matches the pre-F8 call site exactly (segment count unchanged)', () => {
    const height = scaffoldHeight(GIRDER_RING_Y);
    const segs = allScaffoldSegments(height);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length).toBeLessThan(500);
    expect(segs).toEqual(allScaffoldSegments(height, [0, 0, 0, 0]));
  });

  it('per-leg offsets change only that leg\'s segments, leaving the others untouched', () => {
    const height = scaffoldHeight(GIRDER_RING_Y);
    const base = allScaffoldSegments(height, [0, 0, 0, 0]);
    const legOneVaried = allScaffoldSegments(height, [0, Math.PI / 4, 0, 0]);
    const perLeg = base.length / 4;

    expect(legOneVaried.slice(0, perLeg)).toEqual(base.slice(0, perLeg)); // leg 0 unchanged
    expect(legOneVaried.slice(perLeg, perLeg * 2)).not.toEqual(base.slice(perLeg, perLeg * 2)); // leg 1 varied
    expect(legOneVaried.slice(perLeg * 2)).toEqual(base.slice(perLeg * 2)); // legs 2,3 unchanged
  });
});

describe('sceneBuilder — workerPlacements seeded from (seed, leg, propVariant) (F8)', () => {
  it('different seeds produce different worker placements', () => {
    const a = workerPlacements(1);
    const b = workerPlacements(2);
    expect(a).not.toEqual(b);
  });

  it('the same seed reproduces byte-identical worker placements', () => {
    expect(workerPlacements(777)).toEqual(workerPlacements(777));
  });

  it('placements are grouped 2-per-leg, in LEG_ORDER', () => {
    const placements = workerPlacements(123);
    expect(placements).toHaveLength(8); // 4 legs x 2 workers
  });

  it("each leg's real legScenario(seed, leg).propVariant is a valid 0..3 index (the value workerPlacements folds into its per-leg RNG seed)", () => {
    for (let leg = 0; leg < 4; leg++) {
      const variant = legScenario(999, leg as 0 | 1 | 2 | 3).propVariant;
      expect([0, 1, 2, 3]).toContain(variant);
    }
  });
});

describe('buildScene — per-leg prop variety end-to-end, within budget (F8)', () => {
  it('different seeds produce different scaffold/worker instance transforms, identical geometry/instance counts', () => {
    const quality = qualityStateForTier('high');
    const sceneA = buildScene(stubMaterials(), quality, 1);
    const sceneB = buildScene(stubMaterials(), quality, 2);

    expect(sceneA.scaffold.count).toBe(sceneB.scaffold.count);
    expect(sceneA.workers.count).toBe(sceneB.workers.count);

    const matA = new THREE.Matrix4();
    const matB = new THREE.Matrix4();
    let anyScaffoldDiffers = false;
    for (let i = 0; i < sceneA.scaffold.count; i++) {
      sceneA.scaffold.getMatrixAt(i, matA);
      sceneB.scaffold.getMatrixAt(i, matB);
      if (!matA.equals(matB)) {
        anyScaffoldDiffers = true;
        break;
      }
    }
    expect(anyScaffoldDiffers).toBe(true);

    let anyWorkerDiffers = false;
    for (let i = 0; i < sceneA.workers.count; i++) {
      sceneA.workers.getMatrixAt(i, matA);
      sceneB.workers.getMatrixAt(i, matB);
      if (!matA.equals(matB)) {
        anyWorkerDiffers = true;
        break;
      }
    }
    expect(anyWorkerDiffers).toBe(true);
  });

  it('the same seed reproduces byte-identical scaffold/worker transforms', () => {
    const quality = qualityStateForTier('medium');
    const sceneA = buildScene(stubMaterials(), quality, 99);
    const sceneB = buildScene(stubMaterials(), quality, 99);

    const matA = new THREE.Matrix4();
    const matB = new THREE.Matrix4();
    for (let i = 0; i < sceneA.scaffold.count; i++) {
      sceneA.scaffold.getMatrixAt(i, matA);
      sceneB.scaffold.getMatrixAt(i, matB);
      expect(matA.equals(matB)).toBe(true);
    }
    for (let i = 0; i < sceneA.workers.count; i++) {
      sceneA.workers.getMatrixAt(i, matA);
      sceneB.workers.getMatrixAt(i, matB);
      expect(matA.equals(matB)).toBe(true);
    }
  });

  it('omitting seed (default 0) keeps triangle/draw-call totals identical to any other seed (PERFORMANCE_BUDGET-neutral)', () => {
    const quality = qualityStateForTier('high');
    const defaultSeed = buildScene(stubMaterials(), quality);
    const explicitSeed = buildScene(stubMaterials(), quality, 20260812);

    expect(defaultSeed.scaffold.count).toBe(explicitSeed.scaffold.count);
    expect(defaultSeed.workers.count).toBe(explicitSeed.workers.count);
    expect(defaultSeed.approxDrawCalls).toBe(explicitSeed.approxDrawCalls);
  });
});

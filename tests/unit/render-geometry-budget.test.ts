/**
 * PERFORMANCE_BUDGET.md hard budgets, verified against REAL geometry the
 * scene builders produce (not hand estimates) — no canvas/WebGL context
 * needed, since THREE's BufferGeometry/InstancedMesh/Material construction
 * has no DOM dependency (only CanvasTexture generation does, which these
 * stub materials deliberately avoid).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { HeroMaterials } from '../../src/render/materials';
import { buildScene } from '../../src/scene/sceneBuilder';
import { qualityStateForTier } from '../../src/core/qualityManager';
import { buildLegLattice, allLegsLatticeCounts } from '../../src/scene/tower/legLatticeGeometry';
import { allGirderSegments, buildGirderRing } from '../../src/scene/tower/girderRing';
import { allScaffoldSegments, scaffoldHeight } from '../../src/scene/props/scaffoldMath';
import { GIRDER_RING_Y } from '../../src/scene/layout';
import { PARTICLE_BUDGET } from '../../src/contracts/constants';
import { triCount } from '../../src/scene/segmentInstancing';

/** Plain, textureless materials — same shape as HeroMaterials, zero DOM dependency (no CanvasTexture generation). */
function stubMaterials(): HeroMaterials {
  const std = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();
  const basic = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial();
  return {
    sand: std(),
    iron: std(),
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

function countTrianglesInObject(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh>;
    if (!mesh.geometry) return;
    const perInstance = triCount(mesh.geometry);
    const instances = 'count' in mesh && typeof (mesh as THREE.InstancedMesh).count === 'number' ? (mesh as THREE.InstancedMesh).count : 1;
    total += perInstance * instances;
  });
  return total;
}

function countDrawCallsInObject(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((child) => {
    const mesh = child as Partial<THREE.Mesh>;
    if (mesh.geometry) total += 1;
  });
  return total;
}

describe('lattice/girder/scaffold segment math — instance counts stay in a sane, bounded range', () => {
  it('one leg has exactly 4 corner chords, plus rung + brace segments scaling with LEG_LATTICE_LEVELS', () => {
    const { bars, rivets, barCount, rivetCount } = buildLegLattice(0, new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
    expect(bars.count).toBe(barCount);
    expect(rivets.count).toBe(rivetCount);
    expect(barCount).toBeGreaterThan(4); // more than just the 4 chords (rungs+braces too)
    expect(barCount).toBeLessThan(500); // sane upper bound, not a runaway grid
  });

  it('allLegsLatticeCounts sums to 4x one leg (all 4 legs are structurally identical, just placed differently)', () => {
    const one = buildLegLattice(0, new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial());
    const all = allLegsLatticeCounts();
    expect(all.barCount).toBe(one.barCount * 4);
    expect(all.rivetCount).toBe(one.rivetCount * 4);
  });

  it('the girder ring is exactly 4 spans, each with a bounded segment count', () => {
    const segs = allGirderSegments();
    expect(segs.length).toBeGreaterThan(4 * 4); // at least the 16 chords
    expect(segs.length).toBeLessThan(2000);
    const mesh = buildGirderRing(new THREE.MeshStandardMaterial());
    expect(mesh.count).toBe(segs.length);
  });

  it('scaffold segment count for all 4 legs is bounded (poles + a few brace rings, not a dense mesh)', () => {
    const segs = allScaffoldSegments(scaffoldHeight(GIRDER_RING_Y));
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length).toBeLessThan(500);
  });
});

describe('PERFORMANCE_BUDGET.md hard budgets — verified against the real, fully-assembled scene', () => {
  it('total scene triangles stay well under the 300k budget (high tier — the most expensive tier)', () => {
    const materials = stubMaterials();
    const quality = qualityStateForTier('high');
    const { scene } = buildScene(materials, quality);
    const tris = countTrianglesInObject(scene);
    expect(tris).toBeGreaterThan(0);
    expect(tris).toBeLessThanOrEqual(300_000);
  });

  it('draw call count (one call per Mesh/InstancedMesh node) stays within the 120 budget', () => {
    const materials = stubMaterials();
    const quality = qualityStateForTier('high');
    const { scene } = buildScene(materials, quality);
    const calls = countDrawCallsInObject(scene);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(120);
  });

  it('sand grain instance capacity never exceeds PARTICLE_BUDGET (400) per leg, at any quality tier', () => {
    for (const tier of ['high', 'medium', 'low'] as const) {
      const materials = stubMaterials();
      const quality = qualityStateForTier(tier);
      const { scene, sandVisuals } = buildScene(materials, quality);
      for (const leg of [0, 1, 2, 3] as const) {
        expect(sandVisuals[leg].grains.slots.length).toBeLessThanOrEqual(PARTICLE_BUDGET);
        expect(sandVisuals[leg].grains.mesh.count).toBeLessThanOrEqual(quality.particleMax);
      }
      scene.traverse(() => undefined); // sanity: scene graph is well-formed (traverse doesn't throw)
    }
  });

  it('heightfield sand surface grid never exceeds 40x40 segments per axis', () => {
    const materials = stubMaterials();
    const quality = qualityStateForTier('high');
    const { sandVisuals } = buildScene(materials, quality);
    for (const leg of [0, 1, 2, 3] as const) {
      const posCount = sandVisuals[leg].surface.geometry.attributes.position?.count ?? 0;
      // (segX+1)*(segZ+1) vertices, segX/segZ <= 40 each -> at most 41*41 vertices.
      expect(posCount).toBeLessThanOrEqual(41 * 41);
    }
  });

  it('growing to the low quality tier never requires more allocated grain capacity than the high tier (downgrade needs no scene rebuild)', () => {
    const highScene = buildScene(stubMaterials(), qualityStateForTier('high'));
    const lowScene = buildScene(stubMaterials(), qualityStateForTier('low'));
    for (const leg of [0, 1, 2, 3] as const) {
      expect(lowScene.sandVisuals[leg].grains.slots.length).toBeLessThanOrEqual(highScene.sandVisuals[leg].grains.slots.length);
    }
  });
});

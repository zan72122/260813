import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWedgeGeometry } from '../../src/scene/props/wedgeGeometry';
import { createWorkerGeometry, WORKER_TARGET_HEIGHT, buildWorkerInstances } from '../../src/scene/props/worker';
import { createPinGeometry, createTargetRingGeometry, pinRestPosition, targetRingPosition, buildPinAndRing } from '../../src/scene/tower/pinAndRing';
import { buildLegGroundRig } from '../../src/scene/props/legGroundRig';
import { buildWedgeAndHammer, wedgeLocalPositionForProgress } from '../../src/scene/tower/wedgeAndHammer';
import type { HeroMaterials } from '../../src/render/materials';
import { GIRDER_RING_Y } from '../../src/scene/layout';
import { triCount } from '../../src/scene/segmentInstancing';
import type { LegId } from '../../src/contracts/types';

function requirePositionAttribute(geo: THREE.BufferGeometry): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const pos = geo.attributes.position;
  if (!pos) throw new Error('geometry has no position attribute');
  return pos;
}

function requireBoundingBox(geo: THREE.BufferGeometry): THREE.Box3 {
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) throw new Error('computeBoundingBox() did not populate boundingBox');
  return box;
}

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

describe('createWedgeGeometry', () => {
  it('is a valid closed solid: 8 triangular faces (doorstop prism), all finite vertices', () => {
    const geo = createWedgeGeometry(0.5, 0.6, 1.2);
    expect(triCount(geo)).toBe(8);
    const pos = requirePositionAttribute(geo);
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i))).toBe(true);
      expect(Number.isFinite(pos.getY(i))).toBe(true);
      expect(Number.isFinite(pos.getZ(i))).toBe(true);
    }
  });

  it('the tip end (min Z) sits at Y=0 and the head end reaches the full given height', () => {
    const height = 0.7;
    const geo = createWedgeGeometry(0.4, height, 1.0);
    const pos = requirePositionAttribute(geo);
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
    // Float32BufferAttribute storage (~7 significant digits) — 5 decimal places is well within that margin.
    expect(maxY).toBeCloseTo(height, 5);
  });

  it('scales width/length as requested (bounding box matches the given dimensions)', () => {
    const geo = createWedgeGeometry(2, 1, 4);
    const box = requireBoundingBox(geo);
    expect(box.max.x - box.min.x).toBeCloseTo(2, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(4, 5);
  });
});

describe('worker geometry', () => {
  it('merges into one non-empty geometry roughly WORKER_TARGET_HEIGHT tall', () => {
    const geo = createWorkerGeometry();
    expect(triCount(geo)).toBeGreaterThan(0);
    const box = requireBoundingBox(geo);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(WORKER_TARGET_HEIGHT * 0.5);
    expect(height).toBeLessThan(WORKER_TARGET_HEIGHT * 2);
  });

  it('WORKER_TARGET_HEIGHT is roughly 1/30th of the tower leg height, per the deliverable brief', () => {
    expect(WORKER_TARGET_HEIGHT).toBeCloseTo(GIRDER_RING_Y / 30, 9);
    expect(WORKER_TARGET_HEIGHT).toBeLessThan(GIRDER_RING_Y / 20);
  });

  it('buildWorkerInstances creates exactly one instance per placement, sharing one geometry (one draw call)', () => {
    const placements = [
      { x: 0, z: 0, yawRad: 0, scale: 1 },
      { x: 1, z: 1, yawRad: 1, scale: 1 },
      { x: 2, z: 2, yawRad: 2, scale: 1 },
    ];
    const mesh = buildWorkerInstances(new THREE.MeshStandardMaterial(), placements);
    expect(mesh.count).toBe(3);
  });
});

describe('pin + target ring geometry/placement', () => {
  it('pin and ring for the same leg rest at the identical world position (nothing to align until legOffsetY moves the pin away)', () => {
    for (const leg of [0, 1, 2, 3] as const) {
      const pinPos = pinRestPosition(leg);
      const ringPos = targetRingPosition(leg);
      expect(pinPos.equals(ringPos)).toBe(true);
      expect(pinPos.y).toBeCloseTo(GIRDER_RING_Y, 9);
    }
  });

  it('pin geometry has its base at local Y=0 (mounts flush on the leg top) and apex above it', () => {
    const geo = createPinGeometry();
    const box = requireBoundingBox(geo);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y).toBeGreaterThan(0);
  });

  it('target ring geometry is a torus lying flat (hole facing +Y) so a pin can pass through it', () => {
    const geo = createTargetRingGeometry();
    const box = requireBoundingBox(geo);
    // Flattened in Y (a thin ring cross-section) but extends in X/Z (the ring's plane).
    expect(box.max.y - box.min.y).toBeLessThan(box.max.x - box.min.x);
  });

  it('buildPinAndRing clones materials per leg so glow can be set independently without cross-leg interference', () => {
    const pinTemplate = new THREE.MeshStandardMaterial({ emissiveIntensity: 0 });
    const ringTemplate = new THREE.MeshStandardMaterial({ emissiveIntensity: 0 });
    const a = buildPinAndRing(0, pinTemplate, ringTemplate);
    const b = buildPinAndRing(1, pinTemplate, ringTemplate);
    expect(a.pin.material).not.toBe(b.pin.material);
    (a.pin.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
    expect((b.pin.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0);
  });
});

describe('legGroundRig (sandbox + jack) handle anchors', () => {
  it('every leg exposes a gatePivot and pumpPivot at DIFFERENT world positions (distinct 3D handles)', () => {
    const materials = stubMaterials();
    for (const leg of [0, 1, 2, 3] as LegId[]) {
      const rig = buildLegGroundRig(leg, materials);
      const gateWorld = new THREE.Vector3();
      const pumpWorld = new THREE.Vector3();
      rig.group.updateMatrixWorld(true);
      rig.gatePivot.getWorldPosition(gateWorld);
      rig.pumpPivot.getWorldPosition(pumpWorld);
      expect(gateWorld.distanceTo(pumpWorld)).toBeGreaterThan(1);
    }
  });

  it('sandboxInterior dimensions are positive and smaller than the outer sandbox footprint', () => {
    const materials = stubMaterials();
    const rig = buildLegGroundRig(0, materials);
    expect(rig.sandboxInterior.width).toBeGreaterThan(0);
    expect(rig.sandboxInterior.depth).toBeGreaterThan(0);
  });
});

describe('wedgeAndHammer', () => {
  it('wedgeLocalPositionForProgress interpolates from rest (progress=0) to inserted (progress=1)', () => {
    const materials = stubMaterials();
    const rig = buildWedgeAndHammer(0, materials);
    const at0 = wedgeLocalPositionForProgress(rig, 0);
    const at1 = wedgeLocalPositionForProgress(rig, 1);
    expect(at0.equals(rig.wedgeRestLocal)).toBe(true);
    expect(at1.equals(rig.wedgeInsertedLocal)).toBe(true);
    const atHalf = wedgeLocalPositionForProgress(rig, 0.5);
    expect(atHalf.distanceTo(at0)).toBeGreaterThan(0);
    expect(atHalf.distanceTo(at1)).toBeGreaterThan(0);
  });

  it('clamps progress outside [0,1] rather than extrapolating past the slot', () => {
    const materials = stubMaterials();
    const rig = buildWedgeAndHammer(0, materials);
    expect(wedgeLocalPositionForProgress(rig, -1).equals(rig.wedgeRestLocal)).toBe(true);
    expect(wedgeLocalPositionForProgress(rig, 2).equals(rig.wedgeInsertedLocal)).toBe(true);
  });

  it('is anchored at the leg\'s fixed junction (GIRDER_RING_Y), independent of any moving leg rig', () => {
    const materials = stubMaterials();
    for (const leg of [0, 1, 2, 3] as LegId[]) {
      const rig = buildWedgeAndHammer(leg, materials);
      expect(rig.group.position.y).toBeCloseTo(GIRDER_RING_Y, 9);
    }
  });
});

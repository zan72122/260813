/**
 * The two platform slabs the ride passes: a modest first-floor slab where
 * the track begins to curve (blend region, `BLEND_START_S`), and the
 * larger second-floor arrival platform at `STATION_TOP_S` (the
 * `arrivalReveal` cue's stage).
 */

import * as THREE from 'three';

import { BLEND_START_S, TRACK_LENGTH } from '../contracts/constants.ts';
import { trackPoint } from '../game/track.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';

/**
 * A simple HORIZONTAL deck (no Z-axis rotation): the slab's thin `slabThickness`
 * dimension always stays aligned with world +Y (vertical), extending outward
 * from the track point along world +X (away from the corridor, clear of the
 * camera poses in `cameraPoses.ts`, which offset along the track's in-plane
 * normal -- a very different, non-horizontal direction on the inclined leg).
 */
function buildSlab(
  s: number,
  depth: number,
  halfWidth: number,
  railHeight: number,
  materials: MaterialLibrary,
  registry: DisposeRegistry,
): THREE.Group {
  const [px, py] = trackPoint(s);
  const outwardX = 2;

  const group = new THREE.Group();
  const slabThickness = 0.6;
  const slabGeometry = registry.track(new THREE.BoxGeometry(depth, slabThickness, halfWidth * 2));
  const slab = new THREE.Mesh(slabGeometry, materials.iron);
  slab.position.set(px + outwardX + depth / 2, py - slabThickness / 2, 0);
  group.add(slab);

  // A simple brass-trimmed railing ring around the outer edge (facing the viewer/Paris side).
  const outerX = px + outwardX + depth;
  const railGeometry = registry.track(new THREE.CylinderGeometry(0.05, 0.05, halfWidth * 2, 6));
  const rail = new THREE.Mesh(railGeometry, materials.brass);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(outerX, py + railHeight, 0);
  group.add(rail);

  // Instanced posts (PERFORMANCE_BUDGET "InstancedMesh for ... static one-offs") --
  // one draw call for the whole row instead of one per post.
  const postGeometry = registry.track(new THREE.BoxGeometry(0.08, railHeight, 0.08));
  const postCount = 6;
  const posts = new THREE.InstancedMesh(postGeometry, materials.ironLit, postCount);
  const m = new THREE.Matrix4();
  for (let i = 0; i < postCount; i += 1) {
    const z = -halfWidth + (i / (postCount - 1)) * halfWidth * 2;
    m.makeTranslation(outerX, py + railHeight / 2, z);
    posts.setMatrixAt(i, m);
  }
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  return group;
}

export interface PlatformsResult {
  readonly group: THREE.Group;
  readonly firstFloorY: number;
  readonly secondFloorPosition: readonly [number, number, number];
}

export function buildPlatforms(materials: MaterialLibrary, registry: DisposeRegistry): PlatformsResult {
  const group = new THREE.Group();
  group.name = 'platforms';

  const firstFloor = buildSlab(BLEND_START_S, 6, 9, 1.0, materials, registry);
  group.add(firstFloor);

  const secondFloor = buildSlab(TRACK_LENGTH, 10, 12, 1.1, materials, registry);
  group.add(secondFloor);

  const [, firstY] = trackPoint(BLEND_START_S);
  const [topX, topY] = trackPoint(TRACK_LENGTH);

  return {
    group,
    firstFloorY: firstY,
    secondFloorPosition: [topX, topY, 0],
  };
}

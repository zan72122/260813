/**
 * Assembles the hero leg: lattice truss + twin rails/ties + the two
 * platform slabs + the distant-tower hint, all sharing the frozen track
 * curve. One entry point for `EiffelSceneWorld` to build/rebuild.
 */

import * as THREE from 'three';

import { BLEND_END_S, BLEND_START_S, TRACK_LENGTH } from '../contracts/constants.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import { buildLatticeLeg } from './latticeLeg.ts';
import { buildTrackCorridor } from './trackCorridor.ts';
import { buildPlatforms, type PlatformsResult } from './platforms.ts';
import { buildDistantTower } from './distantTower.ts';

/**
 * Arc-length windows where the leg's viewer-facing bracing is omitted
 * (VISUAL_ACCEPTANCE cutaway sliver): one near the base (the `establish`/
 * `cableFollow` reveal) and one spanning the blend arc with margin either
 * side (the `transitionClose`/`interiorProof` signature-moment shots need
 * the carrier, cabin and horizon visible through the same opening).
 */
const CORRIDOR_OPEN_RANGES: readonly (readonly [number, number])[] = [
  [4, 34],
  [BLEND_START_S - 20, BLEND_END_S + 24],
];

export interface TowerResult {
  readonly group: THREE.Group;
  readonly platforms: PlatformsResult;
  readonly rivetMesh: THREE.InstancedMesh;
  readonly fullRivetCount: number;
}

export function buildTower(materials: MaterialLibrary, registry: DisposeRegistry): TowerResult {
  const group = new THREE.Group();
  group.name = 'tower';

  const leg = buildLatticeLeg(
    {
      sStart: 0,
      sEnd: TRACK_LENGTH,
      frameSpacing: 6.4,
      baseHalfWidth: 5.4,
      topHalfWidth: 2.3,
      baseHalfThickness: 3.6,
      topHalfThickness: 1.9,
      openFrontRanges: CORRIDOR_OPEN_RANGES,
    },
    materials,
    registry,
  );
  group.add(leg.group);

  const corridor = buildTrackCorridor(materials, registry);
  group.add(corridor.group);

  const platforms = buildPlatforms(materials, registry);
  group.add(platforms.group);

  group.add(buildDistantTower(materials, registry));

  return { group, platforms, rivetMesh: leg.rivetMesh, fullRivetCount: leg.fullRivetCount };
}

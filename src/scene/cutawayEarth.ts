/**
 * The dollhouse earth cross-section: authored open geometry (no clipping
 * planes, no transparency) that reveals the underground machine room.
 * Solid painted cap faces on the back/sides/bottom; front + top are simply
 * absent so the camera looks straight into the room like a museum
 * cutaway model. VISUAL_ACCEPTANCE "Cutaway policy".
 */

import * as THREE from 'three';

import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';

export interface EarthBounds {
  readonly xMin: number;
  readonly xMax: number;
  readonly yBottom: number;
  /** Ground level, i.e. the open top of the cutaway (usually 0). */
  readonly yTop: number;
  readonly zMin: number;
  readonly zMax: number;
}

/** The machine room's excavated footprint (world meters). Front (-Z) and top are open. */
export const MACHINE_ROOM_BOUNDS: EarthBounds = {
  xMin: -3,
  xMax: 16,
  yBottom: -8.5,
  yTop: 0,
  zMin: -6,
  zMax: 6,
};

const GRASS_RIM_HEIGHT = 0.35;

function cap(width: number, height: number, materials: MaterialLibrary, registry: DisposeRegistry): THREE.Mesh {
  const geometry = registry.track(new THREE.PlaneGeometry(width, height));
  return new THREE.Mesh(geometry, materials.earth);
}

function grassRim(width: number, materials: MaterialLibrary, registry: DisposeRegistry): THREE.Mesh {
  const geometry = registry.track(new THREE.PlaneGeometry(width, GRASS_RIM_HEIGHT));
  return new THREE.Mesh(geometry, materials.ground);
}

export function buildEarthCutaway(
  bounds: EarthBounds,
  materials: MaterialLibrary,
  registry: DisposeRegistry,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'earthCutaway';
  const width = bounds.xMax - bounds.xMin;
  const depth = bounds.zMax - bounds.zMin;
  const height = bounds.yTop - bounds.yBottom;
  const cx = (bounds.xMin + bounds.xMax) / 2;
  const cz = (bounds.zMin + bounds.zMax) / 2;
  const cy = (bounds.yTop + bounds.yBottom) / 2;

  // Back wall (+Z, away from camera).
  const back = cap(width, height, materials, registry);
  back.position.set(cx, cy, bounds.zMax);
  group.add(back);
  const backRim = grassRim(width, materials, registry);
  backRim.position.set(cx, bounds.yTop + GRASS_RIM_HEIGHT / 2, bounds.zMax - 0.01);
  group.add(backRim);

  // Left / right side walls.
  const left = cap(depth, height, materials, registry);
  left.rotation.y = Math.PI / 2;
  left.position.set(bounds.xMin, cy, cz);
  group.add(left);
  const leftRim = grassRim(depth, materials, registry);
  leftRim.rotation.y = Math.PI / 2;
  leftRim.position.set(bounds.xMin + 0.01, bounds.yTop + GRASS_RIM_HEIGHT / 2, cz);
  group.add(leftRim);

  const right = cap(depth, height, materials, registry);
  right.rotation.y = -Math.PI / 2;
  right.position.set(bounds.xMax, cy, cz);
  group.add(right);
  const rightRim = grassRim(depth, materials, registry);
  rightRim.rotation.y = -Math.PI / 2;
  rightRim.position.set(bounds.xMax - 0.01, bounds.yTop + GRASS_RIM_HEIGHT / 2, cz);
  group.add(rightRim);

  // Floor.
  const floorGeometry = registry.track(new THREE.PlaneGeometry(width, depth));
  const floor = new THREE.Mesh(floorGeometry, materials.earth);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, bounds.yBottom, cz);
  group.add(floor);

  return group;
}

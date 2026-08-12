/**
 * A low-detail hint of the tower's other leg and the decorative arch
 * bridging the two, mirrored off the hero leg's own curve so the
 * establishing/menu shots unmistakably read as "the Eiffel Tower" rather
 * than an isolated ramp. Deliberately cheap (two tubes, no instancing)
 * since it is background dressing, never the focus.
 */

import * as THREE from 'three';

import { TRACK_LENGTH } from '../contracts/constants.ts';
import { trackPoint } from '../game/track.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';

function mirroredCurve(): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const samples = 24;
  for (let i = 0; i <= samples; i += 1) {
    const s = (i / samples) * TRACK_LENGTH;
    const [x, y] = trackPoint(s);
    points.push(new THREE.Vector3(-x, y, 0));
  }
  return new THREE.CatmullRomCurve3(points);
}

export function buildDistantTower(materials: MaterialLibrary, registry: DisposeRegistry): THREE.Group {
  const group = new THREE.Group();
  group.name = 'distantTowerHint';

  const pillarCurve = mirroredCurve();
  const pillarGeometry = registry.track(new THREE.TubeGeometry(pillarCurve, 40, 1.8, 8, false));
  const pillar = new THREE.Mesh(pillarGeometry, materials.iron);
  group.add(pillar);

  const heroArchPoint = trackPoint(24);
  const mirrorArchPoint: readonly [number, number, number] = [-heroArchPoint[0], heroArchPoint[1], 0];
  const archPoints = [
    new THREE.Vector3(heroArchPoint[0], heroArchPoint[1], 0),
    new THREE.Vector3(0, heroArchPoint[1] - 9, 0),
    new THREE.Vector3(mirrorArchPoint[0], mirrorArchPoint[1], 0),
  ];
  const archCurve = new THREE.CatmullRomCurve3(archPoints);
  const archGeometry = registry.track(new THREE.TubeGeometry(archCurve, 24, 1.1, 8, false));
  const arch = new THREE.Mesh(archGeometry, materials.iron);
  group.add(arch);

  return group;
}

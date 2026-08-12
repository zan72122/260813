/**
 * The twin rails + cross-ties the carrier actually rides on, laid the full
 * `TRACK_LENGTH` (128 m) using the frozen `src/game/track.ts` curve. Sits
 * inside the lattice leg's corridor; the corridor cutaway window
 * (`latticeLeg.ts`) is authored to line up with the base of this so the
 * rails are visible from the front early in the ride.
 */

import * as THREE from 'three';

import { TRACK_LENGTH } from '../contracts/constants.ts';
import { trackPoint, trackTangent } from '../game/track.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';

/** Half-distance between the twin rail centerlines, meters. */
export const RAIL_GAUGE_HALF = 0.8;
const RAIL_RADIUS = 0.09;
const SLEEPER_SPACING_M = 2;
const SLEEPER_SIZE = new THREE.Vector3(RAIL_GAUGE_HALF * 2 + 0.5, 0.12, 0.32);

function sampleCurvePoints(count: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= count; i += 1) {
    const s = (i / count) * TRACK_LENGTH;
    const [x, y] = trackPoint(s);
    points.push(new THREE.Vector3(x, y, 0));
  }
  return points;
}

function offsetCurvePoints(base: readonly THREE.Vector3[], lateralOffset: number): THREE.Vector3[] {
  return base.map((p) => new THREE.Vector3(p.x, p.y, lateralOffset));
}

export interface TrackCorridorResult {
  readonly group: THREE.Group;
}

export function buildTrackCorridor(materials: MaterialLibrary, registry: DisposeRegistry): TrackCorridorResult {
  const group = new THREE.Group();
  group.name = 'trackCorridor';

  const sampleCount = 64;
  const centerline = sampleCurvePoints(sampleCount);

  for (const side of [-1, 1] as const) {
    const railPoints = offsetCurvePoints(centerline, side * RAIL_GAUGE_HALF);
    const curve = new THREE.CatmullRomCurve3(railPoints, false, 'catmullrom', 0.1);
    const geometry = registry.track(new THREE.TubeGeometry(curve, 96, RAIL_RADIUS, 8, false));
    const mesh = new THREE.Mesh(geometry, materials.rail);
    group.add(mesh);
  }

  const sleeperCount = Math.floor(TRACK_LENGTH / SLEEPER_SPACING_M);
  const sleeperGeometry = registry.track(
    new THREE.BoxGeometry(SLEEPER_SIZE.x, SLEEPER_SIZE.y, SLEEPER_SIZE.z),
  );
  const sleepers = new THREE.InstancedMesh(sleeperGeometry, materials.ironLit, sleeperCount);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < sleeperCount; i += 1) {
    const s = (i + 0.5) * SLEEPER_SPACING_M;
    const [px, py] = trackPoint(s);
    const [tx, ty] = trackTangent(s);
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(tx, ty, 0));
    m.compose(new THREE.Vector3(px, py - 0.08, 0), q, new THREE.Vector3(1, 1, 1));
    sleepers.setMatrixAt(i, m);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  group.add(sleepers);

  return { group };
}

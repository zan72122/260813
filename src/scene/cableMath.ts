// src/scene/cableMath.ts
// Pure cable-curve math: drum -> sheave -> hook, sampled as a CatmullRom
// spline. THREE's math classes (Vector3, CatmullRomCurve3) have no DOM/GPU
// dependency so this stays unit-testable under vitest's node environment.

import { CatmullRomCurve3, Vector3 } from 'three';

export interface CableEndpoints {
  drum: Vector3;
  sheave: Vector3;
  hook: Vector3;
}

/** Endpoints are "the same" (skip an expensive tube rebuild) below this movement. */
export const CABLE_EPSILON = 0.01;

export function endpointsChanged(a: CableEndpoints, b: CableEndpoints): boolean {
  return (
    a.drum.distanceTo(b.drum) > CABLE_EPSILON ||
    a.sheave.distanceTo(b.sheave) > CABLE_EPSILON ||
    a.hook.distanceTo(b.hook) > CABLE_EPSILON
  );
}

/**
 * Build the spline the cable follows: drum -> sheave (fixed geometry path
 * over the boom) -> hook, with a slack sag control point when `slack > 0`
 * (sling released) so the cable visibly droops instead of staying razor-taut.
 */
export function buildCableCurve(endpoints: CableEndpoints, slack: number): CatmullRomCurve3 {
  const { drum, sheave, hook } = endpoints;
  const points: Vector3[] = [drum.clone(), sheave.clone()];
  const sag = Math.max(0, slack) * 0.6;
  if (sag > 0.001) {
    const mid = sheave.clone().lerp(hook, 0.5);
    mid.y -= sag;
    points.push(mid);
  }
  points.push(hook.clone());
  return new CatmullRomCurve3(points, false, 'catmullrom', 0.3);
}

/** Sample N evenly spaced points along the cable curve (for TubeGeometry). */
export function sampleCable(endpoints: CableEndpoints, slack: number, segments: number): Vector3[] {
  const curve = buildCableCurve(endpoints, slack);
  return curve.getPoints(Math.max(2, segments));
}

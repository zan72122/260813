// src/scene/cable.ts
// Thin THREE wrapper over cableMath.ts: a low-segment TubeGeometry rebuilt
// only when the drum/sheave/hook endpoints move beyond epsilon (checked by
// the caller every frame via endpointsChanged, which is cheap distance math
// — the expensive TubeGeometry rebuild itself only runs on real movement).

import { Mesh, TubeGeometry, Vector3 } from 'three';
import { buildCableCurve, type CableEndpoints } from './cableMath';
import type { MaterialSet } from '../visual/materials';

const TUBULAR_SEGMENTS = 14;
const RADIAL_SEGMENTS = 5;
const CABLE_RADIUS = 0.035;

export interface CableRig {
  mesh: Mesh;
  rebuild(endpoints: CableEndpoints, slack: number): void;
  dispose(): void;
}

export function createCableRig(materials: MaterialSet): CableRig {
  const initial: CableEndpoints = {
    drum: new Vector3(0, 1, 0),
    sheave: new Vector3(1, 1, 0),
    hook: new Vector3(1, 0, 0),
  };
  let geometry = new TubeGeometry(
    buildCableCurve(initial, 0),
    TUBULAR_SEGMENTS,
    CABLE_RADIUS,
    RADIAL_SEGMENTS,
    false,
  );
  const mesh = new Mesh(geometry, materials.ironDark);

  function rebuild(endpoints: CableEndpoints, slack: number): void {
    const curve = buildCableCurve(endpoints, slack);
    const next = new TubeGeometry(curve, TUBULAR_SEGMENTS, CABLE_RADIUS, RADIAL_SEGMENTS, false);
    mesh.geometry.dispose();
    mesh.geometry = next;
    geometry = next;
  }

  function dispose(): void {
    geometry.dispose();
  }

  return { mesh, rebuild, dispose };
}

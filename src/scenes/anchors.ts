// src/scenes/anchors.ts
// SceneAnchors: the garden's static layout (fountain positions/nozzle
// transforms, valve transform, pipe curves, procession path). Pure data — no
// live THREE.Scene/renderer dependency — so src/game and src/camera can both
// import it directly to stay anchored to the same world-space positions as
// the geometry built in src/scenes/index.ts, without needing a runtime
// contract event to describe static layout. Per docs/CONTRACTS.md wiring
// conventions: "B の VFX/材質はこのアンカーへ Integrator が接続する".

import * as THREE from 'three';
import { ALL_FOUNTAIN_IDS, type FountainId } from '../contracts';

export interface FountainAnchor {
  readonly id: FountainId;
  /** Basin center, at ground level. */
  readonly center: THREE.Vector3;
  readonly basinRadius: number;
  /** Stable mesh name for the nozzle/jet placeholder Worker B will upgrade. */
  readonly nozzleName: string;
  /** Where the king's procession pauses to watch this fountain activate. */
  readonly kingStop: THREE.Vector3;
}

export interface ValveAnchor {
  readonly position: THREE.Vector3;
  readonly restRotationY: number;
  /** World-space position of the interactive valve head + wrench (src/scenes/
   * build/valve.ts places the head at local y=0.61 above `position`), i.e.
   * what the valve-macro camera beat actually frames (src/camera/beats.ts
   * VALVE_MACRO_*_POSE lookAt) and what a debug/hit-test hotspot should
   * project — NOT the ground-level `position`, which sits well below the
   * visible target once the macro shot is framed. */
  readonly headPosition: THREE.Vector3;
}

/** Local Y offset of the valve head + wrench above the ground-level valve
 * anchor, matching src/scenes/build/valve.ts's `head.position.y = 0.5 + 0.11`. */
export const VALVE_HEAD_HEIGHT = 0.61;

export interface SceneAnchors {
  readonly valve: ValveAnchor;
  readonly whistlePosition: THREE.Vector3;
  readonly fountains: Readonly<Record<FountainId, FountainAnchor>>;
  /** valve -> each fountain, routed underground. Sampled by the pipe-run
   * camera beat and the pipe cutaway geometry alike. */
  readonly pipeCurves: Readonly<Record<FountainId, THREE.CatmullRomCurve3>>;
  /** Full garden walking path, entrance to exit, passing every fountain. */
  readonly processionPath: THREE.CatmullRomCurve3;
  readonly processionStart: THREE.Vector3;
}

const FOUNTAIN_Z: Record<FountainId, number> = {
  'fountain-fan': -5,
  'fountain-ring': 0,
  'fountain-crown': 5,
};

const BASIN_RADIUS: Record<FountainId, number> = {
  'fountain-fan': 1.5,
  'fountain-ring': 1.3,
  'fountain-crown': 1.6,
};

const NOZZLE_NAME: Record<FountainId, string> = {
  'fountain-fan': 'fountain-fan-nozzle',
  'fountain-ring': 'fountain-ring-nozzle',
  'fountain-crown': 'fountain-crown-nozzle',
};

const VALVE_POSITION = new THREE.Vector3(-3.2, 0, -1);
const VALVE_UNDERGROUND = new THREE.Vector3(-3.2, -1.3, -1);
const WHISTLE_POSITION = new THREE.Vector3(-2.0, 1.15, -1.9);

function buildFountainAnchors(): Record<FountainId, FountainAnchor> {
  const result = {} as Record<FountainId, FountainAnchor>;
  for (const id of ALL_FOUNTAIN_IDS) {
    const z = FOUNTAIN_Z[id];
    result[id] = {
      id,
      center: new THREE.Vector3(0, 0, z),
      basinRadius: BASIN_RADIUS[id],
      nozzleName: NOZZLE_NAME[id],
      kingStop: new THREE.Vector3(0, 0, z - 1.6),
    };
  }
  return result;
}

function buildPipeCurves(fountains: Record<FountainId, FountainAnchor>): Record<FountainId, THREE.CatmullRomCurve3> {
  const result = {} as Record<FountainId, THREE.CatmullRomCurve3>;
  for (const id of ALL_FOUNTAIN_IDS) {
    const target = fountains[id].center;
    const mid = new THREE.Vector3(
      (VALVE_UNDERGROUND.x + target.x) / 2,
      -1.7,
      (VALVE_UNDERGROUND.z + target.z) / 2,
    );
    const arrival = new THREE.Vector3(target.x, -0.35, target.z);
    result[id] = new THREE.CatmullRomCurve3(
      [VALVE_UNDERGROUND.clone(), mid, arrival],
      false,
      'catmullrom',
      0.5,
    );
  }
  return result;
}

function buildProcessionPath(fountains: Record<FountainId, FountainAnchor>): {
  path: THREE.CatmullRomCurve3;
  start: THREE.Vector3;
} {
  const start = new THREE.Vector3(0, 0, -9.5);
  const end = new THREE.Vector3(0, 0, 9.5);
  const points: THREE.Vector3[] = [start];
  for (const id of ALL_FOUNTAIN_IDS) {
    points.push(fountains[id].kingStop.clone());
    points.push(fountains[id].center.clone().setY(0));
  }
  points.push(end);
  return { path: new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4), start };
}

export function createSceneAnchors(): SceneAnchors {
  const fountains = buildFountainAnchors();
  const { path, start } = buildProcessionPath(fountains);
  return {
    valve: {
      position: VALVE_POSITION.clone(),
      restRotationY: 0,
      headPosition: VALVE_POSITION.clone().setY(VALVE_POSITION.y + VALVE_HEAD_HEIGHT),
    },
    whistlePosition: WHISTLE_POSITION.clone(),
    fountains,
    pipeCurves: buildPipeCurves(fountains),
    processionPath: path,
    processionStart: start,
  };
}

let cached: SceneAnchors | null = null;

/** Lazily-built singleton — anchors are pure static layout data, safe to share. */
export function getSceneAnchors(): SceneAnchors {
  if (!cached) cached = createSceneAnchors();
  return cached;
}

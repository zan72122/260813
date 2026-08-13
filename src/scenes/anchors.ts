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

// Clear of every hedge parterre block (hedges span x in [1.85, 3.35] on each
// side, see build/ground.ts HEDGE_X) so the valve nook + whistle post read as
// their own clearing beside the path, not stacked on/inside a hedge — Gate B
// Wave 5 fix: they previously overlapped a hedge block at x=-3.2/z=-1. Also
// moved near the garden entrance (z close to the -9.5 start of the path) so
// beat-establish (src/camera/beats.ts) can frame them as the near foreground
// while the whole path + all 3 fountains recede into the distance beyond.
const VALVE_POSITION = new THREE.Vector3(-5.1, 0, -8.5);
const WHISTLE_POSITION = new THREE.Vector3(-4.0, 1.15, -7.8);

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
  // Gate B round 3: docs/CAMERA_STORYBOARD.md redesigned beat-pipe-cutaway as
  // a "diagram-style cross-section" — a dedicated straight display segment
  // viewed side-on, not the real curved underground route. The old curve
  // (a single midpoint dipping well below both endpoints) had unpredictable
  // per-fountain direction changes that made a locked side-on camera
  // impossible to frame consistently and let neighboring fountains' trenches
  // cross in view. This is now a flat "cruise" run at a constant depth in the
  // vertical plane containing the valve->fountain direction (zero sideways
  // drift), with a short drop near the valve and a rise into the fountain's
  // basin riser at the very end — reads as portrait's "Z字/L字" shape when
  // the camera is zoomed into a segment, and as landscape's "one horizontal
  // run" when zoomed out, purely via camera framing (src/camera/beats.ts),
  // no per-orientation geometry needed.
  //
  // This function feeds src/app/presentationWiring.ts's
  // `createPipeFlow(anchors.pipeCurves[id])` call unmodified — the "display
  // curve" IS anchors.pipeCurves now, so Worker B's VFX pipe/water shell
  // automatically follows the same simplified route without any src/app or
  // src/vfx change.
  const result = {} as Record<FountainId, THREE.CatmullRomCurve3>;
  const startDepth = -0.9;
  const cruiseDepth = -1.25;
  const arrivalDepth = -0.3;

  for (const id of ALL_FOUNTAIN_IDS) {
    const target = fountains[id].center;
    const runVec = new THREE.Vector3(target.x - VALVE_POSITION.x, 0, target.z - VALVE_POSITION.z);
    const runLength = Math.max(0.5, runVec.length());
    const runDir = runVec.clone().normalize();

    const atS = (s: number, y: number): THREE.Vector3 =>
      VALVE_POSITION.clone().addScaledVector(runDir, s * runLength).setY(y);

    const points = [
      atS(0, startDepth),
      atS(0.1, cruiseDepth),
      atS(0.5, cruiseDepth),
      atS(0.82, cruiseDepth),
      atS(1, arrivalDepth),
    ];
    result[id] = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
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

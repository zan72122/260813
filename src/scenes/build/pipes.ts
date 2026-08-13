// src/scenes/build/pipes.ts
// Underground pipe cutaway: one TubeGeometry per fountain routed from the
// valve (src/scenes/anchors.ts pipeCurves), visible once the camera descends
// below y=0 during pipe-run (ordinary depth occlusion against the opaque
// single-sided lawn plane does the "cutaway" for free — no shader needed).
//
// Gate B Wave 5 fix #4: added a soil trench trough around each pipe so a
// camera positioned outside the pipe (src/camera/beats.ts
// PIPE_CAMERA_OFFSETS) reads "underground trench with a pipe running
// through it", not just a bare cylinder. Built as hand-sampled ribbons
// (floor + two walls) using the SAME stable up/tangent-cross frame as
// src/camera/player.ts's pipe-run camera offset, deliberately not
// THREE.ExtrudeGeometry's extrudePath — that uses Frenet frames, which can
// twist/balloon unpredictably around a curve's start tangent and blew the
// trench cross-section up far larger than intended, putting the "outside"
// camera effectively inside it.
//
// Gate B round 2 fix: src/app/presentationWiring.ts (Integrator) hides the
// WHOLE 'pipe-network' group by name once Worker B's real VFX pipe/water
// shell (src/vfx/pipeFlow.ts) takes over — that's correct for the placeholder
// pipe tube + water blob below (Worker B's version is better), but it was
// silently taking the trench walls down with it, leaving pipe-run with only
// a bare tube floating on the sky gradient: no ground line, no trench, no
// visible water. The trench is real scene geometry (Worker B's VFX only
// covers the pipe/water shader, not terrain), so it's now returned as a
// SEPARATE, separately-named group the integrator's hide-by-name call never
// touches — see registerScenes() in src/scenes/index.ts, which adds both.

import * as THREE from 'three';
import type { FountainId } from '../../contracts';
import { getSceneAnchors } from '../anchors';
import { brassMaterial, soilMaterial, waterMaterial } from './materials';

export interface PipesVisual {
  /** Placeholder pipe tube + water blob — hidden by src/app/presentationWiring.ts
   * once Worker B's real VFX pipe/water (src/vfx/pipeFlow.ts) is wired in. */
  readonly group: THREE.Group;
  /** Soil trench walls — always visible; NOT superseded by the VFX pass,
   * since Worker B's VFX only covers the pipe shell + water, not terrain. */
  readonly trenchGroup: THREE.Group;
  readonly waterBlob: THREE.Mesh;
  /** Move the glowing water blob to t (0..1) along the given fountain's pipe. */
  setWaterProgress(fountain: FountainId, t: number): void;
  setBlobVisible(visible: boolean): void;
}

const PIPE_RADIUS = 0.16;
// Snug around the pipe (radius 0.16) rather than a wide pit: all three
// fountains' trenches fan out from the same shared valve point, so a wide
// cross-section made neighboring trenches overlap in view near the start of
// the run, and a deep/wide pit needed a near-vertical camera angle to see
// past its own walls down to the pipe at all.
const TRENCH_HALF_WIDTH = 0.4;
const TRENCH_DEPTH = 0.4;
const TRENCH_WALL_TOP = 0.04;
const UP = new THREE.Vector3(0, 1, 0);

interface CurveFrame {
  point: THREE.Vector3;
  side: THREE.Vector3;
}

function sampleFrames(curve: THREE.CatmullRomCurve3, steps: number): CurveFrame[] {
  const frames: CurveFrame[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(UP, tangent);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    frames.push({ point, side });
  }
  return frames;
}

/** A flat quad-strip ribbon following `frames`, with each edge offset from
 * the centerline by `edgeA`/`edgeB` (local x = along `side`, local y = up). */
function buildRibbon(
  frames: CurveFrame[],
  edgeA: [number, number],
  edgeB: [number, number],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();

  for (const f of frames) {
    va.copy(f.point).addScaledVector(f.side, edgeA[0]).addScaledVector(UP, edgeA[1]);
    vb.copy(f.point).addScaledVector(f.side, edgeB[0]).addScaledVector(UP, edgeB[1]);
    positions.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
  }
  for (let i = 0; i < frames.length - 1; i++) {
    const i0 = i * 2;
    const i1 = i * 2 + 1;
    const i2 = (i + 1) * 2;
    const i3 = (i + 1) * 2 + 1;
    indices.push(i0, i2, i1, i1, i2, i3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildTrench(curve: THREE.CatmullRomCurve3, id: FountainId, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = `trench-${id}`;
  const frames = sampleFrames(curve, 32);

  const floor = new THREE.Mesh(
    buildRibbon(frames, [-TRENCH_HALF_WIDTH, -TRENCH_DEPTH], [TRENCH_HALF_WIDTH, -TRENCH_DEPTH]),
    material,
  );
  const leftWall = new THREE.Mesh(
    buildRibbon(frames, [-TRENCH_HALF_WIDTH, TRENCH_WALL_TOP], [-TRENCH_HALF_WIDTH, -TRENCH_DEPTH]),
    material,
  );
  const rightWall = new THREE.Mesh(
    buildRibbon(frames, [TRENCH_HALF_WIDTH, -TRENCH_DEPTH], [TRENCH_HALF_WIDTH, TRENCH_WALL_TOP]),
    material,
  );
  group.add(floor, leftWall, rightWall);
  return group;
}

export function buildPipes(): PipesVisual {
  const anchors = getSceneAnchors();
  const group = new THREE.Group();
  group.name = 'pipe-network';
  const trenchGroup = new THREE.Group();
  trenchGroup.name = 'pipe-trench-network';

  const pipeMat = brassMaterial();
  const trenchMat = soilMaterial();
  // Hand-built ribbon winding isn't guaranteed to face the (arbitrary) camera
  // side consistently for every curve direction — DoubleSide keeps every
  // trench wall visible regardless.
  trenchMat.side = THREE.DoubleSide;

  for (const id of Object.keys(anchors.pipeCurves) as FountainId[]) {
    const curve = anchors.pipeCurves[id];

    trenchGroup.add(buildTrench(curve, id, trenchMat));

    const geometry = new THREE.TubeGeometry(curve, 40, PIPE_RADIUS, 10, false);
    const mesh = new THREE.Mesh(geometry, pipeMat);
    mesh.name = `pipe-${id}`;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  // An elongated glowing "water slug" (not a small sphere) so it reads
  // clearly as water traveling through the pipe from an external 3rd-person
  // camera angle, rather than a barely-visible dot.
  const waterBlob = new THREE.Mesh(new THREE.CapsuleGeometry(PIPE_RADIUS * 0.9, 0.9, 4, 10), waterMaterial());
  waterBlob.name = 'pipe-water-blob';
  waterBlob.visible = false;
  group.add(waterBlob);

  const point = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  return {
    group,
    trenchGroup,
    waterBlob,
    setWaterProgress(fountain: FountainId, t: number): void {
      const curve = anchors.pipeCurves[fountain];
      const clamped = THREE.MathUtils.clamp(t, 0, 1);
      curve.getPointAt(clamped, point);
      curve.getPointAt(Math.min(1, clamped + 0.02), ahead);
      waterBlob.position.copy(point);
      tangent.copy(ahead).sub(point);
      if (tangent.lengthSq() > 1e-6) {
        // CapsuleGeometry's long axis defaults to Y; align it with the pipe's
        // direction of travel so the slug reads as flowing through the pipe.
        waterBlob.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.normalize());
      }
    },
    setBlobVisible(visible: boolean): void {
      waterBlob.visible = visible;
    },
  };
}

/**
 * The hero leg's iron lattice: a tapering truss tube that follows the
 * frozen `src/game/track.ts` curve (line - blend arc - line, 54deg -> 74deg),
 * built from InstancedMesh struts + rivet hints (PERFORMANCE_BUDGET
 * "InstancedMesh for lattice girders/rivets"). A chosen arc-length window
 * omits the viewer-facing (+N, "back" corners) bracing to open the "track
 * corridor sliver" (VISUAL_ACCEPTANCE "Cutaway policy") so the twin rails
 * inside read clearly without any transparency/clipping trick. Every
 * camera pose in `src/visual/cameraPoses.ts` sits on this same +N side.
 */

import * as THREE from 'three';

import { TRACK_LENGTH } from '../contracts/constants.ts';
import { trackPoint, trackTangent } from '../game/track.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import { computeStrutMatrix } from './geomUtils.ts';

/** One computed cross-section frame along the leg. */
interface LegFrame {
  readonly s: number;
  readonly backLeft: THREE.Vector3;
  readonly backRight: THREE.Vector3;
  readonly frontLeft: THREE.Vector3;
  readonly frontRight: THREE.Vector3;
}

export interface LatticeLegOptions {
  readonly sStart: number;
  readonly sEnd: number;
  readonly frameSpacing: number;
  readonly baseHalfWidth: number;
  readonly topHalfWidth: number;
  readonly baseHalfThickness: number;
  readonly topHalfThickness: number;
  /** [sFrom, sTo] windows where the viewer-facing (+N) bracing is omitted. */
  readonly openFrontRanges: readonly (readonly [number, number])[];
}

export interface LatticeLegResult {
  readonly group: THREE.Group;
  readonly frames: readonly LegFrame[];
  /** Rivet-hint instances -- safe to thin out first when the quality tier drops. */
  readonly rivetMesh: THREE.InstancedMesh;
  readonly fullRivetCount: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function computeFrame(s: number, halfWidthAt: (t: number) => number, halfThickAt: (t: number) => number): LegFrame {
  const [px, py] = trackPoint(s);
  const [tx, ty] = trackTangent(s);
  const t = s / TRACK_LENGTH;
  const halfWidth = halfWidthAt(t);
  const halfThick = halfThickAt(t);
  // In-plane perpendicular to the tangent (rotate +90 deg in X-Y).
  const nx = -ty;
  const ny = tx;
  const p = new THREE.Vector3(px, py, 0);
  const n = new THREE.Vector3(nx, ny, 0).multiplyScalar(halfThick);
  const z = new THREE.Vector3(0, 0, halfWidth);
  return {
    s,
    backLeft: p.clone().add(n).sub(z),
    backRight: p.clone().add(n).add(z),
    frontLeft: p.clone().sub(n).sub(z),
    frontRight: p.clone().sub(n).add(z),
  };
}

function isInOpenRange(s: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([from, to]) => s >= from && s <= to);
}

const strutMatrix = computeStrutMatrix;

const CHORD_THICKNESS = 0.3;
const BRACE_THICKNESS = 0.16;
const TIE_THICKNESS = 0.2;
const RIVET_RADIUS = 0.11;

export function buildLatticeLeg(
  options: LatticeLegOptions,
  materials: MaterialLibrary,
  registry: DisposeRegistry,
): LatticeLegResult {
  const { sStart, sEnd, frameSpacing } = options;
  const frameCount = Math.max(2, Math.round((sEnd - sStart) / frameSpacing) + 1);
  const halfWidthAt = (t: number): number => lerp(options.baseHalfWidth, options.topHalfWidth, t);
  const halfThickAt = (t: number): number => lerp(options.baseHalfThickness, options.topHalfThickness, t);

  const frames: LegFrame[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const s = lerp(sStart, sEnd, i / (frameCount - 1));
    frames.push(computeFrame(s, halfWidthAt, halfThickAt));
  }

  // Count struts up-front so the InstancedMesh buffers are exactly sized.
  let strutCount = 0;
  for (let i = 0; i < frames.length - 1; i += 1) {
    strutCount += 4; // corner chords
    strutCount += 2; // front-face X-brace (always present -- this is the -N, away-from-viewer side)
    strutCount += 2; // left-face X-brace
    strutCount += 2; // right-face X-brace
    const frame = frames[i]!;
    // back-face (+N, viewer-side) X-brace -- omitted inside the corridor cutaway window
    if (!isInOpenRange(frame.s, options.openFrontRanges)) strutCount += 2;
  }
  strutCount += frames.length * 4; // horizontal ties per frame (back/front/left/right)

  const strutGeometry = registry.track(new THREE.BoxGeometry(1, 1, 1));
  const strutMesh = new THREE.InstancedMesh(strutGeometry, materials.iron, strutCount);
  strutMesh.castShadow = false;
  strutMesh.receiveShadow = false;

  const rivetGeometry = registry.track(new THREE.IcosahedronGeometry(RIVET_RADIUS, 0));
  const rivetMesh = new THREE.InstancedMesh(rivetGeometry, materials.ironLit, frames.length * 4);

  const m = new THREE.Matrix4();
  let strutIndex = 0;
  let rivetIndex = 0;

  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i]!;
    for (const corner of [f.backLeft, f.backRight, f.frontLeft, f.frontRight]) {
      m.makeTranslation(corner.x, corner.y, corner.z);
      m.scale(new THREE.Vector3(RIVET_RADIUS * 6, RIVET_RADIUS * 6, RIVET_RADIUS * 6));
      rivetMesh.setMatrixAt(rivetIndex, m);
      rivetIndex += 1;
    }
    // Ring ties at every frame.
    strutMatrix(f.backLeft, f.backRight, TIE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.frontLeft, f.frontRight, TIE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.backLeft, f.frontLeft, TIE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.backRight, f.frontRight, TIE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;

    if (i === frames.length - 1) continue;
    const g = frames[i + 1]!;

    strutMatrix(f.backLeft, g.backLeft, CHORD_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.backRight, g.backRight, CHORD_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.frontLeft, g.frontLeft, CHORD_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.frontRight, g.frontRight, CHORD_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;

    // Front face X-brace (always present -- this is the -N, away-from-viewer side; keeps it reading solid).
    strutMatrix(f.frontLeft, g.frontRight, BRACE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.frontRight, g.frontLeft, BRACE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;

    // Left / right face X-braces.
    strutMatrix(f.backLeft, g.frontLeft, BRACE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.frontLeft, g.backLeft, BRACE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.backRight, g.frontRight, BRACE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;
    strutMatrix(f.frontRight, g.backRight, BRACE_THICKNESS, m);
    strutMesh.setMatrixAt(strutIndex, m);
    strutIndex += 1;

    // Back face X-brace (+N, viewer side) -- omitted inside the authored corridor cutaway window.
    if (!isInOpenRange(f.s, options.openFrontRanges)) {
      strutMatrix(f.backLeft, g.backRight, BRACE_THICKNESS, m);
      strutMesh.setMatrixAt(strutIndex, m);
      strutIndex += 1;
      strutMatrix(f.backRight, g.backLeft, BRACE_THICKNESS, m);
      strutMesh.setMatrixAt(strutIndex, m);
      strutIndex += 1;
    }
  }

  strutMesh.instanceMatrix.needsUpdate = true;
  rivetMesh.instanceMatrix.needsUpdate = true;
  strutMesh.count = strutIndex;
  rivetMesh.count = rivetIndex;

  const group = new THREE.Group();
  group.name = 'latticeLeg';
  group.add(strutMesh, rivetMesh);

  return { group, frames, rivetMesh, fullRivetCount: rivetIndex };
}

/**
 * One leg's ground-level rig: the wooden sandbox (with cutaway interior,
 * iron bands, and a big gate handle) and the hydraulic jack (black-iron
 * cylinder, brass piston, two-hand pump lever) — PRODUCT_SPEC's per-leg
 * sand/jack apparatus. Both are built in a shared LOCAL frame (local +Z =
 * "faces outward from the tower", local +X = "toward the jack side") and
 * mounted under one Group per leg, positioned/rotated once via
 * `layout.legOutwardYawRadians` — see that function's doc comment.
 *
 * The wedge/hammer (used later in the same leg's sequence) live at the
 * leg's TOP junction instead (scene/tower/wedgeAndHammer.ts), since they
 * operate on the pin/ring, not the ground props.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LegId } from '../../contracts/types';
import {
  GROUND_PROP_LATERAL_OFFSET,
  GROUND_Y,
  JACK_CYLINDER_HEIGHT,
  JACK_CYLINDER_RADIUS,
  LEG_CHORD_HALF_WIDTH_BASE,
  SANDBOX_DEPTH,
  SANDBOX_HEIGHT,
  SANDBOX_WALL_THICKNESS,
  SANDBOX_WIDTH,
  legBaseXZ,
  legOutwardYawRadians,
} from '../layout';
import type { HeroMaterials } from '../../render/materials';

// Sandbox/jack hero dimensions (SANDBOX_*, JACK_CYLINDER_*) live in
// scene/layout.ts now — the shared pure-numeric truth also read by
// render/camera/cameraPoses.ts for framing (R3/R2, director defect list).
const JACK_PISTON_RADIUS = 0.62;
/** Minimum visible piston stub even at jackExtension=0, so the piston reads as "seated" rather than invisible. */
const JACK_PISTON_MIN_VISIBLE = 0.3;

export interface LegGroundRig {
  /** Add this Group directly to the scene — everything below is a descendant, already correctly placed/rotated. */
  group: THREE.Group;
  /** Rotates (tilts open) proportionally to gateOpen. HandleId 'sandGate' screen-projects from this. */
  gatePivot: THREE.Object3D;
  /** Rotates (swings) as pump strokes animate. HandleId 'pumpHandle' screen-projects from this. */
  pumpPivot: THREE.Object3D;
  /** Its local scale.y (and the group's local Y position stay fixed) grows with jackExtension — see legGroundRig.ts's caller. */
  piston: THREE.Mesh;
  /** Object the sand visual system (visual/sand) parents its heightfield/pile/stream meshes to — local origin at the sandbox's interior floor center. */
  sandAnchor: THREE.Object3D;
  /** Sandbox interior footprint, for the sand visual system to size its heightfield to. */
  sandboxInterior: { width: number; depth: number };
}

function buildSandbox(materials: HeroMaterials): { group: THREE.Group; gatePivot: THREE.Object3D; sandAnchor: THREE.Object3D } {
  const group = new THREE.Group();
  const hw = SANDBOX_WIDTH / 2;
  const hd = SANDBOX_DEPTH / 2;
  const t = SANDBOX_WALL_THICKNESS;

  const floor = new THREE.Mesh(new THREE.BoxGeometry(SANDBOX_WIDTH, t, SANDBOX_DEPTH), materials.wood);
  floor.position.set(0, t / 2, 0);
  floor.receiveShadow = true;
  group.add(floor);

  // Inner wall (faces outward, opposite the cutaway) and the two side walls. No wall on the +Z (cutaway) face.
  const innerWall = new THREE.Mesh(new THREE.BoxGeometry(SANDBOX_WIDTH, SANDBOX_HEIGHT, t), materials.wood);
  innerWall.position.set(0, SANDBOX_HEIGHT / 2, -hd + t / 2);
  group.add(innerWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(t, SANDBOX_HEIGHT, SANDBOX_DEPTH), materials.wood);
  leftWall.position.set(-hw + t / 2, SANDBOX_HEIGHT / 2, 0);
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(t, SANDBOX_HEIGHT, SANDBOX_DEPTH), materials.wood);
  rightWall.position.set(hw - t / 2, SANDBOX_HEIGHT / 2, 0);
  group.add(rightWall);

  // Iron reinforcement bands wrapped around the 3 SOLID sides only, at two
  // heights — genuinely 3-sided (matching innerWall/leftWall/rightWall's own
  // footprints) rather than a single box spanning the full width×depth
  // footprint: a full-footprint band would silently span straight across
  // the open +Z cutaway face too, opaquely blocking the camera's view into
  // the box the instant sandboxCutaway (R2) actually gets close enough to
  // look through it — confirmed via a raycast diagnostic during this fix:
  // the band at 78% height was the exact occluder hiding the sand surface.
  // All 6 segments (3 sides × 2 heights) merge into ONE draw call.
  const bandGeoms: THREE.BufferGeometry[] = [];
  for (const bandY of [SANDBOX_HEIGHT * 0.3, SANDBOX_HEIGHT * 0.78]) {
    bandGeoms.push(
      new THREE.BoxGeometry(SANDBOX_WIDTH + 0.1, 0.26, t + 0.1).translate(0, bandY, -hd + t / 2),
      new THREE.BoxGeometry(t + 0.1, 0.26, SANDBOX_DEPTH + 0.1).translate(-hw + t / 2, bandY, 0),
      new THREE.BoxGeometry(t + 0.1, 0.26, SANDBOX_DEPTH + 0.1).translate(hw - t / 2, bandY, 0),
    );
  }
  const bands = new THREE.Mesh(mergeGeometries(bandGeoms, false), materials.ironBand);
  group.add(bands);

  // Gate: a pivot bolted to the left wall exterior, with a big wood+iron
  // handle bar that swings open (rotates) with gateOpen — VISUAL_ACCEPTANCE
  // "gateハンドルが大きく、木+鉄で「引ける」形をしている": an iron pull-bar
  // (bar + end knob, merged into one draw call — PERFORMANCE_BUDGET draw
  // call discipline) over a wood grip, sized for a two-hand pull.
  const gatePivot = new THREE.Object3D();
  gatePivot.position.set(-hw - 0.03, SANDBOX_HEIGHT * 0.35, hd * 0.35);
  const gateBarGeom = new THREE.BoxGeometry(1.7, 0.26, 0.26).translate(-0.85, 0, 0);
  const gateKnobGeom = new THREE.SphereGeometry(0.3, 10, 8).translate(-2.2, 0, 0);
  const gateIron = new THREE.Mesh(mergeGeometries([gateBarGeom, gateKnobGeom], false), materials.ironBand);
  gatePivot.add(gateIron);
  const gateGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.9, 10), materials.wood);
  gateGrip.rotation.z = Math.PI / 2;
  gateGrip.position.set(-1.7, 0, 0);
  gatePivot.add(gateGrip);
  group.add(gatePivot);

  // A small dark opening at the base of the inner-most gap where sand pours through, for visual continuity with the stream mesh.
  const gateHole = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), new THREE.MeshBasicMaterial({ color: 0x120d09 }));
  gateHole.position.set(-hw + t + 0.01, 0.2, hd * 0.35);
  gateHole.rotation.y = Math.PI / 2;
  group.add(gateHole);

  const sandAnchor = new THREE.Object3D();
  sandAnchor.position.set(0, t, 0); // interior floor center
  group.add(sandAnchor);

  return { group, gatePivot, sandAnchor };
}

function buildJack(materials: HeroMaterials): { group: THREE.Group; pumpPivot: THREE.Object3D; piston: THREE.Mesh } {
  const group = new THREE.Group();

  const cylinder = new THREE.Mesh(
    new THREE.CylinderGeometry(JACK_CYLINDER_RADIUS, JACK_CYLINDER_RADIUS * 1.08, JACK_CYLINDER_HEIGHT, 14),
    materials.jackCylinder,
  );
  cylinder.position.set(0, JACK_CYLINDER_HEIGHT / 2, 0);
  cylinder.castShadow = true;
  group.add(cylinder);

  // Piston: unit-height cylinder translated so its local origin is at its own base, mounted at the jack's top; scale.y is driven per-frame by jackExtension.
  const pistonGeom = new THREE.CylinderGeometry(JACK_PISTON_RADIUS, JACK_PISTON_RADIUS, 1, 12);
  pistonGeom.translate(0, 0.5, 0);
  const piston = new THREE.Mesh(pistonGeom, materials.jackPiston);
  piston.position.set(0, JACK_CYLINDER_HEIGHT, 0);
  piston.scale.set(1, JACK_PISTON_MIN_VISIBLE, 1);
  piston.castShadow = true;
  group.add(piston);

  // Two-hand pump lever: a pivot near the cylinder base with a long handle
  // bar extending outward — VISUAL_ACCEPTANCE "handleは両手で握る大レバーの
  // 形状", scaled to match the now much bigger cylinder.
  const pumpPivot = new THREE.Object3D();
  pumpPivot.position.set(JACK_CYLINDER_RADIUS + 0.15, JACK_CYLINDER_HEIGHT * 0.55, 0);
  const leverArm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 0.3), materials.ironBand);
  leverArm.position.set(1.4, 0, 0);
  pumpPivot.add(leverArm);
  const leverGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 1.1, 10), materials.wood);
  leverGrip.rotation.z = Math.PI / 2;
  leverGrip.position.set(2.8, 0, 0);
  pumpPivot.add(leverGrip);
  group.add(pumpPivot);

  return { group, pumpPivot, piston };
}

/**
 * A stout iron strut/beam GEOMETRY (already transformed into place — no
 * further positioning needed) spanning two points — used to visually bridge
 * the ground props to the leg's base (R3/HISTORICAL_NOTES: "砂箱を「足場上部
 * ・脚の支持点」に置くこと" — the sandbox sits at the leg's support point,
 * visibly supporting it) without needing per-frame kinematics: the leg's own
 * vertical travel (scene/mapping.ts LEG_OFFSET_WORLD_SCALE) is a small
 * fraction of the tower height, so a static strut authored against the
 * leg's rest pose reads as a solid support at every reachable legOffsetY.
 * Returns a bare geometry (rather than a Mesh) so callers can merge several
 * same-material struts into one draw call (PERFORMANCE_BUDGET ≤120).
 */
function beamGeometry(a: THREE.Vector3, b: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(thickness, thickness * 1.15, 1, 8);
  const delta = b.clone().sub(a);
  const length = delta.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  // Order matters: base-at-origin, THEN stretch to length (still +Y-aligned),
  // THEN rotate to point at `b`, THEN translate the base to `a`.
  geometry.translate(0, 0.5, 0);
  geometry.scale(1, length, 1);
  geometry.applyQuaternion(quat);
  geometry.translate(a.x, a.y, a.z);
  return geometry;
}

/** Builds leg `leg`'s ground rig (sandbox + jack), positioned/rotated as one Group. */
export function buildLegGroundRig(leg: LegId, materials: HeroMaterials): LegGroundRig {
  const group = new THREE.Group();
  const base = legBaseXZ(leg);
  group.position.set(base.x, GROUND_Y, base.z);
  group.rotation.y = legOutwardYawRadians(leg);

  const sandbox = buildSandbox(materials);
  sandbox.group.position.set(-GROUND_PROP_LATERAL_OFFSET, 0, 1.0);
  group.add(sandbox.group);

  const jack = buildJack(materials);
  jack.group.position.set(GROUND_PROP_LATERAL_OFFSET, 0, 1.0);
  group.add(jack.group);

  // Support column + lower brace + jack foundation plate: bridges the
  // ground props up to the leg's own base surface, so the leg visibly rests
  // on/against the sand support rather than floating near unrelated boxes
  // off to the side. `LEG_CHORD_HALF_WIDTH_BASE * 0.72` deliberately stops a
  // little short of the leg's full modeled half-width — the leg's lattice
  // taper isn't a simple box, so aiming slightly inside its outer envelope
  // keeps the strut reading as "braced against the leg" at every camera
  // angle instead of visibly overshooting past it. All three share the
  // `ironBand` material and are merged into ONE draw call
  // (PERFORMANCE_BUDGET ≤120 — see render-geometry-budget.test.ts).
  const sandboxTopInnerX = -GROUND_PROP_LATERAL_OFFSET + SANDBOX_WIDTH / 2;
  const legSideX = -LEG_CHORD_HALF_WIDTH_BASE * 0.72;
  const upperStrut = beamGeometry(
    new THREE.Vector3(sandboxTopInnerX, SANDBOX_HEIGHT * 0.92, 1.0),
    new THREE.Vector3(legSideX, SANDBOX_HEIGHT * 0.62, 0.35),
    0.34,
  );
  const lowerBrace = beamGeometry(
    new THREE.Vector3(sandboxTopInnerX * 0.85, SANDBOX_HEIGHT * 0.18, 1.4),
    new THREE.Vector3(legSideX * 0.9, 0.05, 0.6),
    0.26,
  );
  const jackPlateGeom = new THREE.BoxGeometry(GROUND_PROP_LATERAL_OFFSET - LEG_CHORD_HALF_WIDTH_BASE * 0.5, 0.18, JACK_CYLINDER_RADIUS * 2.6).translate(
    GROUND_PROP_LATERAL_OFFSET * 0.5 + LEG_CHORD_HALF_WIDTH_BASE * 0.25,
    0.09,
    1.0,
  );
  const supportMesh = new THREE.Mesh(mergeGeometries([upperStrut, lowerBrace, jackPlateGeom], false), materials.ironBand);
  supportMesh.castShadow = true;
  supportMesh.receiveShadow = true;
  group.add(supportMesh);

  return {
    group,
    gatePivot: sandbox.gatePivot,
    pumpPivot: jack.pumpPivot,
    piston: jack.piston,
    sandAnchor: sandbox.sandAnchor,
    sandboxInterior: { width: SANDBOX_WIDTH - SANDBOX_WALL_THICKNESS * 2, depth: SANDBOX_DEPTH - SANDBOX_WALL_THICKNESS * 2 },
  };
}

/** Piston visible-length scale for a given jackExtension (game units) — mirrors scene/mapping.ts's world scale so 1 jack "unit" reads consistently with 1 legOffsetY "unit". */
export function pistonScaleForExtension(jackExtension: number, worldScale: number): number {
  return JACK_PISTON_MIN_VISIBLE + Math.max(0, jackExtension) * worldScale;
}

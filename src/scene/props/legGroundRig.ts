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
import type { LegId } from '../../contracts/types';
import { GROUND_PROP_LATERAL_OFFSET, GROUND_Y, legBaseXZ, legOutwardYawRadians } from '../layout';
import type { HeroMaterials } from '../../render/materials';

// Sandbox interior dimensions (LOCAL frame: x = tangential width, z = radial depth, cutaway on +Z).
export const SANDBOX_WIDTH = 3.0;
export const SANDBOX_DEPTH = 2.6;
export const SANDBOX_HEIGHT = 2.1;
export const SANDBOX_WALL_THICKNESS = 0.12;

const JACK_CYLINDER_RADIUS = 0.55;
const JACK_CYLINDER_HEIGHT = 2.6;
const JACK_PISTON_RADIUS = 0.32;
/** Minimum visible piston stub even at jackExtension=0, so the piston reads as "seated" rather than invisible. */
const JACK_PISTON_MIN_VISIBLE = 0.15;

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

  // Iron reinforcement bands wrapped around the 3 solid sides, at two heights.
  for (const bandY of [SANDBOX_HEIGHT * 0.3, SANDBOX_HEIGHT * 0.78]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(SANDBOX_WIDTH + 0.06, 0.14, SANDBOX_DEPTH + 0.06), materials.ironBand);
    band.position.set(0, bandY, 0);
    group.add(band);
  }

  // Gate: a pivot bolted to the left wall exterior, with a handle bar that swings open (rotates) with gateOpen.
  const gatePivot = new THREE.Object3D();
  gatePivot.position.set(-hw - 0.02, SANDBOX_HEIGHT * 0.35, hd * 0.35);
  const gateBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.14), materials.ironBand);
  gateBar.position.set(-0.45, 0, 0);
  gatePivot.add(gateBar);
  const gateKnob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), materials.ironBand);
  gateKnob.position.set(-0.9, 0, 0);
  gatePivot.add(gateKnob);
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

  // Two-hand pump lever: a pivot near the cylinder base with a long handle bar extending outward.
  const pumpPivot = new THREE.Object3D();
  pumpPivot.position.set(JACK_CYLINDER_RADIUS + 0.1, JACK_CYLINDER_HEIGHT * 0.55, 0);
  const leverArm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.16), materials.ironBand);
  leverArm.position.set(0.75, 0, 0);
  pumpPivot.add(leverArm);
  const leverGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 8), materials.wood);
  leverGrip.rotation.z = Math.PI / 2;
  leverGrip.position.set(1.5, 0, 0);
  pumpPivot.add(leverGrip);
  group.add(pumpPivot);

  return { group, pumpPivot, piston };
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

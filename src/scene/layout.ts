/**
 * Static tower layout — pure numeric geometry, no Three.js dependency, so
 * every position function here is trivially unit-testable. This is the
 * single source of truth for "where things are" in world space; geometry
 * builders (tower/, props/) and the camera director (render/camera/) both
 * read from it instead of duplicating magic numbers.
 *
 * World units: 1 world unit is an art-direction scale, unrelated to the
 * legModel's `units` (1 unit = 1mm-equivalent game-logic value). The two
 * are bridged exclusively by `mapping.ts#legOffsetToWorldY`.
 *
 * Coordinate frame: Y up, ground at Y=0, tower centered at the world
 * origin in X/Z. LegId 0..3 (NE/SE/SW/NW per types.ts) are placed at 90°
 * intervals starting at 45°, i.e. a symmetric square footprint with no
 * face aligned to an axis — this keeps every leg equally legible from a
 * generic establish camera angle.
 */
import type { LegId } from '../contracts/types';

/** World Y of the ground plane. */
export const GROUND_Y = 0;

/**
 * World Y of the first-level girder ring — the fixed target height every
 * leg's alignment pin converges toward. This is the anchor `mapping.ts`
 * offsets away from.
 */
export const GIRDER_RING_Y = 32;

/**
 * Leg batter angle, measured from the HORIZONTAL (ground plane), per
 * HISTORICAL_NOTES.md "四本の脚は約54°で内傾". A steeper (closer to 90°)
 * angle here means a more vertical, tower-like silhouette; interpreting it
 * from horizontal (rather than from vertical) keeps the four legs' splay
 * proportionate to their height instead of degenerating into a flat
 * pyramid, while still reading as dramatically splayed at the base.
 */
export const LEG_BATTER_DEG = 54;

/** Horizontal radial distance (world units) from a leg's top to its base, implied by the batter angle and tower height. */
export const LEG_RADIAL_RUN = (GIRDER_RING_Y - GROUND_Y) / Math.tan((LEG_BATTER_DEG * Math.PI) / 180);

/** Distance from the tower's central vertical axis to each leg's centerline at girder-ring height. */
export const LEG_TOP_RADIUS = 6;

/** Distance from the tower's central vertical axis to each leg's centerline at ground level. */
export const LEG_BASE_RADIUS = LEG_TOP_RADIUS + LEG_RADIAL_RUN;

/** Half-width (world units) of one leg's own box-truss cross-section at its base (widest point). */
export const LEG_CHORD_HALF_WIDTH_BASE = 3.2;

/** Half-width (world units) of one leg's own box-truss cross-section at its top, just under the pin. */
export const LEG_CHORD_HALF_WIDTH_TOP = 0.95;

/** Number of horizontal lattice "levels" (rungs) per leg, i.e. cross-brace panel count + 1. */
export const LEG_LATTICE_LEVELS = 7;

export interface Vec2 {
  x: number;
  z: number;
}

/** Angular position (radians, standard math convention) of `leg` around the tower's central axis. */
export function legAngleRad(leg: LegId): number {
  return ((45 + leg * 90) * Math.PI) / 180;
}

/** World XZ of leg `leg`'s centerline at ground level. */
export function legBaseXZ(leg: LegId): Vec2 {
  const a = legAngleRad(leg);
  return { x: Math.cos(a) * LEG_BASE_RADIUS, z: Math.sin(a) * LEG_BASE_RADIUS };
}

/** World XZ of leg `leg`'s centerline at girder-ring height (where its pin nominally sits). */
export function legTopXZ(leg: LegId): Vec2 {
  const a = legAngleRad(leg);
  return { x: Math.cos(a) * LEG_TOP_RADIUS, z: Math.sin(a) * LEG_TOP_RADIUS };
}

/** Unit vector pointing radially outward (away from the tower's central axis) at leg `leg`'s angular position. */
export function legRadialUnit(leg: LegId): Vec2 {
  const a = legAngleRad(leg);
  return { x: Math.cos(a), z: Math.sin(a) };
}

/** Unit vector tangential (perpendicular, in the XZ plane) to leg `leg`'s radial direction. */
export function legTangentUnit(leg: LegId): Vec2 {
  const a = legAngleRad(leg);
  return { x: -Math.sin(a), z: Math.cos(a) };
}

/**
 * Tangential distance (world units) from a leg's own centerline out to its
 * sandbox/jack ground props. Shared by `sandboxAnchorXZ`/`jackAnchorXZ`
 * (world-space, used for camera framing) AND `scene/props/legGroundRig.ts`
 * (which re-derives the same offset in the rig's LOCAL frame) so the two
 * never drift apart.
 */
export const GROUND_PROP_LATERAL_OFFSET = LEG_CHORD_HALF_WIDTH_BASE + 3.5;

/** Ground-level anchor point for a leg's sandbox: outboard of the leg's own footprint, on its tangential side. */
export function sandboxAnchorXZ(leg: LegId): Vec2 {
  const base = legBaseXZ(leg);
  const t = legTangentUnit(leg);
  return { x: base.x + t.x * GROUND_PROP_LATERAL_OFFSET, z: base.z + t.z * GROUND_PROP_LATERAL_OFFSET };
}

/** Ground-level anchor point for a leg's hydraulic jack: outboard of the leg's own footprint, opposite tangential side from the sandbox. */
export function jackAnchorXZ(leg: LegId): Vec2 {
  const base = legBaseXZ(leg);
  const t = legTangentUnit(leg);
  return { x: base.x - t.x * GROUND_PROP_LATERAL_OFFSET, z: base.z - t.z * GROUND_PROP_LATERAL_OFFSET };
}

/**
 * Yaw rotation (radians, Three.js Object3D.rotation.y convention) that
 * rotates a prop authored in a LOCAL frame — local +Z = "faces outward
 * from the tower's central axis", local +X = tangential — so it faces
 * leg `leg`'s actual outward direction in world space. Used by ground
 * props (sandbox cutaway, jack, wedge) so they can be authored once in a
 * simple local frame and placed consistently at any of the 4 legs.
 */
export function legOutwardYawRadians(leg: LegId): number {
  return Math.PI / 2 - legAngleRad(leg);
}

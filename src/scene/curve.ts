// src/scene/curve.ts
// Pure math describing the Eiffel-tower leg profile: an inward-curving radius
// from a wide base to a narrow apex. This single function drives leg
// geometry, lattice bracing placement, and the crane-carriage rail path, so
// everything visually agrees on "where the leg is" at any height fraction.
// No THREE/DOM dependency — kept pure and unit-testable.

/** Height of one fully-built tower level, in world units. */
export const LEVEL_HEIGHT = 4.6;

/** Ground footprint half-width (leg azimuth radius at t=0). */
export const BASE_RADIUS = 11.5;

/** Leg azimuth radius at the apex (t=1 of the tallest possible tower). */
export const APEX_RADIUS = 0.55;

/**
 * Inward-curving radius profile, t in [0,1] (0 = ground, 1 = apex of the
 * *tallest possible* structure i.e. MAX_TOWER_LEVEL sections). The curve is
 * concave with most of its sweep concentrated in the lower third (R1: a
 * 4-year-old's parent has to read "Eiffel Tower" within 3 seconds from just
 * the towerLevel-0 base — a gentle taper that only becomes visible near the
 * unreachable apex reads as four straight parallel posts at every height a
 * player actually sees). Exponent 2.35 (up from a near-linear 1.55) puts a
 * strong inward "kick" right at the base and flattens out higher up, the
 * same silhouette logic as the real structure's splayed feet + arches.
 */
export function legRadiusAt(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const shape = Math.pow(1 - clamped, 2.35);
  return APEX_RADIUS + (BASE_RADIUS - APEX_RADIUS) * shape;
}

/**
 * World-space (x,z) offset of a leg at azimuth `angle` (rad) and height
 * fraction t, written into `out` — no allocation (R9: this is called from
 * true per-frame hot paths — crane.ts's carriage placement, tower.ts's
 * topOfLeg — so it must not allocate a fresh object every call).
 */
export function legOffsetInto<T extends { x: number; z: number }>(out: T, angle: number, t: number): T {
  const r = legRadiusAt(t);
  out.x = Math.cos(angle) * r;
  out.z = Math.sin(angle) * r;
  return out;
}

/** Allocating convenience wrapper over legOffsetInto — fine for tests/one-off
 * callers (geometry rebuilds, which only run on towerLevel change, not every
 * frame); per-frame callers use legOffsetInto instead. */
export function legOffsetAt(angle: number, t: number): { x: number; z: number } {
  return legOffsetInto({ x: 0, z: 0 }, angle, t);
}

/**
 * Local-space tangent (dx/dt, dz/dt is implicit via radius derivative) used to
 * orient rail-riding objects (the crane carriage) so they sit flush against
 * the leg surface as it curves inward with height. Written into `out` — no
 * allocation (R9; same hot-path rationale as legOffsetInto above).
 */
const tangentA = { x: 0, z: 0 };
const tangentB = { x: 0, z: 0 };
export function legTangentInto<T extends { x: number; y: number; z: number }>(
  out: T,
  angle: number,
  t: number,
  dt = 0.001,
): T {
  const t0 = Math.max(t - dt, 0);
  const t1 = Math.min(t + dt, 1);
  legOffsetInto(tangentA, angle, t0);
  legOffsetInto(tangentB, angle, t1);
  const dx = tangentB.x - tangentA.x;
  const dz = tangentB.z - tangentA.z;
  const dy = t1 - t0;
  const len = Math.hypot(dx, dy, dz) || 1;
  out.x = dx / len;
  out.y = dy / len;
  out.z = dz / len;
  return out;
}

/** Allocating convenience wrapper over legTangentInto — see legOffsetAt's comment. */
export function legTangentAt(angle: number, t: number, dt = 0.001): { x: number; y: number; z: number } {
  return legTangentInto({ x: 0, y: 0, z: 0 }, angle, t, dt);
}

/** The four leg azimuths (radians), corners of a square footprint. */
export const LEG_ANGLES: readonly number[] = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
];

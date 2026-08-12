// src/scene/curve.ts
// Pure math describing the Eiffel-tower leg profile: an inward-curving radius
// from a wide base to a narrow apex. This single function drives leg
// geometry, lattice bracing placement, and the crane-carriage rail path, so
// everything visually agrees on "where the leg is" at any height fraction.
// No THREE/DOM dependency — kept pure and unit-testable.

/** Height of one fully-built tower level, in world units. */
export const LEVEL_HEIGHT = 4.6;

/** Ground footprint half-width (leg azimuth radius at t=0). */
export const BASE_RADIUS = 9.2;

/** Leg azimuth radius at the apex (t=1 of the tallest possible tower). */
export const APEX_RADIUS = 0.6;

/**
 * Inward-curving radius profile, t in [0,1] (0 = ground, 1 = apex of the
 * *tallest possible* structure i.e. MAX_TOWER_LEVEL sections). The curve is
 * concave (exponent < 1) which reads as the signature Eiffel silhouette.
 */
export function legRadiusAt(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const shape = Math.pow(1 - clamped, 1.55);
  return APEX_RADIUS + (BASE_RADIUS - APEX_RADIUS) * shape;
}

/** World-space (x,z) offset of a leg at azimuth `angle` (rad) and height fraction t. */
export function legOffsetAt(angle: number, t: number): { x: number; z: number } {
  const r = legRadiusAt(t);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

/**
 * Local-space tangent (dx/dt, dz/dt is implicit via radius derivative) used to
 * orient rail-riding objects (the crane carriage) so they sit flush against
 * the leg surface as it curves inward with height.
 */
export function legTangentAt(angle: number, t: number, dt = 0.001): { x: number; y: number; z: number } {
  const t0 = Math.max(t - dt, 0);
  const t1 = Math.min(t + dt, 1);
  const a = legOffsetAt(angle, t0);
  const b = legOffsetAt(angle, t1);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dy = t1 - t0;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/** The four leg azimuths (radians), corners of a square footprint. */
export const LEG_ANGLES: readonly number[] = [
  Math.PI / 4,
  (3 * Math.PI) / 4,
  (5 * Math.PI) / 4,
  (7 * Math.PI) / 4,
];

/**
 * Analytic track curve for the east-leg elevator run: LINE – CIRCULAR ARC –
 * LINE in the world X–Y plane, arc-length parameterized by construction.
 *
 * Written by the architect in Wave 1.5 and treated as FROZEN API (see
 * docs/MATH_CONTRACT.md §1). Both the gameplay simulation and the renderer
 * consume this module; it is the ONLY `src/game` file `src/render|scene|visual`
 * may import (pure math, no side effects, no three.js).
 *
 * Geometry: P(0) = origin (ground station portal), climbing toward +x/+y.
 * The lateral axis is +Z (always 0 on the curve itself). The inclination
 * from horizontal is THETA_LOWER (54°) for s ≤ BLEND_START_S, increases
 * linearly in arc length across the blend (⇔ a circular arc), and holds
 * THETA_UPPER (74°) until the second-floor station at s = TRACK_LENGTH.
 */

import {
  BLEND_END_S,
  BLEND_START_S,
  THETA_LOWER_RAD,
  THETA_UPPER_RAD,
  TRACK_LENGTH,
} from '../contracts/constants';

export type Vec3Tuple = readonly [number, number, number];

/** Radius of the blend arc: Δs / Δθ (linear-in-s angle ⇔ circular arc). */
export const BLEND_RADIUS =
  (BLEND_END_S - BLEND_START_S) / (THETA_UPPER_RAD - THETA_LOWER_RAD);

const sinL = Math.sin(THETA_LOWER_RAD);
const cosL = Math.cos(THETA_LOWER_RAD);
const sinU = Math.sin(THETA_UPPER_RAD);
const cosU = Math.cos(THETA_UPPER_RAD);

/** Blend start point (end of the lower straight run). */
const X1 = BLEND_START_S * cosL;
const Y1 = BLEND_START_S * sinL;

/** Blend end point (start of the upper straight run), by arc closed form. */
const X2 = X1 + BLEND_RADIUS * (sinU - sinL);
const Y2 = Y1 - BLEND_RADIUS * (cosU - cosL);

/** Clamp an arc length onto the physical track. */
export function clampArcLength(s: number): number {
  return Math.min(Math.max(s, 0), TRACK_LENGTH);
}

/** Inclination from horizontal (radians) at arc length s. Monotonic in s. */
export function trackTheta(s: number): number {
  const c = clampArcLength(s);
  if (c <= BLEND_START_S) return THETA_LOWER_RAD;
  if (c >= BLEND_END_S) return THETA_UPPER_RAD;
  const u = (c - BLEND_START_S) / (BLEND_END_S - BLEND_START_S);
  return THETA_LOWER_RAD + u * (THETA_UPPER_RAD - THETA_LOWER_RAD);
}

/** World-space point on the track centerline at arc length s. */
export function trackPoint(s: number): Vec3Tuple {
  const c = clampArcLength(s);
  if (c <= BLEND_START_S) {
    return [c * cosL, c * sinL, 0];
  }
  if (c <= BLEND_END_S) {
    const th = trackTheta(c);
    return [
      X1 + BLEND_RADIUS * (Math.sin(th) - sinL),
      Y1 - BLEND_RADIUS * (Math.cos(th) - cosL),
      0,
    ];
  }
  const d = c - BLEND_END_S;
  return [X2 + d * cosU, Y2 + d * sinU, 0];
}

/** Unit tangent (in the X–Y travel plane) at arc length s. */
export function trackTangent(s: number): Vec3Tuple {
  const th = trackTheta(s);
  return [Math.cos(th), Math.sin(th), 0];
}

/** Normalized track parameter t = s / TRACK_LENGTH ∈ [0, 1]. */
export function tFromArcLength(s: number): number {
  return clampArcLength(s) / TRACK_LENGTH;
}

/** Arc length from normalized parameter t ∈ [0, 1]. */
export function arcLengthFromT(t: number): number {
  return clampArcLength(t * TRACK_LENGTH);
}

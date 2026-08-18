import * as THREE from 'three';

/**
 * Pure geometry of the piece — braid spine, weave, waterfall, petals, coil.
 * No three.js scene objects here; unit-tested in tests/braidMath.test.ts.
 *
 * World anchors (see docs/CAMERA_AND_TIMING.md):
 *   head center (0, 1.45, 0), camera looks from +Z at the back of the head.
 *   The braid crosses the back of the head left(-x) → right(+x).
 */

export const HEAD_CENTER = new THREE.Vector3(0, 1.45, 0);
export const HEAD_RADIUS = 0.26;

/** Number of weave cycles in the finished waterfall braid (= cross gestures). */
export const BRAID_CYCLES = 4;
/** Drop/pick loops between crossings. */
export const DROP_COUNT = 3;

const SPINE_R = HEAD_RADIUS + 0.055;
const PHI_START = -1.15; // azimuth (0 = straight back, +Z), radians
const PHI_END = 1.15;

/** Centerline of the braid arc across the back of the head, t: 0..1. */
export function braidSpine(t: number): THREE.Vector3 {
  const phi = PHI_START + (PHI_END - PHI_START) * t;
  // The arc sags a little toward the right, like a real waterfall braid.
  const y = HEAD_CENTER.y + 0.10 - 0.02 * t - 0.05 * Math.sin(t * Math.PI);
  const bulge = 1 + 0.06 * Math.sin(t * Math.PI);
  return new THREE.Vector3(
    Math.sin(phi) * SPINE_R * bulge,
    y,
    HEAD_CENTER.z + Math.cos(phi) * SPINE_R * bulge
  );
}

/** Outward (away from head) unit vector at spine t — the braid's "up". */
export function spineOutward(t: number): THREE.Vector3 {
  const p = braidSpine(t);
  return new THREE.Vector3(p.x - HEAD_CENTER.x, (p.y - HEAD_CENTER.y) * 0.35, p.z - HEAD_CENTER.z).normalize();
}

/**
 * Weave offset of strand k (0..2) at spine parameter t, in the local frame
 * (u = along-head vertical-ish, w = outward). A Lissajous 3-strand weave:
 * each strand crosses over/under with period 1/BRAID_CYCLES.
 */
export function weaveOffset(t: number, k: number): { u: number; w: number } {
  const theta = t * BRAID_CYCLES * Math.PI * 2;
  const phase = (k * Math.PI * 2) / 3;
  return {
    u: Math.sin(theta + phase) * 0.9,
    w: Math.sin(2 * (theta + phase)) * 0.55
  };
}

/** Where drop i (0-based) leaves the braid, as spine parameter t. */
export function dropT(i: number): number {
  return (i + 1) / (DROP_COUNT + 1);
}

/**
 * Control points of a fallen waterfall strand: leaves the spine at `t`,
 * then falls with a soft S — heavier at the top, airier at the tip.
 * `settle` 0..1 morphs from "still attached" to "fully fallen".
 */
export function waterfallControls(t: number, settle: number): THREE.Vector3[] {
  const start = braidSpine(t);
  const out = spineOutward(t);
  const dropLen = 0.80 + 0.07 * Math.sin(t * 12.9898); // deterministic variety
  const sway = 0.09 * Math.sin(t * 37.7);
  const pts: THREE.Vector3[] = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const fall = settle * s;
    const p = start.clone();
    // Drift outward (toward the camera) so the falls layer in front of the base hair.
    p.addScaledVector(out, s * (0.05 + 0.09 * settle));
    p.y -= dropLen * fall * s * (2 - s) * 0.9;
    p.x += sway * s * s * settle + out.x * 0.02;
    p.z += 0.05 * Math.sin(s * Math.PI) * settle;
    // Before settling, the strand still arcs upward as if held.
    p.y += (1 - settle) * 0.10 * Math.sin(s * Math.PI);
    pts.push(p);
  }
  return pts;
}

/** Hanging control points of the braid tail on the right side of the head. */
export function hangControls(): THREE.Vector3[] {
  return [
    braidSpine(1),
    new THREE.Vector3(0.40, 1.36, 0.13),
    new THREE.Vector3(0.46, 1.18, 0.16),
    new THREE.Vector3(0.48, 0.98, 0.14),
    new THREE.Vector3(0.46, 0.80, 0.10),
    new THREE.Vector3(0.43, 0.66, 0.07)
  ];
}

export const PETAL_COUNT = 5;

/** Centers (in tail arc-fraction s) of the petal loops. */
export function petalCenter(i: number): number {
  return 0.22 + (i * 0.66) / (PETAL_COUNT - 1);
}

/**
 * Tail thickness profile. pulls[i] in 0..1 — how far the player has drawn
 * each loop outward. The trace of the hand is kept: no normalization.
 */
export function petalRadius(s: number, pulls: number[], base: number, amp: number): number {
  let r = base * (1 - 0.35 * s); // natural taper toward the tip
  for (let i = 0; i < pulls.length; i++) {
    const c = petalCenter(i);
    const d = (s - c) / 0.055;
    // A slightly squared gaussian → fuller petal body, cleaner valley.
    const bump = Math.exp(-d * d) * (1 + 0.4 * Math.exp(-d * d));
    r += amp * pulls[i] * bump * 0.72;
  }
  return r;
}

/** Flower placement — a side rosette above the right ear. */
export const FLOWER_CENTER = new THREE.Vector3(0.36, 1.42, 0.16);
// Tilted toward the camera so the spiral FACE (not the tube wall) is what
// reads in the coil, gem and reveal shots.
export const FLOWER_NORMAL = new THREE.Vector3(0.5, 0.3, 0.9).normalize();
export const FLOWER_RADIUS = 0.155;
export const COIL_TURNS = 2.1;

/** Orthonormal basis (u,v) of the flower plane. */
export function flowerBasis(): { u: THREE.Vector3; v: THREE.Vector3 } {
  const up = new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(up, FLOWER_NORMAL).normalize();
  const v = new THREE.Vector3().crossVectors(FLOWER_NORMAL, u).normalize();
  return { u, v };
}

/**
 * Coil mapping: blends the hanging tail onto an inward spiral as coil
 * progress c goes 0→1. s is arc-fraction along the tail (0 = root at the
 * braid, 1 = tip which ends at the flower's heart).
 */
export function coilPoint(s: number, c: number, hangPt: THREE.Vector3, basis: { u: THREE.Vector3; v: THREE.Vector3 }): THREE.Vector3 {
  if (c <= 0) return hangPt.clone();
  // Portion of the tail (from the tip backwards) that is wound so far.
  const woundStart = 1 - c;
  if (s <= woundStart - 0.18) return hangPt.clone();

  // v01: 0 at the first wound point, 1 at the tip (innermost).
  const v01 = THREE.MathUtils.clamp((s - woundStart) / Math.max(c, 1e-4), 0, 1);
  const theta = (1 - v01) * COIL_TURNS * Math.PI * 2 * c - Math.PI * 0.4;
  // Tip winds to the very heart (no ear-canal hole) — the gem sits ON it.
  const radius = FLOWER_RADIUS * (0.05 + 0.95 * (1 - v01) * c + 0.12 * (1 - c));
  const lift = 0.024 * (1 - v01) * c; // tiny helix pitch so loops never z-fight
  const spiral = FLOWER_CENTER.clone()
    .addScaledVector(basis.u, Math.cos(theta) * radius)
    .addScaledVector(basis.v, Math.sin(theta) * radius)
    .addScaledVector(FLOWER_NORMAL, lift);

  // Smooth entry: blend hang → spiral across a window before woundStart,
  // and keep the very root anchored to the braid so the flower never detaches.
  const blend =
    THREE.MathUtils.smoothstep(s, woundStart - 0.18, woundStart + 0.04) *
    THREE.MathUtils.smoothstep(s, 0.02, 0.16);
  return hangPt.clone().lerp(spiral, blend);
}

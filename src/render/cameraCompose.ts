// src/render/cameraCompose.ts
// Pure per-aspect camera composition data + the eased-blend math that turns
// "current op/target world points" into a camera position/lookAt/fov. Kept
// free of THREE.Camera/DOM so the composition table and easing curve are
// unit-testable; render/camera.ts applies the result to a real camera.
//
// Each shot orbits a `center` point (an op/target blend) using standard
// spherical coordinates (distance, elevation, azimuth measured from world
// +Z, which points away from the Paris backdrop at -Z) — deliberately not
// relative to the op->target axis, which degenerates unpredictably whenever
// op and target nearly coincide (e.g. early-game establish shots where the
// tower is still short).

import type { CameraCueName } from '../contracts/types';

export type AspectClass = 'portrait' | 'landscape';

export interface CameraShot {
  distance: number;
  /** Radians above the horizontal plane. Small/near-zero for the low climb shot. */
  elevation: number;
  /** Radians around world +Y from +Z (0 = camera directly on the +Z/away-from-Paris side). */
  azimuth: number;
  /** 0..1 blend between op (0) and target (1) for both the orbit center and lookAt point. */
  blend: number;
  /** Extra lookAt height offset (world units), e.g. "look slightly up". */
  lookAtHeightOffset: number;
  fov: number;
}

const PORTRAIT: Record<CameraCueName, CameraShot> = {
  establish: { distance: 21, elevation: 0.34, azimuth: 0.55, blend: 0.5, lookAtHeightOffset: 1.5, fov: 62 },
  approach: { distance: 6.5, elevation: 0.22, azimuth: 0.5, blend: 0.5, lookAtHeightOffset: 0.3, fov: 54 },
  hoist: { distance: 8, elevation: 0.22, azimuth: 0.55, blend: 0.45, lookAtHeightOffset: 0.4, fov: 52 },
  align: { distance: 5.7, elevation: 0.16, azimuth: 0.45, blend: 0.5, lookAtHeightOffset: 0.1, fov: 50 },
  // Integrator (Wave 4) fix: the rivet relay's four interactive stations
  // (forge / tongs / rivetHole / hammerSpot) span ~2.3 world units, but this
  // single shot has to hold all of them in frame across rivetHeat/Carry/
  // Insert/Hammer/Cool (one continuous "macro" cue per camera.ts's
  // PHASE_CUE_MAP — not redesigned here). At the original distance:fov
  // (3.6:44) the portrait frustum was far too narrow: 'tongs'/'rivetHole'
  // projected off-screen during real play (verified via window.__game.
  // anchors()), making rivetCarry/rivetInsert undrivable by real touch.
  // Widened fov (kept distance < align's 5.2 so the "closest shot" unit
  // test still holds) until every station anchor stays on-screen with
  // margin across all 4 E2E viewport projects.
  rivetMacro: { distance: 5.6, elevation: 1.2, azimuth: 0.25, blend: 0.62, lookAtHeightOffset: 0.15, fov: 54 },
  climb: { distance: 7, elevation: 0.06, azimuth: 1.25, blend: 0.5, lookAtHeightOffset: 0.6, fov: 58 },
  reveal: { distance: 23, elevation: 0.3, azimuth: 0.5, blend: 0.5, lookAtHeightOffset: 2, fov: 60 },
  complete: { distance: 21, elevation: 0.32, azimuth: 0.55, blend: 0.5, lookAtHeightOffset: 2, fov: 58 },
};

const LANDSCAPE: Record<CameraCueName, CameraShot> = {
  establish: { distance: 24, elevation: 0.3, azimuth: 0.5, blend: 0.5, lookAtHeightOffset: 1.5, fov: 52 },
  approach: { distance: 7.5, elevation: 0.2, azimuth: 0.42, blend: 0.5, lookAtHeightOffset: 0.3, fov: 46 },
  hoist: { distance: 9, elevation: 0.2, azimuth: 0.5, blend: 0.45, lookAtHeightOffset: 0.4, fov: 46 },
  align: { distance: 6, elevation: 0.14, azimuth: 0.4, blend: 0.5, lookAtHeightOffset: 0.1, fov: 44 },
  // See the portrait rivetMacro comment above — same fix, landscape numbers.
  rivetMacro: { distance: 5.2, elevation: 1.1, azimuth: 0.25, blend: 0.62, lookAtHeightOffset: 0.15, fov: 50 },
  climb: { distance: 8.5, elevation: 0.05, azimuth: 1.15, blend: 0.5, lookAtHeightOffset: 0.6, fov: 52 },
  reveal: { distance: 26, elevation: 0.26, azimuth: 0.45, blend: 0.5, lookAtHeightOffset: 2, fov: 54 },
  complete: { distance: 24, elevation: 0.28, azimuth: 0.5, blend: 0.5, lookAtHeightOffset: 2, fov: 52 },
};

export const CAMERA_COMPOSITIONS: Record<AspectClass, Record<CameraCueName, CameraShot>> = {
  portrait: PORTRAIT,
  landscape: LANDSCAPE,
};

export function aspectClassFor(width: number, height: number): AspectClass {
  return width >= height ? 'landscape' : 'portrait';
}

export function shotFor(cue: CameraCueName, width: number, height: number): CameraShot {
  return CAMERA_COMPOSITIONS[aspectClassFor(width, height)][cue];
}

/** Smoothstep-eased blend factor, 0..1, from elapsed/duration. */
export function easeProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const t = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return t * t * (3 - 2 * t);
}

/** Base transition duration (ms) before ?test=1 (x0.25) / reducedMotion (near-cut) scaling. */
export const BASE_TRANSITION_MS = 1200;
export const TEST_TIME_SCALE = 0.25;
export const REDUCED_MOTION_TRANSITION_MS = 150;

export function transitionDurationMs(testMode: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return REDUCED_MOTION_TRANSITION_MS;
  return testMode ? BASE_TRANSITION_MS * TEST_TIME_SCALE : BASE_TRANSITION_MS;
}

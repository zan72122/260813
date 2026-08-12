/**
 * Pure viewport/orientation helpers shared by the renderer and camera
 * director. No THREE/DOM dependency so it stays unit-testable; callers
 * (`EiffelSceneWorld.resize`, `CameraDirector`) apply the numbers to real
 * objects.
 */

import { CAMERA_FOV_LANDSCAPE_DEG, CAMERA_FOV_PORTRAIT_DEG } from '../contracts/camera.ts';

export type Orientation = 'portrait' | 'landscape';

/** CAMERA_CONTRACT "Global rules": landscape when strictly wider than tall. */
export function orientationOf(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait';
}

/** Vertical FOV (degrees) for a viewport, per CAMERA_CONTRACT "Global rules". */
export function fovForViewport(width: number, height: number): number {
  return orientationOf(width, height) === 'landscape' ? CAMERA_FOV_LANDSCAPE_DEG : CAMERA_FOV_PORTRAIT_DEG;
}

/** Clamp a device pixel ratio request to a tier cap, never below 1. */
export function clampDpr(devicePixelRatio: number, cap: number): number {
  return Math.min(Math.max(devicePixelRatio, 1), cap);
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
  readonly orientation: Orientation;
  readonly fovDeg: number;
}

/** Compute the derived viewport bundle a resize handler needs in one call. */
export function computeViewport(width: number, height: number): ViewportSize {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  return {
    width: safeWidth,
    height: safeHeight,
    aspect: safeWidth / safeHeight,
    orientation: orientationOf(safeWidth, safeHeight),
    fovDeg: fovForViewport(safeWidth, safeHeight),
  };
}

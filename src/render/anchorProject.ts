// src/render/anchorProject.ts
// Pure 3D -> screen-space (CSS px) projection used to publish AnchorRegistry
// entries every frame. Takes a camera (any object exposing the standard
// THREE.Camera projection/view matrices) and a world point, returns CSS
// pixel coordinates plus a visibility flag (behind camera / outside frustum
// depth range). No canvas/DOM read beyond the supplied viewport size, so
// this is unit-testable with a plain THREE.PerspectiveCamera in node.

import { Vector3 } from 'three';
import type { Camera } from 'three';

export interface ScreenPoint {
  x: number;
  y: number;
  /** false when the point is behind the camera (must not be trusted/shown). */
  visible: boolean;
}

const scratch = new Vector3();

/**
 * Project a world-space point to CSS pixel coordinates for a viewport of
 * `width`x`height`, writing the result into `out` instead of allocating a
 * fresh object. This is the hot-path entry point (called once per published
 * anchor, every frame) — see `projectToScreen` below for an allocating
 * convenience wrapper used by tests/one-off callers.
 */
export function projectToScreenInto(
  out: ScreenPoint,
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ: number,
  width: number,
  height: number,
): ScreenPoint {
  scratch.set(worldX, worldY, worldZ);
  scratch.project(camera);
  out.visible = scratch.z < 1 && scratch.z > -1;
  out.x = (scratch.x * 0.5 + 0.5) * width;
  out.y = (1 - (scratch.y * 0.5 + 0.5)) * height;
  return out;
}

/**
 * Project a world-space point to CSS pixel coordinates for a viewport of
 * `width`x`height`. Allocates a fresh `ScreenPoint` each call — fine for
 * tests/occasional callers; the per-frame anchor-publish loop uses
 * `projectToScreenInto` instead to avoid steady-state GC pressure.
 */
export function projectToScreen(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ: number,
  width: number,
  height: number,
): ScreenPoint {
  return projectToScreenInto({ x: 0, y: 0, visible: false }, camera, worldX, worldY, worldZ, width, height);
}

const radiusCenterScratch: ScreenPoint = { x: 0, y: 0, visible: false };
const radiusEdgeScratch: ScreenPoint = { x: 0, y: 0, visible: false };

/** Convenience radius conversion: a world-space radius at a given depth, in CSS px, via a small offset probe. No per-call allocation (module-level scratch points). */
export function projectedRadius(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ: number,
  worldRadius: number,
  width: number,
  height: number,
): number {
  projectToScreenInto(radiusCenterScratch, camera, worldX, worldY, worldZ, width, height);
  projectToScreenInto(radiusEdgeScratch, camera, worldX + worldRadius, worldY, worldZ, width, height);
  return Math.hypot(radiusEdgeScratch.x - radiusCenterScratch.x, radiusEdgeScratch.y - radiusCenterScratch.y);
}

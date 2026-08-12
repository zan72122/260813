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
 * `width`x`height`. Reuses a module-level scratch vector to avoid per-frame
 * allocation in the render hot path (safe: synchronous, non-reentrant).
 */
export function projectToScreen(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ: number,
  width: number,
  height: number,
): ScreenPoint {
  scratch.set(worldX, worldY, worldZ);
  scratch.project(camera);
  const visible = scratch.z < 1 && scratch.z > -1;
  const x = (scratch.x * 0.5 + 0.5) * width;
  const y = (1 - (scratch.y * 0.5 + 0.5)) * height;
  return { x, y, visible };
}

/** Convenience radius conversion: a world-space radius at a given depth, in CSS px, via a small offset probe. */
export function projectedRadius(
  camera: Camera,
  worldX: number,
  worldY: number,
  worldZ: number,
  worldRadius: number,
  width: number,
  height: number,
): number {
  const center = projectToScreen(camera, worldX, worldY, worldZ, width, height);
  const edge = projectToScreen(camera, worldX + worldRadius, worldY, worldZ, width, height);
  return Math.hypot(edge.x - center.x, edge.y - center.y);
}

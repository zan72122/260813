/**
 * Projects a 3D world point through a Three.js camera into CSS-pixel screen
 * coordinates — the math backing HandleRegistry (contracts/handles.ts):
 * "rendererは毎フレーム、名前付きハンドルのスクリーン座標を登録する". Three's
 * `Vector3.project`/camera matrices are pure linear algebra with no WebGL
 * dependency, so this whole module (and its tests) never touches a real
 * GPU context — only `THREE.PerspectiveCamera`'s CPU-side matrices.
 */
import * as THREE from 'three';
import type { HandleId, HandleInfo } from '../contracts/handles';

/** Default handle radius (CSS px) — comfortably above the contract's radius>=48 floor, matching PRODUCT_SPEC's "primary touch target ≥72px" guidance (radius→~72px-wide comfortable target incl. corridor). */
export const DEFAULT_HANDLE_RADIUS = 56;

export interface ScreenPoint {
  x: number;
  y: number;
  /** False once the point is behind the camera or outside its near/far clip range. */
  visible: boolean;
}

/** Projects `point` (world space) through `camera` into CSS-px coordinates within a `viewportWidth`×`viewportHeight` viewport. */
export function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPoint {
  const ndc = point.clone().project(camera);
  const x = (ndc.x * 0.5 + 0.5) * viewportWidth;
  const y = (1 - (ndc.y * 0.5 + 0.5)) * viewportHeight;
  const visible = ndc.z >= -1 && ndc.z <= 1;
  return { x, y, visible };
}

export interface HandleProjectionInput {
  id: HandleId;
  worldPosition: THREE.Vector3;
  axis: HandleInfo['axis'];
  range: number;
  active: boolean;
  /** CSS px. Defaults to DEFAULT_HANDLE_RADIUS; must stay >= 48 per contracts/handles.ts. */
  radius?: number;
}

/** Builds a full HandleInfo (contracts/handles.ts) for one handle, ready for `HandleRegistry.set`. */
export function projectHandle(
  input: HandleProjectionInput,
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
): HandleInfo {
  const screen = projectToScreen(input.worldPosition, camera, viewportWidth, viewportHeight);
  const radius = input.radius ?? DEFAULT_HANDLE_RADIUS;
  return {
    id: input.id,
    x: screen.x,
    y: screen.y,
    radius,
    axis: input.axis,
    range: input.range,
    active: input.active,
  };
}

/** All handle IDs the renderer is responsible for registering. `replayButton` is intentionally excluded — see render/index.ts's public API doc comment. */
export const RENDER_OWNED_HANDLE_IDS: readonly HandleId[] = ['sandGate', 'pumpHandle', 'wedge', 'hammer'];

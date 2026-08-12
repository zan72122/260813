/**
 * Camera cue ids and camera framing constants.
 * Source of truth: docs/CAMERA_CONTRACT.md "Cue chain" table and "Global
 * rules". One `CameraDirector` (`src/visual/cameraDirector.ts`, Wave 3) owns
 * the camera; every subsystem requests cues via `EventBus['camera:cue']`,
 * never touches the camera directly.
 */

export type CameraCueId =
  | 'establish'
  | 'underground'
  | 'cableFollow'
  | 'carrierSide'
  | 'firstSlope'
  | 'transitionClose'
  | 'interiorProof'
  | 'arrivalReveal'
  | 'descent'
  | 'menu';

/** All cue ids, in the canonical CAMERA_CONTRACT cue-chain order. */
export const CAMERA_CUE_IDS: readonly CameraCueId[] = [
  'establish',
  'underground',
  'cableFollow',
  'carrierSide',
  'firstSlope',
  'transitionClose',
  'interiorProof',
  'arrivalReveal',
  'descent',
  'menu',
] as const;

/** Vertical FOV in portrait orientation, degrees. CAMERA_CONTRACT "Global rules". */
export const CAMERA_FOV_PORTRAIT_DEG = 58;
/** Vertical FOV in landscape orientation, degrees. */
export const CAMERA_FOV_LANDSCAPE_DEG = 46;
/** Camera near clip plane, world meters. */
export const CAMERA_NEAR = 0.1;
/** Camera far clip plane, world meters. */
export const CAMERA_FAR = 2000;
/** Max pitch below horizontal for any downward glance, degrees (vertigo guard). */
export const CAMERA_MAX_DOWNWARD_PITCH_DEG = 35;
/** Hard-cut cross-fade duration used instead of long dollies under `prefers-reduced-motion`. */
export const CAMERA_REDUCED_MOTION_FADE_MS = 300;

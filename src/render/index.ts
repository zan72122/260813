// src/render/index.ts
// Public surface of the camera-director module. core/index.ts is the only
// consumer (there is no frozen contract for src/render/** itself — only
// createRenderer() in src/core/index.ts is frozen).

export { createCameraDirector, type CameraDirector } from './camera';
export { stepQuality, initialQualityStepState, QUALITY_SETTINGS, type QualityStepState, type QualitySettings } from './quality';

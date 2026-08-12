/**
 * STUB — owner B (rendering-audio) owns src/render/**.
 * Real responsibility: renderer configuration, QualityTier -> render settings,
 * materials/lighting, procedural texture generation. src/app owns the DPR cap
 * value itself (part of ViewportProfile per docs/CONTRACTS.md) and calls into
 * this module to apply the rest of a QualityTier's renderer settings.
 */
import { PCFShadowMap, type WebGLRenderer } from 'three';
import type { QualityTier } from '../core';

export function configureRenderer(renderer: WebGLRenderer, tier: QualityTier): void {
  renderer.shadowMap.enabled = tier !== 'low';
  renderer.shadowMap.type = PCFShadowMap;
  // TODO(owner B): tone mapping, output color space tuning, procedural materials.
}

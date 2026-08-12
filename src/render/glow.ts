/**
 * Pin/ring glow treatment: proximity glow as a leg nears its target
 * (PRODUCT_SPEC "近接でring glow、一致でalignment glow"), plus the extra
 * transient bump from a snap flash or a finale reveal beat (both delivered
 * as a 0..1 `pulse` value from render/pulse.ts, decayed by the caller).
 * Pure intensity math + a thin apply step onto the actual materials.
 */
import type * as THREE from 'three';
import { ASSIST_RADIUS } from '../contracts/constants';

/**
 * 0 at/beyond ASSIST_RADIUS, ramping smoothly to 1 exactly at alignment
 * (alignmentError=0). Eased (power curve) so the last, most important
 * stretch of the approach reads as a distinctly brightening glow rather
 * than a linear fade.
 */
export function proximityGlowIntensity(alignmentError: number): number {
  const t = 1 - Math.min(1, Math.max(0, alignmentError) / ASSIST_RADIUS);
  return Math.pow(Math.max(0, t), 1.5);
}

/** Combines steady proximity glow with a transient pulse (snap flash / reveal beat) into one emissive-intensity value. */
export function junctionEmissiveIntensity(alignmentError: number, pulse: number): number {
  const base = proximityGlowIntensity(alignmentError) * 0.8;
  return Math.min(2.5, base + Math.max(0, pulse) * 2.2);
}

/** Applies the computed glow to a leg's pin + target-ring materials (each already a per-leg clone — see scene/tower/pinAndRing.ts). */
export function applyJunctionGlow(
  pinMaterial: THREE.MeshStandardMaterial,
  ringMaterial: THREE.MeshStandardMaterial,
  alignmentError: number,
  pulse: number,
): void {
  const intensity = junctionEmissiveIntensity(alignmentError, pulse);
  pinMaterial.emissiveIntensity = intensity;
  ringMaterial.emissiveIntensity = 0.15 + intensity * 0.6;
}

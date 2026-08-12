// src/app/quality.ts
// Crude device quality tier heuristic. Owned by Integrator (src/app/**).
// Workers may refine this; the QualityTier contract itself lives in
// src/contracts/quality.ts and must not be edited outside contracts.

import type { QualityTier } from '../contracts';

export function detectQualityTier(): QualityTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio || 1;
  if (cores <= 2 || dpr < 1.5) return 'low';
  if (cores <= 4) return 'medium';
  return 'high';
}

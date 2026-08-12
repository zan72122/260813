// src/contracts/quality.ts
// Do not edit outside src/contracts/** (see docs/OWNERSHIP.md).

export type QualityTier = 'low' | 'medium' | 'high';

export interface ViewportProfile {
  width: number;
  height: number;
  dpr: number;
  orientation: 'portrait' | 'landscape';
}

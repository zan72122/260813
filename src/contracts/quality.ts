/**
 * Adaptive quality contract. `core` (Renderer owner) computes QualityState
 * from a moving average of frame time and only ever downgrades (see
 * PERFORMANCE_BUDGET.md); render/visual owners read QualityState every
 * frame to scale DPR, particle counts and shadow use. Pure data — no
 * behavior lives here.
 */

export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityState {
  tier: QualityTier;
  dprCap: number;
  particleMax: number;
  shadows: boolean;
}

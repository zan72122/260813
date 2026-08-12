// src/render/quality.ts
// Pure adaptive-quality state machine per PERFORMANCE_BUDGET.md: a rolling
// frame-time average > 24ms sustained for ~3s steps quality down one notch
// (high -> mid -> low). Never steps back up (avoids flicker). ?test=1 pins
// 'mid' and bypasses this entirely (handled by the caller, not here).
// Kept DOM/GPU free so the stepping logic is unit-testable.

import type { QualityLevel } from '../contracts/types';

export const FRAME_BUDGET_MS = 24;
export const SUSTAIN_MS = 3000;

const STEP_DOWN: Record<QualityLevel, QualityLevel> = {
  high: 'mid',
  mid: 'low',
  low: 'low',
};

/** Per-quality tuning knobs the scene/particle systems read. */
export interface QualitySettings {
  dprCap: number;
  steamMax: number;
  sparkMax: number;
  backdropDetail: 'full' | 'reduced' | 'minimal';
}

export const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  high: { dprCap: 1.75, steamMax: 120, sparkMax: 40, backdropDetail: 'full' },
  mid: { dprCap: 1.4, steamMax: 70, sparkMax: 24, backdropDetail: 'reduced' },
  low: { dprCap: 1.0, steamMax: 30, sparkMax: 12, backdropDetail: 'minimal' },
};

export interface QualityStepState {
  level: QualityLevel;
  /** Rolling exponential-moving-average frame time, ms. */
  avgFrameMs: number;
  /** How long (ms) avgFrameMs has continuously exceeded the budget. */
  overBudgetMs: number;
}

export function initialQualityStepState(level: QualityLevel): QualityStepState {
  return { level, avgFrameMs: FRAME_BUDGET_MS, overBudgetMs: 0 };
}

const EMA_ALPHA = 0.1;

/**
 * Advance the adaptive-quality state machine by one frame. Pure: takes the
 * previous state + this frame's dt, returns the next state. `pinned=true`
 * (?test=1) freezes stepping (still updates avgFrameMs for observability,
 * but overBudgetMs never accumulates and level never changes).
 */
export function stepQuality(
  prev: QualityStepState,
  frameMs: number,
  pinned: boolean,
): QualityStepState {
  const avgFrameMs = prev.avgFrameMs + (frameMs - prev.avgFrameMs) * EMA_ALPHA;
  if (pinned) {
    return { level: prev.level, avgFrameMs, overBudgetMs: 0 };
  }
  const over = avgFrameMs > FRAME_BUDGET_MS;
  const overBudgetMs = over ? prev.overBudgetMs + frameMs : 0;
  if (overBudgetMs >= SUSTAIN_MS && prev.level !== 'low') {
    return { level: STEP_DOWN[prev.level], avgFrameMs, overBudgetMs: 0 };
  }
  return { level: prev.level, avgFrameMs, overBudgetMs };
}

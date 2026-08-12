/**
 * Adaptive quality manager — implements the auto-downgrade policy from
 * ARCHITECTURE_CONTRACT.md § quality.ts / PERFORMANCE_BUDGET.md:
 * "直近60frameの移動平均frame time > 25msで一段降格(復帰昇格なし)".
 *
 * Split into pure functions (tier ordering, QualityState derivation, the
 * downgrade decision) and a small stateful wrapper around them, so the
 * decision logic itself is trivially unit-testable without constructing the
 * class or feeding 60 real frames through a timer.
 */
import { DPR_CAP, PARTICLE_BUDGET, PARTICLE_BUDGET_LOW } from '../contracts/constants';
import type { QualityState, QualityTier } from '../contracts/quality';

/** Downgrade path, best → worst. Index order matters: never move backward (upgrade). */
export const QUALITY_TIER_ORDER: readonly QualityTier[] = ['high', 'medium', 'low'];

/** Frame-time moving-average window length (~60 frames per PERFORMANCE_BUDGET.md). */
export const QUALITY_WINDOW_FRAMES = 60;

/** Moving-average frame-time threshold (ms) that triggers one downgrade step. */
export const QUALITY_DOWNGRADE_THRESHOLD_MS = 25;

/** Derives the full QualityState for a tier. Pure — this is the sole source of truth mapping tier→settings. */
export function qualityStateForTier(tier: QualityTier): QualityState {
  return {
    tier,
    dprCap: DPR_CAP[tier],
    particleMax: tier === 'low' ? PARTICLE_BUDGET_LOW : PARTICLE_BUDGET,
    shadows: tier === 'high',
  };
}

/** The tier one step below `tier`, or null if already at the worst tier. Pure. */
export function nextDowngradeTier(tier: QualityTier): QualityTier | null {
  const idx = QUALITY_TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= QUALITY_TIER_ORDER.length - 1) return null;
  return QUALITY_TIER_ORDER[idx + 1] ?? null;
}

/**
 * Parses the `?quality=` URL override (ARCHITECTURE_CONTRACT.md testing.ts
 * § URL params). Returns null for anything not exactly one of the three
 * tiers, so callers can fall back to the 'high' default.
 */
export function parseQualityOverride(value: string | null | undefined): QualityTier | null {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return null;
}

/**
 * Pure decision function: given the tier in effect and a *full* window of
 * frame samples (ms), returns the tier that should be in effect after
 * evaluating that window — either unchanged, or one step down. Never
 * returns a tier better than `currentTier` (no upgrade path exists).
 */
export function evaluateWindow(currentTier: QualityTier, samplesMs: readonly number[]): QualityTier {
  if (samplesMs.length === 0) return currentTier;
  let sum = 0;
  for (const s of samplesMs) sum += s;
  const avg = sum / samplesMs.length;
  if (avg > QUALITY_DOWNGRADE_THRESHOLD_MS) {
    return nextDowngradeTier(currentTier) ?? currentTier;
  }
  return currentTier;
}

export interface QualityManager {
  /** Current QualityState. Reference-stable between tier changes (cheap to compare). */
  readonly state: QualityState;
  /**
   * Feed one frame's duration (ms). Every `QUALITY_WINDOW_FRAMES` samples,
   * evaluates the moving average and downgrades at most one tier. Returns
   * the (possibly-updated) state.
   */
  sample(frameMs: number): QualityState;
  /** Clears the current sample window without changing tier (e.g. after a deliberate quality-affecting scene change). */
  resetWindow(): void;
}

export interface QualityManagerOptions {
  /** Starting tier — normally 'high', or the `?quality=` override. Default 'high'. */
  initialTier?: QualityTier;
  /** Window size override, mainly for tests. Default QUALITY_WINDOW_FRAMES. */
  windowFrames?: number;
}

class QualityManagerImpl implements QualityManager {
  private tier: QualityTier;
  private readonly windowFrames: number;
  private samples: number[] = [];
  state: QualityState;

  constructor(opts: QualityManagerOptions) {
    this.tier = opts.initialTier ?? 'high';
    this.windowFrames = opts.windowFrames ?? QUALITY_WINDOW_FRAMES;
    this.state = qualityStateForTier(this.tier);
  }

  sample(frameMs: number): QualityState {
    this.samples.push(frameMs);
    if (this.samples.length < this.windowFrames) return this.state;

    const nextTier = evaluateWindow(this.tier, this.samples);
    this.samples = [];
    if (nextTier !== this.tier) {
      this.tier = nextTier;
      this.state = qualityStateForTier(nextTier);
    }
    return this.state;
  }

  resetWindow(): void {
    this.samples = [];
  }
}

/** Creates a QualityManager. See module doc for the downgrade policy. */
export function createQualityManager(opts: QualityManagerOptions = {}): QualityManager {
  return new QualityManagerImpl(opts);
}

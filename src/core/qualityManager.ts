/**
 * Adaptive quality tiers. PERFORMANCE_BUDGET.md: "3 tiers, auto-downgrade
 * after 60 consecutive frames over budget, upgrade hysteresis 10 s; never
 * changes gameplay/sim." Pure frame-time state machine — no WebGL/DOM
 * access — so it is unit-testable in a node environment with synthetic
 * frame times, and callers (the renderer owner's `EiffelSceneWorld`) wire
 * its callbacks to DPR/shadow/particle/instance-detail knobs.
 */

import { DPR_CAP_HIGH, DPR_CAP_LOW, QUALITY_TIERS, type QualityTier } from '../contracts/constants.ts';

/** Instanced-lattice detail knob the scene builder reads per tier. */
export type InstanceDetail = 'full' | 'reduced' | 'minimal';

export interface QualityTierSettings {
  readonly dpr: number;
  readonly shadowsEnabled: boolean;
  /** Max simultaneous additive fx sprites (steam/sparkle). */
  readonly particleBudget: number;
  readonly instanceDetail: InstanceDetail;
}

/** Frame budget above which a frame counts "over budget" (~50 fps), ms. */
export const OVER_BUDGET_FRAME_MS = 1000 / 50;
/** Consecutive over-budget frames before downgrading a tier. */
export const DOWNGRADE_STREAK_FRAMES = 60;
/** Wall-clock ms of sustained good frames required before upgrading a tier. */
export const UPGRADE_HYSTERESIS_MS = 10_000;

export const TIER_SETTINGS: Readonly<Record<QualityTier, QualityTierSettings>> = {
  high: { dpr: DPR_CAP_HIGH, shadowsEnabled: true, particleBudget: 200, instanceDetail: 'full' },
  medium: { dpr: DPR_CAP_HIGH, shadowsEnabled: true, particleBudget: 80, instanceDetail: 'reduced' },
  low: { dpr: DPR_CAP_LOW, shadowsEnabled: false, particleBudget: 0, instanceDetail: 'minimal' },
};

export interface QualityManagerCallbacks {
  /** Fired once whenever the active tier actually changes (not every frame). */
  onTierChange?: (tier: QualityTier, settings: QualityTierSettings) => void;
}

/**
 * Tracks per-frame render cost and walks `high -> medium -> low` on
 * sustained overrun, and back up after a sustained calm period. Never
 * touches gameplay state — callers apply the resulting settings to
 * rendering knobs only.
 */
export class QualityManager {
  private tierIndex: number;
  private overBudgetStreak = 0;
  private goodStreakMs = 0;

  constructor(
    private readonly callbacks: QualityManagerCallbacks = {},
    initialTier: QualityTier = 'high',
  ) {
    this.tierIndex = QUALITY_TIERS.indexOf(initialTier);
    if (this.tierIndex < 0) this.tierIndex = 0;
  }

  get tier(): QualityTier {
    return QUALITY_TIERS[this.tierIndex]!;
  }

  get settings(): QualityTierSettings {
    return TIER_SETTINGS[this.tier];
  }

  /** Report one frame's render duration (ms). Returns the (possibly new) active tier. */
  reportFrame(frameMs: number): QualityTier {
    if (!(frameMs >= 0)) return this.tier;

    if (frameMs > OVER_BUDGET_FRAME_MS) {
      this.overBudgetStreak += 1;
      this.goodStreakMs = 0;
      if (this.overBudgetStreak >= DOWNGRADE_STREAK_FRAMES) {
        this.overBudgetStreak = 0;
        this.setTierIndex(this.tierIndex + 1);
      }
    } else {
      this.overBudgetStreak = 0;
      if (this.tierIndex > 0) {
        this.goodStreakMs += frameMs;
        if (this.goodStreakMs >= UPGRADE_HYSTERESIS_MS) {
          this.goodStreakMs = 0;
          this.setTierIndex(this.tierIndex - 1);
        }
      }
    }
    return this.tier;
  }

  /** Reset streak counters without changing the current tier (e.g. after a manual override). */
  resetStreaks(): void {
    this.overBudgetStreak = 0;
    this.goodStreakMs = 0;
  }

  private setTierIndex(next: number): void {
    const clamped = Math.min(QUALITY_TIERS.length - 1, Math.max(0, next));
    if (clamped === this.tierIndex) return;
    this.tierIndex = clamped;
    this.callbacks.onTierChange?.(this.tier, this.settings);
  }
}

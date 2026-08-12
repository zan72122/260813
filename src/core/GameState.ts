import type { EventBus } from './EventBus';
import { TRANSFORM_TIMELINE, clamp01 } from './TransformTimeline';
import type {
  GamePhase,
  GameStateSnapshot,
  QualityTier,
  SceneId,
  StageTransformProgress,
  TransformPair,
  ViewportProfile
} from './types';

const DEFAULT_VIEWPORT: ViewportProfile = {
  width: 390,
  height: 844,
  dpr: 1,
  orientation: 'portrait',
  safeArea: { top: 0, bottom: 0, left: 0, right: 0 }
};

const DEFAULT_SNAPSHOT: GameStateSnapshot = {
  phase: 'boot',
  pair: { from: 'salon', to: 'forest' },
  progress: 0,
  currentScene: 'salon',
  quality: 'medium',
  viewport: DEFAULT_VIEWPORT,
  muted: false,
  reducedMotion: false
};

/**
 * Applies the CONTRACTS.md snap rule: p > 0.97 -> 1.0, p < 0.03 -> 0.0,
 * otherwise the clamped value passes through unchanged.
 *
 * Direction-aware: the high snap only fires while p is climbing (rawP >= the
 * reference value), and the low snap only fires while p is falling. Without
 * this, GameState.setProgress(rawP) would be a trap at the boundaries: a
 * single ropeDrag delta near the start of a pull (a normal per-frame
 * increment, typically well under 0.03 — see
 * docs/STAGE_MECHANISM_ABSTRACTION.md's stroke formula) computes a raw value
 * under SNAP_LOW every time, and every subsequent frame's `current +
 * deltaProgress` starts from that already-snapped-to-0 current again — p can
 * never climb past 0 via realistic small increments, only via one single
 * drag event large enough to clear 0.03 outright. The `previousP` parameter
 * defaults to the clamped rawP itself, so a bare `applySnap(x)` call (as used
 * for a final/resting value with no drag context) keeps its original
 * direction-agnostic behavior — this only changes GameState.setProgress,
 * which passes the prior snapshot value as `previousP`.
 */
export function applySnap(rawP: number, previousP?: number): number {
  const clamped = clamp01(rawP);
  const prev = previousP === undefined ? clamped : clamp01(previousP);
  if (clamped > TRANSFORM_TIMELINE.SNAP_HIGH && clamped >= prev) return 1;
  if (clamped < TRANSFORM_TIMELINE.SNAP_LOW && clamped <= prev) return 0;
  return clamped;
}

/**
 * Single mutable store for GameStateSnapshot. All mutation goes through typed
 * setters that apply the CONTRACTS.md clamp/snap rules and emit the matching
 * GameEvent on the shared EventBus. Consumers should treat getSnapshot()'s
 * return value as read-only (it is frozen).
 */
export class GameState {
  private snapshot: GameStateSnapshot;

  constructor(private readonly bus: EventBus, initial?: Partial<GameStateSnapshot>) {
    this.snapshot = Object.freeze({ ...DEFAULT_SNAPSHOT, ...initial });
  }

  getSnapshot(): Readonly<GameStateSnapshot> {
    return this.snapshot;
  }

  setPhase(to: GamePhase): void {
    const from = this.snapshot.phase;
    if (from === to) return;
    this.patch({ phase: to });
    this.bus.emit({ type: 'phaseChanged', from, to });
  }

  setPair(pair: TransformPair): void {
    this.patch({ pair });
  }

  setCurrentScene(id: SceneId): void {
    this.patch({ currentScene: id });
  }

  /**
   * Clamp + snap rawP per CONTRACTS.md (0.97 -> 1.0, 0.03 -> 0.0), store it,
   * and emit `transformProgress` every call plus an edge-triggered
   * `transformComplete`/`transformReset` the moment a snap boundary is crossed.
   */
  setProgress(rawP: StageTransformProgress, velocity = 0): void {
    const previous = this.snapshot.progress;
    const next = applySnap(rawP, previous);
    this.patch({ progress: next });

    this.bus.emit({ type: 'transformProgress', pair: this.snapshot.pair, p: next, velocity });

    if (next === 1 && previous !== 1) {
      this.bus.emit({ type: 'transformComplete', pair: this.snapshot.pair });
    } else if (next === 0 && previous !== 0) {
      this.bus.emit({ type: 'transformReset', pair: this.snapshot.pair });
    }
  }

  setQuality(tier: QualityTier): void {
    if (this.snapshot.quality === tier) return;
    this.patch({ quality: tier });
    this.bus.emit({ type: 'qualityChanged', tier });
  }

  setViewport(profile: ViewportProfile): void {
    this.patch({ viewport: profile });
    this.bus.emit({ type: 'viewportChanged', profile });
  }

  setMuted(muted: boolean): void {
    this.patch({ muted });
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.patch({ reducedMotion });
  }

  private patch(partial: Partial<GameStateSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...partial });
  }
}

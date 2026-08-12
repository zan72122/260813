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
 */
export function applySnap(rawP: number): number {
  const clamped = clamp01(rawP);
  if (clamped > TRANSFORM_TIMELINE.SNAP_HIGH) return 1;
  if (clamped < TRANSFORM_TIMELINE.SNAP_LOW) return 0;
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
    const next = applySnap(rawP);
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

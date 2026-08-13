import { EventEmitter } from './events.ts';
import { findCaptureTarget } from './intent.ts';
import {
  addWipeProgress,
  closeCurtain,
  completeNapVignette,
  completeVignette,
  emptyLunchCleanupProgress,
  emptyLunchSetupProgress,
  emptyNapSetupProgress,
  emptyPlayCleanupProgress,
  emptyWakeRestoreProgress,
  isLunchCleanupComplete,
  isLunchFurnitureReady,
  isLunchSetupComplete,
  isNapFurnitureReady,
  isNapSetupComplete,
  isPlayCleanupComplete,
  isWakeRestoreComplete,
  openCurtain,
  placeBedding,
  placeMat,
  placeTray,
  popChair,
  popToysOut,
  returnTray,
  rollMat,
  setMatUnrollProgress,
  setTableOut,
  shelveMat,
  stackChair,
  storeTable,
  storeToy,
  type LunchCleanupProgress,
  type LunchSetupProgress,
  type NapSetupProgress,
  type PlayCleanupProgress,
  type WakeRestoreProgress,
} from './objectives.ts';
import { createRng, SeededRng } from './rng.ts';
import { generateSeedConfig, pickNextShuffleSeed } from './seeds.ts';
import { TOTAL_MATS, type Phase, type SeedConfig, type Vec2 } from './types.ts';

export interface FsmEvents extends Record<string, unknown> {
  phaseChange: { from: Phase; to: Phase; seed: number };
  progressChange: { phase: Phase };
  toyCaptured: { toyId: string; basketId: string };
  toyRejected: { toyId: string; nearestBasketId: string | null };
  trayReturned: { trayId: string };
  trayRejected: Record<string, never>;
  matCaptured: { matId: string; markerIndex: number };
  matRejected: { matId: string };
  seedChanged: { seed: number };
}

const DEFAULT_NEXT: Partial<Record<Phase, Phase>> = {
  TITLE: 'PLAY_CLEANUP',
  PLAY_CLEANUP: 'LUNCH_SETUP',
  LUNCH_SETUP: 'LUNCH_CLEANUP',
  LUNCH_CLEANUP: 'NAP_SETUP',
  NAP_SETUP: 'WAKE_RESTORE',
  WAKE_RESTORE: 'REPLAY',
  REPLAY: 'PLAY_CLEANUP',
};

const LEGAL_NEXT: Record<Phase, readonly Phase[]> = {
  TITLE: ['PLAY_CLEANUP'],
  PLAY_CLEANUP: ['LUNCH_SETUP'],
  LUNCH_SETUP: ['LUNCH_CLEANUP'],
  LUNCH_CLEANUP: ['NAP_SETUP'],
  NAP_SETUP: ['WAKE_RESTORE'],
  WAKE_RESTORE: ['REPLAY'],
  REPLAY: ['PLAY_CLEANUP', 'FREE_PLAY', 'TITLE'],
  FREE_PLAY: ['REPLAY', 'TITLE'],
};

/**
 * The full game session: current phase, seeded layout, and per-phase
 * objective progress. Zero three.js imports — the scene layer reads from
 * this via getters and events, never the other way around.
 */
export class GameFsm {
  readonly events = new EventEmitter<FsmEvents>();

  private _phase: Phase = 'TITLE';
  private _seedConfig: SeedConfig;
  private _shuffleRng: SeededRng;
  private _runCount = 0;

  private _playCleanup: PlayCleanupProgress = emptyPlayCleanupProgress;
  private _lunchSetup: LunchSetupProgress = emptyLunchSetupProgress;
  private _lunchCleanup: LunchCleanupProgress = emptyLunchCleanupProgress;
  private _napSetup: NapSetupProgress = emptyNapSetupProgress;
  private _wakeRestore: WakeRestoreProgress = emptyWakeRestoreProgress;

  constructor(seed: number) {
    this._seedConfig = generateSeedConfig(seed);
    this._shuffleRng = createRng(seed ^ 0x5bd1e995);
  }

  get phase(): Phase {
    return this._phase;
  }

  get seedConfig(): SeedConfig {
    return this._seedConfig;
  }

  get runCount(): number {
    return this._runCount;
  }

  get playCleanup(): PlayCleanupProgress {
    return this._playCleanup;
  }
  get lunchSetup(): LunchSetupProgress {
    return this._lunchSetup;
  }
  get lunchCleanup(): LunchCleanupProgress {
    return this._lunchCleanup;
  }
  get napSetup(): NapSetupProgress {
    return this._napSetup;
  }
  get wakeRestore(): WakeRestoreProgress {
    return this._wakeRestore;
  }

  canTransitionTo(next: Phase): boolean {
    return LEGAL_NEXT[this._phase].includes(next);
  }

  private setPhase(next: Phase): void {
    const from = this._phase;
    if (from === next) return;
    this._phase = next;
    this.events.emit('phaseChange', { from, to: next, seed: this._seedConfig.seed });
  }

  transitionTo(next: Phase): void {
    if (!this.canTransitionTo(next)) {
      throw new Error(`Illegal FSM transition: ${this._phase} -> ${next}`);
    }
    if (next === 'PLAY_CLEANUP') {
      this.resetRunProgress();
      this._runCount += 1;
    }
    this.setPhase(next);
  }

  /** Advances along the default forward path; no-op on FREE_PLAY (has no default forward). */
  advance(): void {
    const next = DEFAULT_NEXT[this._phase];
    if (!next) return;
    this.transitionTo(next);
  }

  start(): void {
    this.transitionTo('PLAY_CLEANUP');
  }

  replaySameDay(): void {
    this.transitionTo('PLAY_CLEANUP');
  }

  replayShuffle(): number {
    const next = pickNextShuffleSeed(this._seedConfig.seed, this._shuffleRng);
    this.setSeed(next);
    this.transitionTo('PLAY_CLEANUP');
    return next;
  }

  enterFreePlay(): void {
    this.transitionTo('FREE_PLAY');
  }

  exitFreePlay(): void {
    this.transitionTo('REPLAY');
  }

  setSeed(seed: number): void {
    this._seedConfig = generateSeedConfig(seed);
    this._shuffleRng = createRng(seed ^ 0x5bd1e995);
    this.resetRunProgress();
    this.events.emit('seedChanged', { seed });
  }

  private resetRunProgress(): void {
    this._playCleanup = emptyPlayCleanupProgress;
    this._lunchSetup = emptyLunchSetupProgress;
    this._lunchCleanup = emptyLunchCleanupProgress;
    this._napSetup = emptyNapSetupProgress;
    this._wakeRestore = emptyWakeRestoreProgress;
  }

  private emitProgress(): void {
    this.events.emit('progressChange', { phase: this._phase });
  }

  // ---- PLAY_CLEANUP ----

  /** Attempts to store a toy at a drop position; resolves basket via generous capture radius against the toy's assigned symbol basket. */
  attemptStoreToy(toyId: string, dropPos: Vec2): { success: boolean; basketId: string | null } {
    const toy = this._seedConfig.toys.find((t) => t.id === toyId);
    if (!toy) return { success: false, basketId: null };
    const matchingBasket = this._seedConfig.baskets.find((b) => b.symbol === toy.symbol);
    const candidates = this._seedConfig.baskets.map((b) => ({ target: b.id, position: b.position, radius: b.radius }));
    const nearest = findCaptureTarget(dropPos, candidates);

    if (matchingBasket) {
      const withinCorrect =
        findCaptureTarget(dropPos, [{ target: matchingBasket.id, position: matchingBasket.position, radius: matchingBasket.radius }])
          ?.withinRadius ?? false;
      if (withinCorrect) {
        this._playCleanup = storeToy(this._playCleanup, toyId);
        this.emitProgress();
        this.events.emit('toyCaptured', { toyId, basketId: matchingBasket.id });
        return { success: true, basketId: matchingBasket.id };
      }
    }
    this.events.emit('toyRejected', { toyId, nearestBasketId: nearest?.target ?? null });
    return { success: false, basketId: nearest?.target ?? null };
  }

  isPlayCleanupComplete(): boolean {
    return isPlayCleanupComplete(this._playCleanup, this._seedConfig.toys.length);
  }

  // ---- LUNCH_SETUP ----

  dragTableOut(): void {
    this._lunchSetup = setTableOut(this._lunchSetup);
    this.emitProgress();
  }

  popChairOut(): void {
    this._lunchSetup = popChair(this._lunchSetup);
    this.emitProgress();
  }

  placeTrayOnTable(): void {
    this._lunchSetup = placeTray(this._lunchSetup);
    this.emitProgress();
  }

  isLunchFurnitureReady(): boolean {
    return isLunchFurnitureReady(this._lunchSetup);
  }

  completeEatingVignette(): void {
    this._lunchSetup = completeVignette(this._lunchSetup);
    this.emitProgress();
  }

  isLunchSetupComplete(): boolean {
    return isLunchSetupComplete(this._lunchSetup);
  }

  // ---- LUNCH_CLEANUP ----

  attemptReturnTray(dropPos: Vec2, cartPos: Vec2, cartRadius: number): boolean {
    const result = findCaptureTarget(dropPos, [{ target: 'cart', position: cartPos, radius: cartRadius }]);
    if (result?.withinRadius) {
      this._lunchCleanup = returnTray(this._lunchCleanup);
      this.emitProgress();
      this.events.emit('trayReturned', { trayId: 'tray' });
      return true;
    }
    this.events.emit('trayRejected', {});
    return false;
  }

  addWipeProgress(delta: number): void {
    this._lunchCleanup = addWipeProgress(this._lunchCleanup, delta);
    this.emitProgress();
  }

  tapTableToStore(): void {
    this._lunchCleanup = storeTable(this._lunchCleanup);
    this.emitProgress();
  }

  stackChairBack(): void {
    this._lunchCleanup = stackChair(this._lunchCleanup);
    this.emitProgress();
  }

  isLunchCleanupComplete(): boolean {
    return isLunchCleanupComplete(this._lunchCleanup);
  }

  // ---- NAP_SETUP ----

  attemptPlaceMat(matId: string, dropPos: Vec2): boolean {
    const mat = this._seedConfig.mats.find((m) => m.id === matId);
    if (!mat) return false;
    const marker = matMarkerPosition(mat.markerIndex);
    const result = findCaptureTarget(dropPos, [{ target: matId, position: marker, radius: 0.14 }]);
    if (result?.withinRadius) {
      this._napSetup = placeMat(this._napSetup);
      this.emitProgress();
      this.events.emit('matCaptured', { matId, markerIndex: mat.markerIndex });
      return true;
    }
    this.events.emit('matRejected', { matId });
    return false;
  }

  setMatUnrollProgress(matId: string, progress: number): void {
    this._napSetup = setMatUnrollProgress(this._napSetup, matId, progress);
    this.emitProgress();
  }

  placeBeddingItem(): void {
    this._napSetup = placeBedding(this._napSetup);
    this.emitProgress();
  }

  closeCurtainNap(): void {
    this._napSetup = closeCurtain(this._napSetup);
    this.emitProgress();
  }

  isNapFurnitureReady(): boolean {
    return isNapFurnitureReady(this._napSetup);
  }

  completeNapVignette(): void {
    this._napSetup = completeNapVignette(this._napSetup);
    this.emitProgress();
  }

  isNapSetupComplete(): boolean {
    return isNapSetupComplete(this._napSetup);
  }

  // ---- WAKE_RESTORE ----

  openCurtainWake(): void {
    this._wakeRestore = openCurtain(this._wakeRestore);
    this.emitProgress();
  }

  rollMatBack(): void {
    this._wakeRestore = rollMat(this._wakeRestore);
    this.emitProgress();
  }

  shelveMatBack(): void {
    this._wakeRestore = shelveMat(this._wakeRestore);
    this.emitProgress();
  }

  popToysBackOut(): void {
    this._wakeRestore = popToysOut(this._wakeRestore);
    this.emitProgress();
  }

  isWakeRestoreComplete(): boolean {
    return isWakeRestoreComplete(this._wakeRestore);
  }

  /**
   * Test-harness fast-forward: completes every sub-objective of the current
   * phase's progress tracker (without necessarily advancing the phase, so
   * callers can assert completion predicates before calling advance()).
   */
  completeCurrentObjective(): void {
    switch (this._phase) {
      case 'PLAY_CLEANUP':
        for (const toy of this._seedConfig.toys) {
          const basket = this._seedConfig.baskets.find((b) => b.symbol === toy.symbol);
          if (basket) this.attemptStoreToy(toy.id, basket.position);
        }
        break;
      case 'LUNCH_SETUP':
        this.dragTableOut();
        for (let i = 0; i < 4; i++) this.popChairOut();
        for (let i = 0; i < 4; i++) this.placeTrayOnTable();
        this.completeEatingVignette();
        break;
      case 'LUNCH_CLEANUP': {
        const cartPos: Vec2 = { x: 0, z: -0.8 };
        for (let i = 0; i < 4; i++) this.attemptReturnTray(cartPos, cartPos, 0.3);
        this.addWipeProgress(1);
        this.tapTableToStore();
        for (let i = 0; i < 4; i++) this.stackChairBack();
        break;
      }
      case 'NAP_SETUP':
        for (const mat of this._seedConfig.mats) {
          this.attemptPlaceMat(mat.id, matMarkerPosition(mat.markerIndex));
          this.setMatUnrollProgress(mat.id, 1);
          this.placeBeddingItem();
        }
        this.closeCurtainNap();
        this.completeNapVignette();
        break;
      case 'WAKE_RESTORE':
        this.openCurtainWake();
        for (let i = 0; i < TOTAL_MATS; i++) {
          this.rollMatBack();
          this.shelveMatBack();
        }
        this.popToysBackOut();
        break;
      default:
        break;
    }
  }
}

export function matMarkerPosition(index: number): Vec2 {
  // 4 markers in a tidy row, matches scene-layer layout constants.
  const spacing = 0.34;
  const startX = -((TOTAL_MATS - 1) * spacing) / 2;
  return { x: startX + index * spacing, z: -0.15 };
}

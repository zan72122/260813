import { AudioEngine } from '../audio/AudioEngine.ts';
import { GameFsm, matMarkerPosition } from '../game/fsm.ts';
import type { Phase } from '../game/types.ts';
import type { SceneRoot } from '../scene/SceneRoot.ts';

/**
 * window.__game — active only when the page URL has ?test=1 (see main.ts).
 * Gives Playwright deterministic control + introspection without needing
 * pixel-perfect synthetic pointer gestures for every assertion. Entirely
 * inert (never installed) in normal play.
 */
export interface GameHarness {
  readonly phase: Phase;
  readonly seed: number;
  readonly drawCalls: number;
  readonly shadowSlotsUsed: number;
  readonly debugCamera: { fov: number; aspect: number; position: number[]; shot: string };
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  advancePhase: () => void;
  completeCurrentObjective: () => void;
  setSeed: (seed: number) => void;
  toggleMute: () => void;
  setReducedMotion: (value: boolean) => void;
  skipVignette: () => void;
  getSnapshot: () => unknown;
  getProgress: () => unknown;
  simulateStoreToy: (toyId: string) => { success: boolean; basketId: string | null };
  simulateStoreAllToys: () => void;
  simulateDragTableOut: () => void;
  simulatePopChair: () => void;
  simulatePlaceTray: () => void;
  simulateReturnTray: (index: number) => boolean;
  simulateAddWipeProgress: (delta: number) => void;
  simulateTapTableStore: () => void;
  simulateStackChair: () => void;
  simulatePlaceMat: (matId: string) => boolean;
  simulateUnrollMat: (matId: string, progress: number) => void;
  simulatePlaceBedding: () => void;
  simulateCloseCurtain: () => void;
  simulateOpenCurtain: () => void;
  simulateRollMat: () => void;
  simulateShelveMat: () => void;
  simulatePopToysOut: () => void;
  startGame: () => void;
  replaySameDay: () => void;
  replayShuffle: () => number;
  enterFreePlay: () => void;
  exitFreePlay: () => void;
  screenPositionOfToy: (id: string) => { x: number; y: number } | null;
  screenPositionOfBasket: (id: string) => { x: number; y: number } | null;
  screenPositionOfMat: (id: string) => { x: number; y: number } | null;
  screenPositionOfMatMarker: (id: string) => { x: number; y: number } | null;
  screenPositionOfMatUnrollTarget: (id: string) => { x: number; y: number } | null;
  screenPositionOfHandle: (kind: 'table' | 'cart' | 'chairStack' | 'curtain' | 'wipe') => { x: number; y: number };
  screenPositionOfTray: (index: number) => { x: number; y: number };
  debugPickables: () => { kind: string; id: string; screen: { x: number; y: number } }[];
  forceCompleteCurrentPhaseVisuals: () => void;
}

export function installTestHarness(fsm: GameFsm, sceneRoot: SceneRoot, audio: AudioEngine): void {
  const harness: GameHarness = {
    get phase() {
      return fsm.phase;
    },
    get seed() {
      return fsm.seedConfig.seed;
    },
    get drawCalls() {
      return sceneRoot.drawCalls;
    },
    get shadowSlotsUsed() {
      return sceneRoot.shadowSlotsUsed;
    },
    get debugCamera() {
      return sceneRoot.debugCamera;
    },
    get muted() {
      return audio.isMuted;
    },
    get reducedMotion() {
      return document.body.classList.contains('reduced-motion');
    },
    advancePhase: () => fsm.advance(),
    completeCurrentObjective: () => fsm.completeCurrentObjective(),
    setSeed: (seed: number) => fsm.setSeed(seed),
    toggleMute: () => audio.toggleMuted(),
    setReducedMotion: (value: boolean) => {
      sceneRoot.setReducedMotion(value);
      document.body.classList.toggle('reduced-motion', value);
    },
    skipVignette: () => sceneRoot.skipVignette(),
    getSnapshot: () => fsm.seedConfig,
    getProgress: () => ({
      playCleanup: fsm.playCleanup,
      lunchSetup: fsm.lunchSetup,
      lunchCleanup: fsm.lunchCleanup,
      napSetup: fsm.napSetup,
      wakeRestore: fsm.wakeRestore,
    }),
    simulateStoreToy: (toyId: string) => {
      const toy = fsm.seedConfig.toys.find((t) => t.id === toyId);
      if (!toy) return { success: false, basketId: null };
      const basket = fsm.seedConfig.baskets.find((b) => b.symbol === toy.symbol);
      if (!basket) return { success: false, basketId: null };
      return fsm.attemptStoreToy(toyId, basket.position);
    },
    simulateStoreAllToys: () => sceneRoot.simulateStoreAllToys(),
    simulateDragTableOut: () => fsm.dragTableOut(),
    simulatePopChair: () => fsm.popChairOut(),
    simulatePlaceTray: () => fsm.placeTrayOnTable(),
    simulateReturnTray: (index: number) => {
      void index;
      return fsm.attemptReturnTray({ x: 0, z: -0.8 }, { x: 0, z: -0.8 }, 0.3);
    },
    simulateAddWipeProgress: (delta: number) => fsm.addWipeProgress(delta),
    simulateTapTableStore: () => fsm.tapTableToStore(),
    simulateStackChair: () => fsm.stackChairBack(),
    simulatePlaceMat: (matId: string) => {
      const mat = fsm.seedConfig.mats.find((m) => m.id === matId);
      if (!mat) return false;
      return fsm.attemptPlaceMat(matId, matMarkerPosition(mat.markerIndex));
    },
    simulateUnrollMat: (matId: string, progress: number) => fsm.setMatUnrollProgress(matId, progress),
    simulatePlaceBedding: () => fsm.placeBeddingItem(),
    simulateCloseCurtain: () => fsm.closeCurtainNap(),
    simulateOpenCurtain: () => fsm.openCurtainWake(),
    simulateRollMat: () => fsm.rollMatBack(),
    simulateShelveMat: () => fsm.shelveMatBack(),
    simulatePopToysOut: () => fsm.popToysBackOut(),
    startGame: () => {
      audio.resume();
      if (fsm.phase === 'TITLE') fsm.start();
      sceneRoot.start();
    },
    replaySameDay: () => fsm.replaySameDay(),
    replayShuffle: () => fsm.replayShuffle(),
    enterFreePlay: () => fsm.enterFreePlay(),
    exitFreePlay: () => fsm.exitFreePlay(),
    screenPositionOfToy: (id: string) => sceneRoot.screenPositionOfToy(id),
    screenPositionOfBasket: (id: string) => sceneRoot.screenPositionOfBasket(id),
    screenPositionOfMat: (id: string) => sceneRoot.screenPositionOfMat(id),
    screenPositionOfMatMarker: (id: string) => sceneRoot.screenPositionOfMatMarker(id),
    screenPositionOfMatUnrollTarget: (id: string) => sceneRoot.screenPositionOfMatUnrollTarget(id),
    screenPositionOfHandle: (kind) => sceneRoot.screenPositionOfHandle(kind),
    screenPositionOfTray: (index: number) => sceneRoot.screenPositionOfTray(index),
    debugPickables: () => sceneRoot.debugPickables(),
    forceCompleteCurrentPhaseVisuals: () => sceneRoot.forceCompleteCurrentPhaseVisuals(),
  };

  (window as unknown as { __game: GameHarness }).__game = harness;
}

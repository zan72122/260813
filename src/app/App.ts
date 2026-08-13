/**
 * The integrator: constructs and wires every subsystem, owns the boot
 * sequence and the fixed-step loop, and assembles `window.__eiffel`. This
 * is the ONLY module allowed to import subsystem implementations directly
 * (ARCHITECTURE_CONTRACT "Dependency rule").
 *
 * Wave 4: swaps the Wave-2 stub subsystems for the real Wave-3
 * implementations per ARCHITECTURE_CONTRACT "Wiring conventions":
 *  - `EiffelGameLogic(store, bus, seed)` — real drive/leveling/state-machine
 *    pipeline; `scrubToT(t)` (an extra, non-frozen method) is duck-typed and
 *    used to route `__eiffel.setT` through a fully consistent settled state.
 *  - `EiffelSceneWorld` — real renderer/scene/camera; `getDrawCalls()` and
 *    `isCameraSettled()` are its (non-frozen) QA-readout extras, mirroring
 *    the Wave-2 stub's `setOnFirstFrame` shape so the boot wiring is
 *    otherwise unchanged.
 *  - `EiffelUiLayer({ onIntent, onAction, bus })` — real DOM controls; its
 *    `UiAction`s are mapped onto `GameLogic`/`GameStore` calls below.
 *  - `EiffelAudioEngine()` — real synthesized WebAudio engine, driven by
 *    `sound:cue` bus events and a dirty-checked `soundOn` mirror.
 */

import { SIM_DT, TRACK_LENGTH } from '../contracts/constants.ts';
import { TypedEventBus } from '../contracts/events.ts';
import type { CameraCueId } from '../contracts/camera.ts';
import type { GameStateId } from '../contracts/states.ts';
import type { MutableGameStore } from '../contracts/store.ts';
import type { AudioEngine, GameLogic, UiLayer } from '../contracts/subsystems.ts';
import { DATA_TESTID } from '../contracts/testing.ts';

import { EiffelAudioEngine } from '../audio/EiffelAudioEngine.ts';
import { EiffelGameLogic } from '../game/logic.ts';
import { EiffelSceneWorld } from '../scene/EiffelSceneWorld.ts';
import { EiffelUiLayer } from '../ui/EiffelUiLayer.ts';
import type { UiAction } from '../ui/types.ts';

import { FixedStepLoop } from './loop.ts';
import { createStore } from './store.ts';
import { createTestApi, type EiffelTestApiWithSoundLog } from './testApi.ts';
import { SoundCueLog } from './testApiSoundLog.ts';
import { isWebGL2Supported, renderFallbackCard } from './webgl.ts';

/** Longest wall-clock frame delta fed to the sim accumulator, seconds (stall guard). */
const MAX_FRAME_DELTA_S = 0.25;

/**
 * Longest `__eiffel.settled()` will wait for camera/leveling tweens to look
 * idle before giving up, ms. Generous: `arrivalReveal`'s multi-stage camera
 * cue alone walks its keyframes over ~8s (CAMERA_CONTRACT), plus the chase
 * time-constant needs a little more to actually converge on the last one.
 */
const SETTLE_TIMEOUT_MS = 15_000;
/** Consecutive "looks idle" polls required before `settled()` resolves. */
const SETTLE_STABLE_FRAMES = 3;
/** `cabinWorldTiltDeg` change between polls small enough to call "not visibly moving", degrees. */
const SETTLE_TILT_EPSILON_DEG = 0.01;

/** Duck-type `scrubToT` on `GameLogic`: frozen per contracts/subsystems.ts,
 * `EiffelGameLogic` adds it as an extra, non-frozen QA method (see that
 * class's doc and ARCHITECTURE_CONTRACT "Wiring conventions"). */
function hasScrubToT(logic: GameLogic): logic is GameLogic & { scrubToT: (t: number) => void } {
  return typeof (logic as { scrubToT?: unknown }).scrubToT === 'function';
}

export interface AppOptions {
  /** Element the whole game mounts into (typically `#app`). */
  readonly root: HTMLElement;
  /** Deterministic-mode PRNG seed. */
  readonly seed: number;
  /** `?det=1`: disables RAF-driven stepping; only `__eiffel.step(n)` advances. */
  readonly deterministic: boolean;
}

export class App {
  readonly testApi: EiffelTestApiWithSoundLog;

  private readonly bus = new TypedEventBus();
  private readonly store: MutableGameStore;
  private readonly gameLogic: GameLogic;
  private readonly uiLayer: UiLayer;
  private readonly audioEngine: AudioEngine;
  private readonly loop: FixedStepLoop;
  private readonly deterministic: boolean;
  private readonly root: HTMLElement;
  private readonly capturedErrors: string[] = [];

  private sceneWorld: EiffelSceneWorld | null = null;
  private sceneReady = false;
  private resolveSceneReady!: () => void;
  private readonly sceneReadyPromise: Promise<void>;
  private currentCameraCue: CameraCueId = 'establish';
  private rafId: number | null = null;
  private lastFrameTimeMs: number | null = null;
  private started = false;
  /** State pause was entered from, so `onAction('resume')` can restore it exactly
   * (state-machine doc: "the UI's natural resume wiring: gotoState(rememberedState)"). */
  private pausedFromState: GameStateId | null = null;
  /** Dirty-check cache so `audioEngine.setEnabled` is only called on actual change. */
  private lastSoundOnForAudio: boolean | null = null;
  /** QA-only: recent `sound:cue` history, exposed as `__eiffel.soundCueLog` (see `testApiSoundLog.ts`). */
  private readonly soundCueLog = new SoundCueLog();

  constructor(options: AppOptions) {
    this.root = options.root;
    this.deterministic = options.deterministic;
    this.installErrorCapture();

    this.sceneReadyPromise = new Promise<void>((resolve) => {
      this.resolveSceneReady = resolve;
    });

    this.store = createStore(options.seed);
    // PRODUCT_SPEC "Modes & settings": prefers-reduced-motion honored, live.
    // Applied before GameLogic construction so its first published snapshot
    // already carries the right value.
    this.watchReducedMotion();

    this.gameLogic = new EiffelGameLogic(this.store, this.bus, options.seed);
    this.uiLayer = new EiffelUiLayer({
      onIntent: (intent) => {
        this.gameLogic.applyInput(intent);
      },
      onAction: (action) => {
        this.handleUiAction(action);
      },
      bus: this.bus,
    });
    this.audioEngine = new EiffelAudioEngine();

    this.loop = new FixedStepLoop({
      dt: SIM_DT,
      step: (dt) => {
        if (!this.store.get().paused) {
          this.gameLogic.step(dt);
        }
      },
      render: (alpha) => {
        this.renderFrame(alpha);
      },
    });

    this.bus.on('camera:cue', ({ cue }) => {
      this.currentCameraCue = cue;
      this.sceneWorld?.setCameraCue(cue);
    });
    // ARCHITECTURE_CONTRACT "Wiring conventions": sound:cue -> audioEngine.handleCue.
    this.bus.on('sound:cue', ({ cue }) => {
      this.audioEngine.handleCue(cue);
      this.soundCueLog.push(cue);
    });
    // Remember which state PAUSE was entered from (see `pausedFromState` doc above).
    this.bus.on('state:changed', ({ state, previous }) => {
      if (state === 'pause') this.pausedFromState = previous;
    });

    const stage = document.createElement('div');
    stage.dataset.testid = DATA_TESTID.stageRoot;
    stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    this.root.appendChild(stage);

    if (isWebGL2Supported()) {
      const sceneWorld = new EiffelSceneWorld();
      sceneWorld.setOnFirstFrame(() => {
        this.markSceneReady();
      });
      sceneWorld.init(stage);
      this.sceneWorld = sceneWorld;
    } else {
      renderFallbackCard(stage);
    }

    this.uiLayer.mount(this.root);

    window.addEventListener('resize', () => {
      this.handleResize();
    });
    window.addEventListener('orientationchange', () => {
      this.handleResize();
    });
    document.addEventListener('visibilitychange', () => {
      this.handleVisibilityChange();
    });
    // ARCHITECTURE_CONTRACT "Error policy": audio unlocks on first user gesture.
    window.addEventListener(
      'pointerdown',
      () => {
        void this.audioEngine.unlock();
      },
      { once: true },
    );

    this.handleResize();
    // Force one render pass immediately so `sceneReady` flips promptly in
    // every mode, including deterministic mode where RAF never starts. For
    // the WebGL2 path this ALSO synchronously fires `markSceneReady()` (via
    // `onFirstFrame`, at the tail end of the scene's first
    // `updateFromSnapshot`), which calls `gotoState('attract')` — but that
    // mutation lands too late for THIS pass's `renderFrame` (which already
    // captured its own pre-mutation snapshot before calling into the scene).
    this.loop.stepExact(0);
    if (!this.sceneWorld) {
      this.markSceneReady();
    }
    // INTEGRATOR FIX (Wave 4): a second, ordinary (non-reentrant) pass so
    // the just-applied `attract` state is actually reflected in the
    // rendered scene AND `EiffelUiLayer`'s DOM visibility classes
    // (`.eiffel-visible` / `pointer-events`) before anything (a real
    // pointer, or an e2e test) tries to interact with it. Without this,
    // deterministic mode (RAF-driven stepping off — the only thing that
    // would otherwise trigger a next render) left the UI showing/hit-testing
    // as `boot` (everything hidden) even though `__eiffel.state` already
    // correctly read `attract`, since `EiffelUiLayer.updateFromSnapshot`
    // only runs from inside a render pass.
    this.loop.stepExact(0);

    this.testApi = createTestApi({
      store: this.store,
      seed: options.seed,
      getSceneReady: () => this.sceneReady,
      sceneReadyPromise: this.sceneReadyPromise,
      getErrors: () => this.capturedErrors,
      getCameraCue: () => this.currentCameraCue,
      getDrawCalls: () => this.sceneWorld?.getDrawCalls() ?? 0,
      getCameraSettled: () => this.sceneWorld?.isCameraSettled() ?? true,
      gotoState: (id) => {
        this.gotoStateAndSync(id);
      },
      setT: (t) => {
        this.setT(t);
      },
      stepExact: (n) => {
        this.loop.stepExact(n);
      },
      settled: () => this.awaitSettled(),
      getSoundCueLog: () => this.soundCueLog.snapshot(),
      getCameraCueProgress: () => this.sceneWorld?.getCameraCueProgress() ?? 0,
    });
  }

  /** Start the RAF-driven wall-clock loop. No-op in deterministic mode. */
  start(): void {
    if (this.started || this.deterministic) return;
    this.started = true;
    this.scheduleFrame();
  }

  private markSceneReady(): void {
    if (this.sceneReady) return;
    this.sceneReady = true;
    this.resolveSceneReady();
    // EiffelGameLogic's real state machine emits the `establish` camera:cue
    // itself on entering `attract` (contracts/states.ts ENTRY_CAMERA_CUE) —
    // no separate manual `bus.emit('camera:cue', ...)` needed here, unlike
    // the Wave-2 stub game logic this replaced.
    this.gameLogic.gotoState('attract');
  }

  /** `gameLogic.gotoState` plus the same forced render-pass sync `handleUiAction`
   * needs (see its doc) — used by the `__eiffel.gotoState` test-API entry point,
   * which (like a real UI action) is called from OUTSIDE any render pass. */
  private gotoStateAndSync(id: GameStateId): void {
    this.gameLogic.gotoState(id);
    this.loop.stepExact(0);
  }

  /** `__eiffel.setT`: routes through `EiffelGameLogic.scrubToT` when available
   * (duck-typed — ARCHITECTURE_CONTRACT "Wiring conventions") so every
   * readout derives from one fully-consistent settled state; falls back to
   * a raw store patch only if the wired `GameLogic` doesn't expose it. Also
   * forces a render-pass sync — see `handleUiAction`'s doc for why. */
  private setT(t: number): void {
    const clamped = Math.min(1, Math.max(0, t));
    if (hasScrubToT(this.gameLogic)) {
      this.gameLogic.scrubToT(clamped);
    } else {
      this.store.set({ t: clamped, arcLength: clamped * TRACK_LENGTH });
    }
    this.loop.stepExact(0);
  }

  /** Maps `EiffelUiLayer`'s non-gesture `UiAction`s onto `GameLogic`/`GameStore`
   * calls, per ARCHITECTURE_CONTRACT "Wiring conventions". */
  private handleUiAction(action: UiAction): void {
    switch (action) {
      case 'start':
        this.gameLogic.gotoState('machineRoom');
        break;
      case 'pause':
        this.gameLogic.gotoState('pause');
        break;
      case 'resume':
        this.gameLogic.gotoState(this.pausedFromState ?? 'attract');
        break;
      case 'toggleSound':
        // Persistence is `EiffelUiLayer`'s job (it saves on every dirty
        // `snapshot.soundOn` it sees via `updateFromSnapshot`); the
        // integrator only owns flipping the single source of truth.
        this.store.set({ soundOn: !this.store.get().soundOn });
        break;
      case 'replayAgain':
        this.gameLogic.gotoState('ascendLower');
        break;
      case 'replayDescend':
        this.gameLogic.gotoState('descend');
        break;
      case 'replayMachine':
        this.gameLogic.gotoState('machineRoom');
        break;
      case 'replayTransition':
        this.gameLogic.gotoState('transition');
        break;
    }
    // INTEGRATOR FIX (Wave 4): force one render pass so the DOM control
    // visibility (`EiffelUiLayer.updateFromSnapshot`'s `.eiffel-visible` /
    // `pointer-events` classes) and the rendered scene reflect this action
    // immediately, in EVERY mode. Without this, a real tap correctly
    // mutates the store but the DOM doesn't visibly/hit-testably catch up
    // until the next render pass — in normal wall-clock mode that's the
    // next RAF tick (imperceptible), but deterministic mode (e2e/QA) has NO
    // "next RAF tick" at all: nothing renders again until an explicit
    // `step(n)`, so a freshly-shown control could report as un-clickable
    // (not `pointer-events: auto` yet) for however long the caller waits.
    this.loop.stepExact(0);
  }

  /** ARCHITECTURE_CONTRACT `prefers-reduced-motion`: mirrored into the store,
   * live-updating for the lifetime of the page (no reload needed). */
  private watchReducedMotion(): void {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.store.set({ reducedMotion: mq.matches });
    const handler = (event: MediaQueryListEvent): void => {
      this.store.set({ reducedMotion: event.matches });
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return;
    }
    // Legacy Safari (<14) fallback; PRODUCT_SPEC targets iPhone/iPad but
    // costs nothing to guard.
    const legacy = mq as unknown as {
      addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener?.(handler);
  }

  /** `__eiffel.settled()`: resolves once the camera has stopped tweening and
   * the cabin's world tilt has stopped visibly changing, for
   * `SETTLE_STABLE_FRAMES` consecutive polls (or `SETTLE_TIMEOUT_MS` elapses,
   * best-effort, so a QA harness never hangs forever on a stuck tween). */
  private awaitSettled(): Promise<void> {
    return new Promise((resolve) => {
      const deadline = performance.now() + SETTLE_TIMEOUT_MS;
      let stableFrames = 0;
      let lastTiltDeg = this.store.get().cabinWorldTiltDeg;

      const poll = (): void => {
        if (this.deterministic) {
          // RAF-driven stepping is off in deterministic mode, so nothing
          // else calls `renderFrame` between explicit `step(n)` calls — but
          // camera/interior tweens run on wall-clock render dt, not the
          // fixed sim step (CAMERA_CONTRACT / core/clock.ts), so pump a
          // render-only pass (zero sim steps) each poll to let them
          // converge over real elapsed time.
          this.loop.stepExact(0);
        }
        const cameraSettled = this.sceneWorld?.isCameraSettled() ?? true;
        const tiltDeg = this.store.get().cabinWorldTiltDeg;
        const tiltStable = Math.abs(tiltDeg - lastTiltDeg) < SETTLE_TILT_EPSILON_DEG;
        lastTiltDeg = tiltDeg;
        stableFrames = cameraSettled && tiltStable ? stableFrames + 1 : 0;

        if (stableFrames >= SETTLE_STABLE_FRAMES || performance.now() >= deadline) {
          resolve();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  private renderFrame(alpha: number): void {
    const snapshot = this.store.get();
    if (snapshot.soundOn !== this.lastSoundOnForAudio) {
      this.lastSoundOnForAudio = snapshot.soundOn;
      this.audioEngine.setEnabled(snapshot.soundOn);
    }
    this.sceneWorld?.updateFromSnapshot(snapshot, alpha);
    this.uiLayer.updateFromSnapshot(snapshot);
  }

  private scheduleFrame(): void {
    this.rafId = requestAnimationFrame(this.onAnimationFrame);
  }

  private readonly onAnimationFrame = (time: number): void => {
    this.rafId = null;
    if (document.hidden) {
      this.lastFrameTimeMs = null;
      return; // visibilitychange restarts us when the page is visible again
    }
    this.lastFrameTimeMs ??= time;
    const deltaSeconds = Math.min((time - this.lastFrameTimeMs) / 1000, MAX_FRAME_DELTA_S);
    this.lastFrameTimeMs = time;
    this.loop.advance(deltaSeconds);
    this.scheduleFrame();
  };

  private handleVisibilityChange(): void {
    if (!document.hidden && this.started && this.rafId === null && !this.deterministic) {
      this.lastFrameTimeMs = null;
      this.scheduleFrame();
    }
  }

  private handleResize(): void {
    const rect = this.root.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    this.sceneWorld?.resize(width, height);
  }

  private installErrorCapture(): void {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]): void => {
      this.capturedErrors.push(formatConsoleArgs(args));
      originalError(...args);
    };
    window.addEventListener('error', (event: ErrorEvent) => {
      this.capturedErrors.push(event.message);
    });
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      this.capturedErrors.push(String(event.reason));
    });
  }
}

function formatConsoleArgs(args: readonly unknown[]): string {
  return args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
}

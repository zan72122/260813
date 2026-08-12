/**
 * The integrator: constructs and wires every subsystem, owns the boot
 * sequence and the fixed-step loop, and assembles `window.__eiffel`. This
 * is the ONLY module allowed to import subsystem implementations directly
 * (ARCHITECTURE_CONTRACT "Dependency rule").
 */

import { SIM_DT, TRACK_LENGTH } from '../contracts/constants.ts';
import { TypedEventBus } from '../contracts/events.ts';
import type { CameraCueId } from '../contracts/camera.ts';
import type { MutableGameStore } from '../contracts/store.ts';
import type { AudioEngine, GameLogic, UiLayer } from '../contracts/subsystems.ts';
import type { EiffelTestAPI } from '../contracts/testing.ts';
import { DATA_TESTID } from '../contracts/testing.ts';

import { FixedStepLoop } from './loop.ts';
import { createStore } from './store.ts';
import { StubAudioEngine, StubGameLogic, StubSceneWorld, StubUiLayer } from './stubs.ts';
import { createTestApi } from './testApi.ts';
import { isWebGL2Supported, renderFallbackCard } from './webgl.ts';

/** Longest wall-clock frame delta fed to the sim accumulator, seconds (stall guard). */
const MAX_FRAME_DELTA_S = 0.25;

export interface AppOptions {
  /** Element the whole game mounts into (typically `#app`). */
  readonly root: HTMLElement;
  /** Deterministic-mode PRNG seed. */
  readonly seed: number;
  /** `?det=1`: disables RAF-driven stepping; only `__eiffel.step(n)` advances. */
  readonly deterministic: boolean;
}

export class App {
  readonly testApi: EiffelTestAPI;

  private readonly bus = new TypedEventBus();
  private readonly store: MutableGameStore;
  private readonly gameLogic: GameLogic;
  private readonly uiLayer: UiLayer;
  private readonly audioEngine: AudioEngine;
  private readonly loop: FixedStepLoop;
  private readonly deterministic: boolean;
  private readonly root: HTMLElement;
  private readonly capturedErrors: string[] = [];

  private sceneWorld: StubSceneWorld | null = null;
  private sceneReady = false;
  private resolveSceneReady!: () => void;
  private readonly sceneReadyPromise: Promise<void>;
  private currentCameraCue: CameraCueId = 'establish';
  private rafId: number | null = null;
  private lastFrameTimeMs: number | null = null;
  private started = false;

  constructor(options: AppOptions) {
    this.root = options.root;
    this.deterministic = options.deterministic;
    this.installErrorCapture();

    this.sceneReadyPromise = new Promise<void>((resolve) => {
      this.resolveSceneReady = resolve;
    });

    this.store = createStore(options.seed);
    this.gameLogic = new StubGameLogic(this.store, this.bus);
    this.uiLayer = new StubUiLayer();
    this.audioEngine = new StubAudioEngine();

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

    const stage = document.createElement('div');
    stage.dataset.testid = DATA_TESTID.stageRoot;
    stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    this.root.appendChild(stage);

    if (isWebGL2Supported()) {
      const sceneWorld = new StubSceneWorld();
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
    // every mode, including deterministic mode where RAF never starts.
    this.loop.stepExact(0);
    if (!this.sceneWorld) {
      this.markSceneReady();
    }

    this.testApi = createTestApi({
      store: this.store,
      seed: options.seed,
      getSceneReady: () => this.sceneReady,
      sceneReadyPromise: this.sceneReadyPromise,
      getErrors: () => this.capturedErrors,
      getCameraCue: () => this.currentCameraCue,
      getDrawCalls: () => this.sceneWorld?.getDrawCalls() ?? 0,
      gotoState: (id) => {
        this.gameLogic.gotoState(id);
      },
      setT: (t) => {
        this.setT(t);
      },
      stepExact: (n) => {
        this.loop.stepExact(n);
      },
      settled: () => Promise.resolve(),
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
    this.gameLogic.gotoState('attract');
    this.bus.emit('camera:cue', { cue: 'establish' });
  }

  private setT(t: number): void {
    const clamped = Math.min(1, Math.max(0, t));
    this.store.set({ t: clamped, arcLength: clamped * TRACK_LENGTH });
  }

  private renderFrame(alpha: number): void {
    const snapshot = this.store.get();
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

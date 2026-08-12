/**
 * `EiffelUiLayer` — the UX owner's implementation of the frozen `UiLayer`
 * interface (src/contracts/subsystems.ts). DOM/scene-integrated controls
 * only: no abstract dashboard UI, no text, pictograms drawn as physical
 * machine parts (PRODUCT_SPEC "Core verbs", VISUAL_ACCEPTANCE forbidden
 * list). Constructed by the Wave-4 integrator per ARCHITECTURE_CONTRACT
 * "Wiring conventions": `new EiffelUiLayer({ onIntent, onAction, bus })`.
 */

import '../styles/base.css';

import { rotationDeltaRadians } from '../input/gestures.ts';
import type { GameStateId } from '../contracts/states.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import type { UiLayer } from '../contracts/subsystems.ts';

import { createGhostHand, type GhostHandDemo, type GhostHandHandle } from './controls/ghostHand.ts';
import { createLevelWheel, type LevelWheelHandle } from './controls/levelWheel.ts';
import { createMasterLever, type MasterLeverHandle } from './controls/masterLever.ts';
import { createReplayMenu, type ReplayMenuHandle } from './controls/replayMenu.ts';
import { createTapStart } from './controls/tapStart.ts';
import { createThrottle, type ThrottleHandle } from './controls/throttle.ts';
import { createTopBar, type TopBarHandle } from './controls/topBar.ts';
import { createGuardedTrigger } from './guardedTap.ts';
import { LeverDragController } from './leverController.ts';
import { loadSoundPreference, saveSoundPreference } from './soundPreference.ts';
import type { EiffelUiLayerOptions, UiAction } from './types.ts';
import { controlsForState, type ControlVisibility } from './visibility.ts';

/** DOM-drag throw distance for the master lever, CSS px. A UI layout
 * choice, not a MATH_CONTRACT motion quantity. */
const LEVER_DRAG_PIXEL_RANGE = 220;
/** PRODUCT_SPEC "Feedback rules": ≤5s idle on a verb screen -> gesture demo. */
const IDLE_GHOST_HAND_DELAY_MS = 5000;
/** PRODUCT_SPEC "Button mashing / double taps never double-trigger". */
const TAP_GUARD_MIN_INTERVAL_MS = 350;

function demoForState(state: GameStateId): GhostHandDemo | null {
  switch (state) {
    case 'machineRoom':
      return 'lever';
    case 'ascendLower':
    case 'ascendUpper':
      return 'throttle';
    case 'transition':
      return 'wheel';
    default:
      return null;
  }
}

export class EiffelUiLayer implements UiLayer {
  private readonly options: EiffelUiLayerOptions;
  private layer: HTMLElement | null = null;

  private readonly topBar: TopBarHandle;
  private readonly tapStart = createTapStart();
  private readonly masterLever: MasterLeverHandle;
  private readonly throttleUp: ThrottleHandle;
  private readonly throttleDown: ThrottleHandle;
  private readonly levelWheel: LevelWheelHandle;
  private readonly replayMenu: ReplayMenuHandle;
  private readonly ghostHand: GhostHandHandle;

  private readonly leverDrag = new LeverDragController(LEVER_DRAG_PIXEL_RANGE, 0);
  private leverPointerId: number | null = null;
  private wheelPointerId: number | null = null;
  private wheelPivot = { x: 0, y: 0 };
  private wheelLastPoint = { x: 0, y: 0 };

  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  // Dirty-check cache — updateFromSnapshot must be cheap.
  private lastState: GameStateId | null = null;
  private lastValveOpen: number | null = null;
  private lastTiltDeg: number | null = null;
  private lastSoundOn: boolean | null = null;
  private lastPaused: boolean | null = null;
  private lastReducedMotion: boolean | null = null;

  private readonly disposers: (() => void)[] = [];

  constructor(options: EiffelUiLayerOptions) {
    this.options = options;
    this.topBar = createTopBar();
    this.masterLever = createMasterLever();
    this.throttleUp = createThrottle(1);
    this.throttleDown = createThrottle(-1);
    this.levelWheel = createLevelWheel();
    this.replayMenu = createReplayMenu();
    this.ghostHand = createGhostHand();
  }

  mount(root: HTMLElement): void {
    const layer = document.createElement('div');
    layer.className = 'eiffel-ui-layer';

    const bottomBand = document.createElement('div');
    bottomBand.className = 'eiffel-bottom-band';
    bottomBand.append(
      this.masterLever.root,
      this.throttleUp.root,
      this.throttleDown.root,
      this.levelWheel.root,
    );

    layer.append(
      this.tapStart.root,
      this.topBar.root,
      bottomBand,
      this.replayMenu.root,
      this.ghostHand.root,
    );
    root.appendChild(layer);
    this.layer = layer;

    this.wireTapStart();
    this.wireTopBar();
    this.wireLever();
    this.wireThrottle(this.throttleUp, 1);
    this.wireThrottle(this.throttleDown, -1);
    this.wireLevelWheel();
    this.wireReplayMenu();
    this.wireIdleReset(layer);

    this.syncSoundPreferenceOnMount();
  }

  updateFromSnapshot(snapshot: GameSnapshot): void {
    if (!this.layer) return;

    const stateChanged = snapshot.state !== this.lastState;
    if (stateChanged) {
      const previousState = this.lastState;
      this.lastState = snapshot.state;
      this.applyVisibility(controlsForState(snapshot.state));
      if (previousState === 'machineRoom' && snapshot.state !== 'machineRoom') {
        this.leverDrag.end();
        this.leverDrag.setValue(0);
        this.masterLever.setKnobValue(0, true);
        this.lastValveOpen = 0;
      }
      this.topBar.setPaused(snapshot.state === 'pause');
      this.lastPaused = snapshot.paused;
      this.resetIdleTimer();
    }

    if (snapshot.valveOpen !== this.lastValveOpen) {
      this.lastValveOpen = snapshot.valveOpen;
      if (snapshot.state === 'machineRoom' && !this.leverDrag.isDragging) {
        this.leverDrag.setValue(snapshot.valveOpen);
        this.masterLever.setKnobValue(this.leverDrag.getValue(), false);
      }
    }

    if (snapshot.cabinWorldTiltDeg !== this.lastTiltDeg) {
      this.lastTiltDeg = snapshot.cabinWorldTiltDeg;
      this.levelWheel.setBubbleTiltDeg(snapshot.cabinWorldTiltDeg);
    }

    if (snapshot.soundOn !== this.lastSoundOn) {
      this.lastSoundOn = snapshot.soundOn;
      this.topBar.setSoundEnabled(snapshot.soundOn);
      saveSoundPreference(window.localStorage, snapshot.soundOn);
    }

    if (!stateChanged && snapshot.paused !== this.lastPaused) {
      this.lastPaused = snapshot.paused;
      this.topBar.setPaused(snapshot.state === 'pause');
    }

    if (snapshot.reducedMotion !== this.lastReducedMotion) {
      this.lastReducedMotion = snapshot.reducedMotion;
      this.layer.classList.toggle('eiffel-reduced-motion', snapshot.reducedMotion);
      if (snapshot.reducedMotion) {
        this.clearIdleTimer();
        this.ghostHand.hide();
      } else {
        this.resetIdleTimer();
      }
    }
  }

  dispose(): void {
    this.clearIdleTimer();
    for (const off of this.disposers) off();
    this.disposers.length = 0;
    this.layer?.remove();
    this.layer = null;
  }

  // ---------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------

  private applyVisibility(vis: ControlVisibility): void {
    this.masterLever.root.classList.toggle('eiffel-visible', vis.masterLever);
    this.throttleUp.root.classList.toggle('eiffel-visible', vis.throttleUp);
    this.throttleDown.root.classList.toggle('eiffel-visible', vis.throttleDown);
    this.levelWheel.root.classList.toggle('eiffel-visible', vis.levelWheel);
    this.tapStart.root.classList.toggle('eiffel-visible', vis.tapStart);
    this.replayMenu.root.classList.toggle('eiffel-visible', vis.replayMenu);
    this.topBar.pauseButton.classList.toggle('eiffel-visible', vis.pauseButton);
    this.topBar.soundButton.classList.toggle('eiffel-visible', vis.soundToggle);
  }

  private emitTap(): void {
    this.options.bus.emit('sound:cue', { cue: 'uiTap' });
  }

  private dispatchAction(action: UiAction): void {
    this.emitTap();
    this.options.onAction(action);
  }

  private wireTapStart(): void {
    const trigger = createGuardedTrigger(() => this.dispatchAction('start'), {
      minIntervalMs: TAP_GUARD_MIN_INTERVAL_MS,
    });
    const handler = (): void => trigger();
    this.tapStart.root.addEventListener('pointerdown', handler);
    this.disposers.push(() => this.tapStart.root.removeEventListener('pointerdown', handler));
  }

  private wireTopBar(): void {
    const pauseTrigger = createGuardedTrigger(
      () => this.dispatchAction(this.lastState === 'pause' ? 'resume' : 'pause'),
      { minIntervalMs: TAP_GUARD_MIN_INTERVAL_MS },
    );
    const pauseHandler = (): void => pauseTrigger();
    this.topBar.pauseButton.addEventListener('pointerdown', pauseHandler);
    this.disposers.push(() =>
      this.topBar.pauseButton.removeEventListener('pointerdown', pauseHandler),
    );

    const soundTrigger = createGuardedTrigger(
      () => this.dispatchAction('toggleSound'),
      { minIntervalMs: TAP_GUARD_MIN_INTERVAL_MS },
    );
    const soundHandler = (): void => soundTrigger();
    this.topBar.soundButton.addEventListener('pointerdown', soundHandler);
    this.disposers.push(() =>
      this.topBar.soundButton.removeEventListener('pointerdown', soundHandler),
    );
  }

  private wireLever(): void {
    const track = this.masterLever.root;
    const onDown = (event: PointerEvent): void => {
      if (this.leverPointerId !== null) return;
      this.leverPointerId = event.pointerId;
      track.setPointerCapture(event.pointerId);
      this.leverDrag.begin(event.clientY);
      this.emitTap();
      this.resetIdleTimer();
    };
    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== this.leverPointerId) return;
      const value = this.leverDrag.move(event.clientY);
      this.masterLever.setKnobValue(value, false);
      this.lastValveOpen = value;
      this.options.onIntent({ kind: 'lever', value });
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== this.leverPointerId) return;
      this.leverPointerId = null;
      this.leverDrag.end();
    };
    track.addEventListener('pointerdown', onDown);
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
    this.disposers.push(() => {
      track.removeEventListener('pointerdown', onDown);
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      track.removeEventListener('pointercancel', onUp);
    });
  }

  private wireThrottle(handle: ThrottleHandle, direction: 1 | -1): void {
    let pointerId: number | null = null;
    const release = (): void => {
      if (pointerId === null) return;
      pointerId = null;
      handle.setPressed(false);
      this.options.onIntent({ kind: 'throttle', value: 0 });
    };
    const onDown = (event: PointerEvent): void => {
      if (pointerId !== null) return;
      pointerId = event.pointerId;
      handle.root.setPointerCapture(event.pointerId);
      handle.setPressed(true);
      this.emitTap();
      this.resetIdleTimer();
      this.options.onIntent({ kind: 'throttle', value: direction });
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      release();
    };
    const onLeave = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) release();
    };
    handle.root.addEventListener('pointerdown', onDown);
    handle.root.addEventListener('pointerup', onUp);
    handle.root.addEventListener('pointercancel', onUp);
    handle.root.addEventListener('pointerleave', onLeave);
    this.disposers.push(() => {
      handle.root.removeEventListener('pointerdown', onDown);
      handle.root.removeEventListener('pointerup', onUp);
      handle.root.removeEventListener('pointercancel', onUp);
      handle.root.removeEventListener('pointerleave', onLeave);
    });
  }

  private wireLevelWheel(): void {
    const wheel = this.levelWheel.root;
    const onDown = (event: PointerEvent): void => {
      if (this.wheelPointerId !== null) return;
      this.wheelPointerId = event.pointerId;
      wheel.setPointerCapture(event.pointerId);
      const rect = wheel.getBoundingClientRect();
      this.wheelPivot = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.wheelLastPoint = { x: event.clientX, y: event.clientY };
      this.emitTap();
      this.resetIdleTimer();
    };
    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== this.wheelPointerId) return;
      const delta = rotationDeltaRadians(
        this.wheelPivot.x,
        this.wheelPivot.y,
        this.wheelLastPoint.x,
        this.wheelLastPoint.y,
        event.clientX,
        event.clientY,
      );
      this.wheelLastPoint = { x: event.clientX, y: event.clientY };
      this.levelWheel.spinBy(delta);
      this.options.onIntent({ kind: 'wheel', deltaRadians: delta });
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== this.wheelPointerId) return;
      this.wheelPointerId = null;
    };
    wheel.addEventListener('pointerdown', onDown);
    wheel.addEventListener('pointermove', onMove);
    wheel.addEventListener('pointerup', onUp);
    wheel.addEventListener('pointercancel', onUp);
    this.disposers.push(() => {
      wheel.removeEventListener('pointerdown', onDown);
      wheel.removeEventListener('pointermove', onMove);
      wheel.removeEventListener('pointerup', onUp);
      wheel.removeEventListener('pointercancel', onUp);
    });
  }

  private wireReplayMenu(): void {
    for (const [action, tile] of this.replayMenu.tiles) {
      const trigger = createGuardedTrigger(() => this.dispatchAction(action), {
        minIntervalMs: TAP_GUARD_MIN_INTERVAL_MS,
      });
      const handler = (): void => trigger();
      tile.addEventListener('pointerdown', handler);
      this.disposers.push(() => tile.removeEventListener('pointerdown', handler));
    }
  }

  private wireIdleReset(layer: HTMLElement): void {
    const handler = (): void => this.resetIdleTimer();
    layer.addEventListener('pointerdown', handler);
    this.disposers.push(() => layer.removeEventListener('pointerdown', handler));
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.ghostHand.hide();
    if (this.lastReducedMotion) return;
    const state = this.lastState;
    if (state === null) return;
    const demo = demoForState(state);
    if (!demo) return;
    this.idleTimer = setTimeout(() => {
      this.ghostHand.show(demo);
    }, IDLE_GHOST_HAND_DELAY_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private syncSoundPreferenceOnMount(): void {
    // The store's default `soundOn` is `true` (see src/app/store.ts); flip
    // it once here if the persisted preference disagrees, since `UiLayer`
    // has no direct store-mutation access — only `onAction('toggleSound')`.
    const persisted = loadSoundPreference(window.localStorage, true);
    if (!persisted) {
      this.options.onAction('toggleSound');
    }
  }
}

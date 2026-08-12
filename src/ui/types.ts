/**
 * UX-owner-defined types for `EiffelUiLayer`'s constructor. The frozen
 * `src/contracts/subsystems.ts` `UiLayer` interface only pins `mount` /
 * `updateFromSnapshot` / `dispose`; the constructor shape below follows
 * ARCHITECTURE_CONTRACT "Wiring conventions":
 * `({ onIntent(i: InputIntent), onAction(a), bus })`.
 */

import type { EventBus } from '../contracts/events.ts';
import type { InputIntent } from '../contracts/subsystems.ts';

/**
 * Actions the UI can request that are not world-integrated gesture intents
 * (PRODUCT_SPEC "Modes & settings" + replay menu). Named exactly per
 * ARCHITECTURE_CONTRACT "Wiring conventions" so the Wave-4 integrator's
 * mapping switch is exhaustive.
 */
export type UiAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'toggleSound'
  | 'replayAgain'
  | 'replayDescend'
  | 'replayMachine'
  | 'replayTransition';

export interface EiffelUiLayerOptions {
  /** Fires a translated single-finger gesture (lever/throttle/wheel). */
  readonly onIntent: (intent: InputIntent) => void;
  /** Fires a non-gesture UI action (start/pause/resume/sound/replay tiles). */
  readonly onAction: (action: UiAction) => void;
  /** Fire-and-forget cross-subsystem cue channel — used here only to emit
   *  `sound:cue` tactile feedback (e.g. `uiTap`) on button presses; the UI
   *  never calls another subsystem's classes directly. */
  readonly bus: EventBus;
}

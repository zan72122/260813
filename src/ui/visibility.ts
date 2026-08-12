/**
 * Pure state -> control-visibility mapping. No DOM here so it is trivially
 * unit-testable; `EiffelUiLayer` is the only consumer and applies the
 * booleans as cheap `classList` toggles during its dirty-checked
 * `updateFromSnapshot`.
 */

import type { GameStateId } from '../contracts/states.ts';

export interface ControlVisibility {
  /** Master lever — machine room only (PRODUCT_SPEC verb 1). */
  readonly masterLever: boolean;
  /** Up-throttle face — ascendLower/ascendUpper. */
  readonly throttleUp: boolean;
  /** Down-throttle face — descend only. */
  readonly throttleDown: boolean;
  /** Level wheel — transition only (PRODUCT_SPEC verb 3). */
  readonly levelWheel: boolean;
  /** Whole-screen tap-to-start — attract only. */
  readonly tapStart: boolean;
  /** Four replay tiles — replayMenu only. */
  readonly replayMenu: boolean;
  /** Pause/resume corner button — anytime after boot. */
  readonly pauseButton: boolean;
  /** Sound toggle corner button — anytime after boot. */
  readonly soundToggle: boolean;
  /** Whether this state is eligible for the 5s idle ghost-hand demo. */
  readonly ghostHandEligible: boolean;
}

const ALL_HIDDEN: ControlVisibility = {
  masterLever: false,
  throttleUp: false,
  throttleDown: false,
  levelWheel: false,
  tapStart: false,
  replayMenu: false,
  pauseButton: false,
  soundToggle: false,
  ghostHandEligible: false,
};

/** States where the top-corner pause/sound buttons make sense to show. */
const CHROME_VISIBLE_STATES: ReadonlySet<GameStateId> = new Set<GameStateId>([
  'attract',
  'machineRoom',
  'cableFollow',
  'ascendLower',
  'transition',
  'ascendUpper',
  'arrival',
  'celebrate',
  'replayMenu',
  'descend',
  'pause',
]);

export function controlsForState(state: GameStateId): ControlVisibility {
  const chrome = CHROME_VISIBLE_STATES.has(state);
  switch (state) {
    case 'attract':
      return { ...ALL_HIDDEN, tapStart: true, pauseButton: chrome, soundToggle: chrome };
    case 'machineRoom':
      return {
        ...ALL_HIDDEN,
        masterLever: true,
        pauseButton: chrome,
        soundToggle: chrome,
        ghostHandEligible: true,
      };
    case 'ascendLower':
    case 'ascendUpper':
      return {
        ...ALL_HIDDEN,
        throttleUp: true,
        pauseButton: chrome,
        soundToggle: chrome,
        ghostHandEligible: true,
      };
    case 'transition':
      return {
        ...ALL_HIDDEN,
        levelWheel: true,
        pauseButton: chrome,
        soundToggle: chrome,
        ghostHandEligible: true,
      };
    case 'descend':
      return { ...ALL_HIDDEN, throttleDown: true, pauseButton: chrome, soundToggle: chrome };
    case 'replayMenu':
      return { ...ALL_HIDDEN, replayMenu: true, pauseButton: chrome, soundToggle: chrome };
    case 'cableFollow':
    case 'arrival':
    case 'celebrate':
      return { ...ALL_HIDDEN, pauseButton: chrome, soundToggle: chrome };
    case 'pause':
      return { ...ALL_HIDDEN, pauseButton: true, soundToggle: chrome };
    case 'boot':
      return ALL_HIDDEN;
  }
}

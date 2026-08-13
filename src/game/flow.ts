import { clamp } from '../core/math';

export type Phase =
  | 'title'
  | 'pickCard'
  | 'pickStamp'
  | 'press'
  | 'foil'
  | 'finish'
  | 'album';

/** The order a card gets made in. `album` sits outside it, as a side room. */
export const PHASE_ORDER: Phase[] = ['title', 'pickCard', 'pickStamp', 'press', 'foil', 'finish'];

/** How many stamps make a fully pressed card. Three keeps it short. */
export const PRESS_TARGET = 3;

/** Coverage at which the progress pips read as full. Only a suggestion. */
export const FOIL_TARGET = 0.7;

/**
 * Coverage at which "できた！" appears. Deliberately tiny: the child decides
 * when the card is finished, and stopping early is a style, not a failure.
 */
export const MIN_FOIL_TO_FINISH = 0.06;

export function nextPhase(p: Phase): Phase {
  const i = PHASE_ORDER.indexOf(p);
  if (i < 0 || i === PHASE_ORDER.length - 1) return 'pickCard';
  return PHASE_ORDER[i + 1];
}

/** Stamps placed -> how deeply the relief is embossed (0..1). */
export function embossFor(presses: number): number {
  return clamp(presses / PRESS_TARGET, 0, 1);
}

/** Raw coverage -> how full the progress pips look (0..1). */
export function foilProgress(coverage: number): number {
  return clamp(coverage / FOIL_TARGET, 0, 1);
}

export function canFinishFoil(coverage: number): boolean {
  return coverage >= MIN_FOIL_TO_FINISH;
}

/** The card is only shown in 3D during these phases. */
export function showsCard(p: Phase): boolean {
  return p === 'title' || p === 'press' || p === 'foil' || p === 'finish';
}

/** Phases where the child's finger drives the tilt rather than the tools. */
export function tiltIsInteractive(p: Phase): boolean {
  return p === 'finish' || p === 'title';
}

import { clamp } from '../core/math';

export type Phase = 'title' | 'pickCard' | 'pickPattern' | 'press' | 'foil' | 'finish';

export const PHASE_ORDER: Phase[] = [
  'title',
  'pickCard',
  'pickPattern',
  'press',
  'foil',
  'finish',
];

/** How many stamps make a fully pressed micro-pattern. Three keeps it short. */
export const PRESS_TARGET = 3;

/**
 * Foil coverage that counts as "done". Reaching it triggers an automatic
 * finishing pass over the rest of the card, so the result always looks
 * complete however scribbly the rolling was. There is no failing.
 */
export const FOIL_TARGET = 0.7;

export function nextPhase(p: Phase): Phase {
  const i = PHASE_ORDER.indexOf(p);
  if (i < 0 || i === PHASE_ORDER.length - 1) return 'pickCard';
  return PHASE_ORDER[i + 1];
}

/** Presses -> how deeply the relief is embossed (0..1). */
export function embossFor(presses: number): number {
  return clamp(presses / PRESS_TARGET, 0, 1);
}

/** Raw coverage -> progress toward the goal (0..1). */
export function foilProgress(coverage: number): number {
  return clamp(coverage / FOIL_TARGET, 0, 1);
}

export function foilDone(coverage: number): boolean {
  return coverage >= FOIL_TARGET;
}

/** The card is only shown in 3D during these phases. */
export function showsCard(p: Phase): boolean {
  return p === 'title' || p === 'press' || p === 'foil' || p === 'finish';
}

/** Phases where the child's finger drives the tilt rather than the tools. */
export function tiltIsInteractive(p: Phase): boolean {
  return p === 'finish' || p === 'title';
}

export interface Build {
  card: number;
  pattern: number;
  presses: number;
}

export function emptyBuild(): Build {
  return { card: 0, pattern: 0, presses: 0 };
}

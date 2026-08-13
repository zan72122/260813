import { TOTAL_CHAIRS, TOTAL_MATS, TOTAL_TOYS, TOTAL_TRAYS } from './types.ts';

/** Pure, serializable per-phase progress trackers. All reducers return new objects (no mutation) so tests can assert before/after state cheaply. */

export interface PlayCleanupProgress {
  storedToyIds: readonly string[];
}

export const emptyPlayCleanupProgress: PlayCleanupProgress = { storedToyIds: [] };

export function storeToy(progress: PlayCleanupProgress, toyId: string): PlayCleanupProgress {
  if (progress.storedToyIds.includes(toyId)) return progress;
  return { storedToyIds: [...progress.storedToyIds, toyId] };
}

export function isPlayCleanupComplete(progress: PlayCleanupProgress, totalToys = TOTAL_TOYS): boolean {
  return progress.storedToyIds.length >= totalToys;
}

export interface LunchSetupProgress {
  tableOut: boolean;
  chairsOut: number;
  traysPlaced: number;
  vignetteComplete: boolean;
}

export const emptyLunchSetupProgress: LunchSetupProgress = {
  tableOut: false,
  chairsOut: 0,
  traysPlaced: 0,
  vignetteComplete: false,
};

export function setTableOut(p: LunchSetupProgress): LunchSetupProgress {
  return { ...p, tableOut: true };
}

export function popChair(p: LunchSetupProgress, totalChairs = TOTAL_CHAIRS): LunchSetupProgress {
  return { ...p, chairsOut: Math.min(p.chairsOut + 1, totalChairs) };
}

export function placeTray(p: LunchSetupProgress, totalTrays = TOTAL_TRAYS): LunchSetupProgress {
  return { ...p, traysPlaced: Math.min(p.traysPlaced + 1, totalTrays) };
}

export function completeVignette(p: LunchSetupProgress): LunchSetupProgress {
  return { ...p, vignetteComplete: true };
}

/** True once the 3 discrete finger-op furniture setup is finished (drives NPC walk-in + eating vignette start). */
export function isLunchFurnitureReady(
  p: LunchSetupProgress,
  totalChairs = TOTAL_CHAIRS,
  totalTrays = TOTAL_TRAYS,
): boolean {
  return p.tableOut && p.chairsOut >= totalChairs && p.traysPlaced >= totalTrays;
}

export function isLunchSetupComplete(p: LunchSetupProgress): boolean {
  return isLunchFurnitureReady(p) && p.vignetteComplete;
}

export interface LunchCleanupProgress {
  traysReturned: number;
  wipeProgress: number; // 0..1
  tableStored: boolean;
  chairsStacked: number;
}

export const emptyLunchCleanupProgress: LunchCleanupProgress = {
  traysReturned: 0,
  wipeProgress: 0,
  tableStored: false,
  chairsStacked: 0,
};

export function returnTray(p: LunchCleanupProgress, totalTrays = TOTAL_TRAYS): LunchCleanupProgress {
  return { ...p, traysReturned: Math.min(p.traysReturned + 1, totalTrays) };
}

export function addWipeProgress(p: LunchCleanupProgress, delta: number): LunchCleanupProgress {
  const next = Math.max(0, p.wipeProgress + delta);
  // Snap values extremely close to 1 up to exactly 1 — repeated fractional deltas
  // (e.g. summing 1/15 fifteen times) can land a hair under 1 due to float
  // rounding, which would otherwise permanently block the ">= 1" completion gate.
  return { ...p, wipeProgress: next > 0.999 ? 1 : Math.min(1, next) };
}

export function storeTable(p: LunchCleanupProgress): LunchCleanupProgress {
  return { ...p, tableStored: true };
}

export function stackChair(p: LunchCleanupProgress, totalChairs = TOTAL_CHAIRS): LunchCleanupProgress {
  return { ...p, chairsStacked: Math.min(p.chairsStacked + 1, totalChairs) };
}

export function isLunchCleanupComplete(
  p: LunchCleanupProgress,
  totalTrays = TOTAL_TRAYS,
  totalChairs = TOTAL_CHAIRS,
): boolean {
  return (
    p.traysReturned >= totalTrays &&
    p.wipeProgress >= 1 &&
    p.tableStored &&
    p.chairsStacked >= totalChairs
  );
}

export interface NapSetupProgress {
  matsPlaced: number;
  matsUnrolled: number; // count of mats with unrollProgress >= 1
  unrollProgress: Readonly<Record<string, number>>; // per-mat 0..1
  beddingPlaced: number;
  curtainClosed: boolean;
  vignetteComplete: boolean;
}

export const emptyNapSetupProgress: NapSetupProgress = {
  matsPlaced: 0,
  matsUnrolled: 0,
  unrollProgress: {},
  beddingPlaced: 0,
  curtainClosed: false,
  vignetteComplete: false,
};

export function placeMat(p: NapSetupProgress, totalMats = TOTAL_MATS): NapSetupProgress {
  return { ...p, matsPlaced: Math.min(p.matsPlaced + 1, totalMats) };
}

/** Sets absolute unroll progress for a mat (driven directly by swipe distance — scrubbing). */
export function setMatUnrollProgress(p: NapSetupProgress, matId: string, progress: number): NapSetupProgress {
  // Generous "close enough" snap to fully-unrolled — matches the game's forgiving
  // intent-inference philosophy (and avoids a swipe landing at e.g. 0.997 due to
  // pixel/projection rounding permanently failing the ">= 1" completion gate).
  const raw = Math.min(1, Math.max(0, progress));
  const clamped = raw > 0.97 ? 1 : raw;
  const prevUnrolled = (p.unrollProgress[matId] ?? 0) >= 1;
  const nowUnrolled = clamped >= 1;
  const nextMap = { ...p.unrollProgress, [matId]: clamped };
  let matsUnrolled = p.matsUnrolled;
  if (!prevUnrolled && nowUnrolled) matsUnrolled += 1;
  if (prevUnrolled && !nowUnrolled) matsUnrolled -= 1;
  return { ...p, unrollProgress: nextMap, matsUnrolled };
}

export function placeBedding(p: NapSetupProgress, totalMats = TOTAL_MATS): NapSetupProgress {
  return { ...p, beddingPlaced: Math.min(p.beddingPlaced + 1, totalMats) };
}

export function closeCurtain(p: NapSetupProgress): NapSetupProgress {
  return { ...p, curtainClosed: true };
}

export function completeNapVignette(p: NapSetupProgress): NapSetupProgress {
  return { ...p, vignetteComplete: true };
}

export function isNapFurnitureReady(p: NapSetupProgress, totalMats = TOTAL_MATS): boolean {
  return (
    p.matsPlaced >= totalMats &&
    p.matsUnrolled >= totalMats &&
    p.beddingPlaced >= totalMats &&
    p.curtainClosed
  );
}

export function isNapSetupComplete(p: NapSetupProgress): boolean {
  return isNapFurnitureReady(p) && p.vignetteComplete;
}

export interface WakeRestoreProgress {
  curtainOpened: boolean;
  matsRolled: number;
  matsShelved: number;
  toysPopped: boolean;
}

export const emptyWakeRestoreProgress: WakeRestoreProgress = {
  curtainOpened: false,
  matsRolled: 0,
  matsShelved: 0,
  toysPopped: false,
};

export function openCurtain(p: WakeRestoreProgress): WakeRestoreProgress {
  return { ...p, curtainOpened: true };
}

export function rollMat(p: WakeRestoreProgress, totalMats = TOTAL_MATS): WakeRestoreProgress {
  return { ...p, matsRolled: Math.min(p.matsRolled + 1, totalMats) };
}

export function shelveMat(p: WakeRestoreProgress, totalMats = TOTAL_MATS): WakeRestoreProgress {
  return { ...p, matsShelved: Math.min(p.matsShelved + 1, totalMats) };
}

export function popToysOut(p: WakeRestoreProgress): WakeRestoreProgress {
  return { ...p, toysPopped: true };
}

export function isWakeRestoreComplete(p: WakeRestoreProgress, totalMats = TOTAL_MATS): boolean {
  return p.curtainOpened && p.matsRolled >= totalMats && p.matsShelved >= totalMats && p.toysPopped;
}

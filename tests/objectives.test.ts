import { describe, expect, it } from 'vitest';
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
  shelveMat,
  setTableOut,
  stackChair,
  storeTable,
  storeToy,
} from '../src/game/objectives.ts';

describe('PLAY_CLEANUP objective', () => {
  it('is incomplete until all toys stored, then complete; storing is idempotent per toy', () => {
    let p = emptyPlayCleanupProgress;
    expect(isPlayCleanupComplete(p, 3)).toBe(false);
    p = storeToy(p, 'toy-0');
    p = storeToy(p, 'toy-0'); // duplicate store should not double-count
    p = storeToy(p, 'toy-1');
    expect(isPlayCleanupComplete(p, 3)).toBe(false);
    p = storeToy(p, 'toy-2');
    expect(p.storedToyIds).toHaveLength(3);
    expect(isPlayCleanupComplete(p, 3)).toBe(true);
  });

  it('reducers do not mutate the previous state object', () => {
    const p0 = emptyPlayCleanupProgress;
    const p1 = storeToy(p0, 'toy-0');
    expect(p0.storedToyIds).toHaveLength(0);
    expect(p1).not.toBe(p0);
  });
});

describe('LUNCH_SETUP objective', () => {
  it('requires table + all chairs + all trays before furniture-ready, then vignette before fully complete', () => {
    let p = emptyLunchSetupProgress;
    expect(isLunchFurnitureReady(p, 2, 2)).toBe(false);
    p = setTableOut(p);
    p = popChair(p, 2);
    p = popChair(p, 2);
    p = popChair(p, 2); // clamps at total
    expect(p.chairsOut).toBe(2);
    p = placeTray(p, 2);
    expect(isLunchFurnitureReady(p, 2, 2)).toBe(false);
    p = placeTray(p, 2);
    expect(isLunchFurnitureReady(p, 2, 2)).toBe(true);

    // isLunchSetupComplete() gates on the real fixed totals (4 chairs/trays),
    // so top up to those before asserting the final completion gate.
    p = popChair(p);
    p = popChair(p);
    p = placeTray(p);
    p = placeTray(p);
    expect(isLunchSetupComplete(p)).toBe(false);
    p = completeVignette(p);
    expect(isLunchSetupComplete(p)).toBe(true);
  });
});

describe('LUNCH_CLEANUP objective', () => {
  it('requires trays returned, full wipe, table stored, and chairs stacked', () => {
    let p = emptyLunchCleanupProgress;
    p = returnTray(p, 1);
    p = addWipeProgress(p, 0.5);
    expect(isLunchCleanupComplete(p, 1, 1)).toBe(false);
    p = addWipeProgress(p, 0.6); // clamps at 1
    expect(p.wipeProgress).toBe(1);
    p = storeTable(p);
    expect(isLunchCleanupComplete(p, 1, 1)).toBe(false);
    p = stackChair(p, 1);
    expect(isLunchCleanupComplete(p, 1, 1)).toBe(true);
  });

  it('wipe progress never goes below 0 or above 1', () => {
    let p = emptyLunchCleanupProgress;
    p = addWipeProgress(p, -0.5);
    expect(p.wipeProgress).toBe(0);
    p = addWipeProgress(p, 5);
    expect(p.wipeProgress).toBe(1);
  });
});

describe('NAP_SETUP objective', () => {
  it('mat unroll progress is scrubbable and matsUnrolled tracks the 1.0 threshold both ways', () => {
    let p = emptyNapSetupProgress;
    p = setMatUnrollProgress(p, 'mat-0', 0.4);
    expect(p.matsUnrolled).toBe(0);
    p = setMatUnrollProgress(p, 'mat-0', 1);
    expect(p.matsUnrolled).toBe(1);
    // Scrubbing back down below 1 should un-count it (progress follows the finger both ways).
    p = setMatUnrollProgress(p, 'mat-0', 0.9);
    expect(p.matsUnrolled).toBe(0);
    p = setMatUnrollProgress(p, 'mat-0', 1);
    expect(p.matsUnrolled).toBe(1);
  });

  it('furniture-ready requires mats placed+unrolled+bedding+curtain; vignette required for full completion', () => {
    let p = emptyNapSetupProgress;
    p = placeMat(p, 1);
    p = setMatUnrollProgress(p, 'mat-0', 1);
    p = placeBedding(p, 1);
    expect(isNapFurnitureReady(p, 1)).toBe(false);
    p = closeCurtain(p);
    expect(isNapFurnitureReady(p, 1)).toBe(true);

    // isNapSetupComplete() gates on the real fixed total (4 mats), so top up
    // the remaining mats before asserting the final completion gate.
    p = placeMat(p);
    p = placeMat(p);
    p = placeMat(p);
    p = setMatUnrollProgress(p, 'mat-1', 1);
    p = setMatUnrollProgress(p, 'mat-2', 1);
    p = setMatUnrollProgress(p, 'mat-3', 1);
    p = placeBedding(p);
    p = placeBedding(p);
    p = placeBedding(p);
    expect(isNapSetupComplete(p)).toBe(false);
    p = completeNapVignette(p);
    expect(isNapSetupComplete(p)).toBe(true);
  });
});

describe('WAKE_RESTORE objective', () => {
  it('requires curtain open, all mats rolled+shelved, and toys popped', () => {
    let p = emptyWakeRestoreProgress;
    p = openCurtain(p);
    p = rollMat(p, 1);
    p = shelveMat(p, 1);
    expect(isWakeRestoreComplete(p, 1)).toBe(false);
    p = popToysOut(p);
    expect(isWakeRestoreComplete(p, 1)).toBe(true);
  });
});

/**
 * Maps `TestApi.drive.*` (contracts/testing.ts) onto a live GameController's
 * `applyIntent`, plus the two read-only inspectors (`alignmentError`,
 * `locked`) testing.ts also names at the top level of `TestApi`.
 *
 * Every `drive.*` method below calls `controller.applyIntent(...)` — the
 * exact same entry point real pointer gestures go through once `src/input`
 * translates them (see attachInput.ts). This is what makes
 * `window.__eiffel.drive.*` a provably non-bypassing test surface per
 * testing.ts's doc comment: Playwright driving `drive.pump()` and a real
 * finger swiping the pump handle both end up calling the identical
 * `applyIntent({type:'jackStroke'})`, so no-softlock/assist/snap behavior
 * observed under test is the same code path a real player hits.
 *
 * The Wave 4 Integrator is expected to spread this object's `drive`,
 * `alignmentError`, and `locked` fields directly into the full `TestApi`
 * implementation, alongside `ready`/`settled`/`state`/`step`/`renderInfo`
 * (owned by other areas).
 */
import type { LegId } from '../contracts/types';
import type { TestApi } from '../contracts/testing';
import type { GameController } from './controller';

export function createTestDrive(controller: GameController): Pick<TestApi, 'drive' | 'alignmentError' | 'locked'> {
  return {
    drive: {
      setGate(open: number): void {
        controller.applyIntent({ type: 'gateSet', open });
      },
      pump(): void {
        controller.applyIntent({ type: 'jackStroke' });
      },
      dragWedge(p: number): void {
        controller.applyIntent({ type: 'wedgeDrag', progress: p });
      },
      releaseWedge(): void {
        controller.applyIntent({ type: 'wedgeRelease' });
      },
      hammer(): void {
        controller.applyIntent({ type: 'hammerTap' });
      },
      advance(): void {
        controller.applyIntent({ type: 'advance' });
      },
      replay(): void {
        controller.applyIntent({ type: 'replay' });
      },
    },
    alignmentError(leg: LegId): number {
      return controller.getState().legs[leg].alignmentError;
    },
    locked(leg: LegId): boolean {
      return controller.getState().legs[leg].locked;
    },
  };
}

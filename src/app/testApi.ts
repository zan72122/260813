/**
 * Builds the frozen `window.__eiffel` object (`src/contracts/testing.ts`)
 * from App's internal wiring. Pure assembly — no subsystem logic lives
 * here, only read-only derivations of already-computed snapshot fields.
 */

import { PULLEY_RADIUS } from '../contracts/constants.ts';
import type { CameraCueId } from '../contracts/camera.ts';
import type { SoundCueId } from '../contracts/events.ts';
import type { GameStateId } from '../contracts/states.ts';
import type { GameStore } from '../contracts/store.ts';
import type { EiffelReadouts, EiffelTestAPI, Vec3Tuple } from '../contracts/testing.ts';

/** Semver of the `EiffelTestAPI` shape itself (not the app's package version). */
const TEST_API_VERSION = '1.0.0';

export interface TestApiDeps {
  readonly store: GameStore;
  readonly seed: number;
  readonly getSceneReady: () => boolean;
  readonly sceneReadyPromise: Promise<void>;
  readonly getErrors: () => readonly string[];
  readonly getCameraCue: () => CameraCueId;
  readonly getDrawCalls: () => number;
  /** Duck-typed `SceneWorld.isCameraSettled()` (non-frozen extra — ARCHITECTURE_CONTRACT
   * "Wiring conventions"); defaults to `true` when no scene world is mounted (WebGL2 fallback). */
  readonly getCameraSettled: () => boolean;
  readonly gotoState: (id: GameStateId) => void;
  readonly setT: (t: number) => void;
  readonly stepExact: (n: number) => void;
  readonly settled: () => Promise<void>;
  /** QA-only bonus, not part of the frozen shape — see `testApiSoundLog.ts`. */
  readonly getSoundCueLog: () => readonly SoundCueId[];
  /** QA-only bonus, forwards `EiffelSceneWorld.getCameraCueProgress()` (see its doc). */
  readonly getCameraCueProgress: () => number;
}

/** `EiffelTestAPI` plus the integrator's QA-only bonuses (see `testApiSoundLog.ts`
 * and `CameraDirector.cueProgress`) — no frozen contract is touched by either. */
export type EiffelTestApiWithSoundLog = EiffelTestAPI & {
  readonly soundCueLog: readonly SoundCueId[];
  readonly cameraCueProgress: number;
};

/**
 * By construction (MATH_CONTRACT §3), the cabin's world rotation about +Z
 * equals the residual leveling error `e` alone (the carrier's tilt and the
 * cabin's compensating counter-tilt cancel). `cabinWorldTiltDeg` already
 * carries that value, so the floor normal is a direct rotation of world +Y.
 */
function cabinFloorNormalFromTiltDeg(tiltDeg: number): Vec3Tuple {
  const rad = (tiltDeg * Math.PI) / 180;
  return [-Math.sin(rad), Math.cos(rad), 0];
}

export function createTestApi(deps: TestApiDeps): EiffelTestApiWithSoundLog {
  return {
    version: TEST_API_VERSION,
    get soundCueLog(): readonly SoundCueId[] {
      return deps.getSoundCueLog();
    },
    get cameraCueProgress(): number {
      return deps.getCameraCueProgress();
    },
    seed: deps.seed,
    get state(): GameStateId {
      return deps.store.get().state;
    },
    get sceneReady(): boolean {
      return deps.getSceneReady();
    },
    sceneReadyPromise: deps.sceneReadyPromise,
    get errors(): readonly string[] {
      return deps.getErrors();
    },
    settled: deps.settled,
    readouts(): EiffelReadouts {
      const snapshot = deps.store.get();
      return {
        t: snapshot.t,
        trackTangentDeg: snapshot.thetaDeg,
        carrierAngleDeg: snapshot.carrierAngleDeg,
        cabinWorldTiltDeg: snapshot.cabinWorldTiltDeg,
        cabinFloorNormal: cabinFloorNormalFromTiltDeg(snapshot.cabinWorldTiltDeg),
        pistonDisplacement: snapshot.pistonDisplacement,
        cableTravel: snapshot.cableTravel,
        pulleyAngle: snapshot.cableTravel / PULLEY_RADIUS,
        valveOpen: snapshot.valveOpen,
        speed: snapshot.speed,
        state: snapshot.state,
        drawCalls: deps.getDrawCalls(),
        quality: snapshot.quality,
        cameraCue: deps.getCameraCue(),
        cameraSettled: deps.getCameraSettled(),
        soundOn: snapshot.soundOn,
        paused: snapshot.paused,
      };
    },
    gotoState: deps.gotoState,
    setT: deps.setT,
    step: deps.stepExact,
  };
}

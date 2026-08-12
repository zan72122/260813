/**
 * Dev-only preview driver for `dev/scene.html` (never imported by the
 * production app / never shipped: `vite build` only builds `index.html`).
 * Boots `EiffelSceneWorld` standalone against a hand-authored
 * `GameSnapshot`, controllable via URL params (`?s=<arcLength>&cue=<id>
 * &tilt=<deg>&reduced=1&state=<id>`) and, for the Playwright iteration
 * script, a live `window.__eiffelDev` control surface so shots can be
 * re-posed without a full page reload.
 */

import type { CameraCueId } from '../contracts/camera.ts';
import { MECH_ADVANTAGE, PISTON_STROKE, TRACK_LENGTH } from '../contracts/constants.ts';
import { CAMERA_CUE_IDS } from '../contracts/camera.ts';
import { GAME_STATE_IDS, type GameStateId } from '../contracts/states.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import { trackTheta } from '../game/track.ts';
import { EiffelSceneWorld } from '../scene/EiffelSceneWorld.ts';

const RAD2DEG = 180 / Math.PI;

/** A reasonable `GameSnapshot.state` to imply for a given camera cue, dev-preview only. */
function stateForCue(cue: CameraCueId): GameStateId {
  switch (cue) {
    case 'underground':
      return 'machineRoom';
    case 'cableFollow':
      return 'cableFollow';
    case 'carrierSide':
    case 'firstSlope':
      return 'ascendLower';
    case 'transitionClose':
      return 'transition';
    case 'interiorProof':
      return 'transition';
    case 'arrivalReveal':
      return 'arrival';
    case 'descent':
      return 'descend';
    case 'menu':
      return 'replayMenu';
    default:
      return 'attract';
  }
}

export interface DevSnapshotOverrides {
  readonly s?: number;
  readonly cue?: CameraCueId;
  readonly tiltDeg?: number;
  readonly reducedMotion?: boolean;
  readonly state?: GameStateId;
  readonly valveOpen?: number;
}

function buildSnapshot(overrides: DevSnapshotOverrides): GameSnapshot {
  const arcLength = Math.min(TRACK_LENGTH, Math.max(0, overrides.s ?? 0));
  const thetaDeg = trackTheta(arcLength) * RAD2DEG;
  const carrierAngleDeg = thetaDeg - 90;
  const cabinTiltErrorDeg = overrides.tiltDeg ?? 0;
  const cableTravel = arcLength;
  const pistonDisplacement = Math.min(PISTON_STROKE, cableTravel / MECH_ADVANTAGE);
  const state = overrides.state ?? (overrides.cue ? stateForCue(overrides.cue) : 'attract');

  return {
    valveOpen: overrides.valveOpen ?? 0.6,
    direction: 1,
    pistonDisplacement,
    cableTravel,
    arcLength,
    t: arcLength / TRACK_LENGTH,
    thetaDeg,
    carrierAngleDeg,
    cabinTiltErrorDeg,
    cabinWorldTiltDeg: cabinTiltErrorDeg,
    speed: 0,
    state,
    seed: 1,
    quality: 'high',
    soundOn: false,
    reducedMotion: overrides.reducedMotion ?? false,
    paused: false,
  };
}

function readCueParam(params: URLSearchParams): CameraCueId {
  const raw = params.get('cue');
  const found = CAMERA_CUE_IDS.find((id) => id === raw);
  return found ?? 'establish';
}

function readStateParam(params: URLSearchParams): GameStateId | undefined {
  const raw = params.get('state');
  return GAME_STATE_IDS.find((id) => id === raw);
}

export interface DevPreviewHandle {
  readonly world: EiffelSceneWorld;
  setSnapshot(overrides: DevSnapshotOverrides): void;
  readouts(): { drawCalls: number; triangles: number; cameraSettled: boolean; state: GameStateId };
}

declare global {
  interface Window {
    __eiffelDev?: DevPreviewHandle;
  }
}

export function startDevPreview(container: HTMLElement): DevPreviewHandle {
  const params = new URLSearchParams(window.location.search);
  const cue = readCueParam(params);
  const overrides: DevSnapshotOverrides = {
    s: params.has('s') ? Number(params.get('s')) : 0,
    cue,
    tiltDeg: params.has('tilt') ? Number(params.get('tilt')) : 0,
    reducedMotion: params.get('reduced') === '1',
    state: readStateParam(params) ?? stateForCue(cue),
    valveOpen: params.has('valve') ? Number(params.get('valve')) : 0.6,
  };

  const world = new EiffelSceneWorld();
  world.init(container);
  world.setCameraCue(overrides.cue ?? 'establish');

  let current = overrides;
  let snapshot = buildSnapshot(current);

  const handle: DevPreviewHandle = {
    world,
    setSnapshot(next: DevSnapshotOverrides): void {
      // A cue change implies a new state unless the caller pins one explicitly.
      const impliedState = next.cue && !next.state ? stateForCue(next.cue) : next.state;
      current = { ...current, ...next, ...(impliedState ? { state: impliedState } : {}) };
      snapshot = buildSnapshot(current);
      if (next.cue) world.setCameraCue(next.cue);
    },
    readouts(): { drawCalls: number; triangles: number; cameraSettled: boolean; state: GameStateId } {
      return {
        drawCalls: world.getDrawCalls(),
        triangles: world.getTriangles(),
        cameraSettled: world.isCameraSettled(),
        state: snapshot.state,
      };
    },
  };
  window.__eiffelDev = handle;

  function frame(): void {
    world.updateFromSnapshot(snapshot, 1);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    world.resize(container.clientWidth, container.clientHeight);
  });

  return handle;
}

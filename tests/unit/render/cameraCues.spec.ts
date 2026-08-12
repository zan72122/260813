import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { CAMERA_CUE_IDS, CAMERA_FOV_LANDSCAPE_DEG, CAMERA_FOV_PORTRAIT_DEG } from '../../../src/contracts/camera.ts';
import type { GameSnapshot } from '../../../src/contracts/store.ts';
import { CameraDirector, type CameraContext } from '../../../src/visual/cameraDirector.ts';

function fakeContext(): CameraContext {
  return {
    carrierPosition: new THREE.Vector3(10, 20, 0),
    carrierAngleRad: -0.2,
    cabinWorldPosition: new THREE.Vector3(11, 20.5, 0),
    pulleyCenter: new THREE.Vector3(12, -4, 0),
    leverBase: new THREE.Vector3(1.6, -8.5, 4.6),
    machineRoomCenter: new THREE.Vector3(6, -4, 0),
    firstFloorPosition: new THREE.Vector3(41, 56, 0),
    secondFloorPosition: new THREE.Vector3(60, 111, 0),
    stationBottom: new THREE.Vector3(0, 0, 0),
    orientation: 'portrait',
  };
}

function fakeSnapshot(reducedMotion: boolean): GameSnapshot {
  return {
    valveOpen: 0.5,
    direction: 1,
    pistonDisplacement: 4,
    cableTravel: 32,
    arcLength: 32,
    t: 32 / 128,
    thetaDeg: 60,
    carrierAngleDeg: -30,
    cabinTiltErrorDeg: 0.1,
    cabinWorldTiltDeg: 0.1,
    speed: 1,
    state: 'ascendLower',
    seed: 1,
    quality: 'high',
    soundOn: true,
    reducedMotion,
    paused: false,
  };
}

describe('CameraDirector cue table completeness (CAMERA_CONTRACT)', () => {
  it('has exactly the 10 frozen CameraCueIds', () => {
    expect(CAMERA_CUE_IDS.length).toBe(10);
  });

  it('every cue produces a finite, non-degenerate pose after settling', () => {
    const context = fakeContext();
    for (const cue of CAMERA_CUE_IDS) {
      const director = new CameraDirector(390, 844);
      director.requestCue(cue);
      // Multi-stage cues (cableFollow, arrivalReveal) need several seconds of
      // simulated dt to walk their keyframes; step generously for all cues.
      for (let i = 0; i < 400; i += 1) {
        director.update(1 / 30, fakeSnapshot(false), context);
      }
      expect(director.cue).toBe(cue);
      expect(Number.isFinite(director.camera.position.x)).toBe(true);
      expect(Number.isFinite(director.camera.position.y)).toBe(true);
      expect(Number.isFinite(director.camera.position.z)).toBe(true);
      expect(Number.isFinite(director.camera.quaternion.x)).toBe(true);
      expect(director.camera.up.y).toBe(1);
      expect(director.camera.up.x).toBe(0);
      expect(director.camera.up.z).toBe(0);
      // The camera must never sit exactly on its own look target.
      expect(director.camera.position.length()).toBeGreaterThan(0);
    }
  });

  it('re-requesting the active multi-stage cue does not restart its progress', () => {
    const context = fakeContext();
    const director = new CameraDirector(390, 844);
    director.requestCue('cableFollow');
    // Walk partway through the authored piston -> pulley -> carrier move.
    for (let i = 0; i < 90; i += 1) {
      director.update(1 / 30, fakeSnapshot(false), context);
    }
    const midway = director.camera.position.clone();
    // A redundant re-request of the already-active cue must be a no-op.
    director.requestCue('cableFollow');
    director.update(1 / 30, fakeSnapshot(false), context);
    const afterRedundantRequest = director.camera.position.clone();
    // If progress had been reset to 0, this step would jump back toward the
    // piston-head keyframe instead of continuing to advance toward the carrier.
    expect(afterRedundantRequest.distanceTo(midway)).toBeLessThan(2);
  });

  it('settles (isSettled() true) for a static single-pose cue given enough time', () => {
    const director = new CameraDirector(390, 844);
    director.requestCue('menu');
    for (let i = 0; i < 300; i += 1) {
      director.update(1 / 30, fakeSnapshot(false), fakeContext());
    }
    expect(director.isSettled()).toBe(true);
  });

  it('reduced motion never leaves the camera in a NaN/undefined state across all cues', () => {
    const context = fakeContext();
    for (const cue of CAMERA_CUE_IDS) {
      const director = new CameraDirector(844, 390);
      director.requestCue(cue);
      for (let i = 0; i < 60; i += 1) {
        director.update(1 / 30, fakeSnapshot(true), context);
      }
      expect(Number.isFinite(director.camera.position.x)).toBe(true);
      expect(Number.isFinite(director.camera.quaternion.w)).toBe(true);
    }
  });
});

describe('CameraDirector FOV per orientation (CAMERA_CONTRACT "Global rules")', () => {
  it('portrait viewport uses the portrait FOV', () => {
    const director = new CameraDirector(390, 844);
    expect(director.camera.fov).toBeCloseTo(CAMERA_FOV_PORTRAIT_DEG, 6);
  });

  it('landscape viewport uses the landscape FOV', () => {
    const director = new CameraDirector(844, 390);
    expect(director.camera.fov).toBeCloseTo(CAMERA_FOV_LANDSCAPE_DEG, 6);
  });

  it('resize() from portrait to landscape switches the FOV', () => {
    const director = new CameraDirector(390, 844);
    expect(director.camera.fov).toBeCloseTo(CAMERA_FOV_PORTRAIT_DEG, 6);
    director.resize(844, 390);
    expect(director.camera.fov).toBeCloseTo(CAMERA_FOV_LANDSCAPE_DEG, 6);
  });

  it('update() re-asserts the FOV for the current orientation every frame', () => {
    const director = new CameraDirector(820, 1180);
    director.requestCue('carrierSide');
    director.update(1 / 60, fakeSnapshot(false), fakeContext());
    expect(director.camera.fov).toBeCloseTo(CAMERA_FOV_PORTRAIT_DEG, 6);
  });
});

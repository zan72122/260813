// src/camera/player.test.ts
// Colocated unit test: drives CinematicBeatPlayer through the whole
// storyboard via synthetic phase-changed/water-progress events and checks
// the continuity guarantees from docs/CAMERA_STORYBOARD.md: no snapping
// between beats, pipe-run tracks the water, and orientation changes blend
// rather than cut.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ALL_FOUNTAIN_IDS, createEventBus, type SceneContext, type ViewportProfile } from '../contracts';
import { getSceneAnchors } from '../scenes/anchors';
import { CinematicBeatPlayer } from './player';

function createStubContext(viewport: ViewportProfile): SceneContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, viewport.width / viewport.height, 0.1, 100);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.5, 0);
  const renderer = { info: { render: { calls: 0, triangles: 0 } } } as unknown as THREE.WebGLRenderer;
  return {
    scene,
    camera,
    renderer,
    bus: createEventBus(),
    quality: 'medium',
    viewport,
    audio: { muted: false, async unlock() {}, play() {}, setIntensity() {} },
  };
}

describe('CinematicBeatPlayer', () => {
  it('never snaps the camera position across a phase transition', () => {
    const ctx = createStubContext({ width: 390, height: 844, dpr: 2, orientation: 'portrait' });
    const player = new CinematicBeatPlayer(ctx);

    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'garden-idle', fountain: 'fountain-fan' });
    for (let i = 0; i < 30; i++) player.update(1 / 60);

    const beforePos = ctx.camera.position.clone();
    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'whistle-cue', fountain: 'fountain-fan' });
    player.update(1 / 60); // one frame after the transition
    const afterOneFrame = ctx.camera.position.clone();

    for (let i = 0; i < 300; i++) player.update(1 / 60); // let it fully settle
    const settledPos = ctx.camera.position.clone();
    const totalGap = settledPos.distanceTo(beforePos);
    const oneFrameMove = afterOneFrame.distanceTo(beforePos);

    // A single frame at 60fps should move only a small fraction of the total
    // gap toward the new beat's target — never an instant jump/cut.
    expect(oneFrameMove).toBeGreaterThan(0);
    expect(oneFrameMove).toBeLessThan(totalGap * 0.5);
  });

  it('tracks the water blob position through the pipe during pipe-run', () => {
    const ctx = createStubContext({ width: 390, height: 844, dpr: 2, orientation: 'portrait' });
    const player = new CinematicBeatPlayer(ctx);
    const anchors = getSceneAnchors();

    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'pipe-run', fountain: 'fountain-ring' });
    ctx.bus.emitEvent({ kind: 'water-progress', t: 0, fountain: 'fountain-ring' });
    for (let i = 0; i < 120; i++) player.update(1 / 60); // let the smoothing settle
    const posAtStart = ctx.camera.position.clone();

    ctx.bus.emitEvent({ kind: 'water-progress', t: 1, fountain: 'fountain-ring' });
    for (let i = 0; i < 120; i++) player.update(1 / 60); // let the smoothing settle
    const posAtEnd = ctx.camera.position.clone();

    const curveStart = anchors.pipeCurves['fountain-ring'].getPointAt(0);
    const curveEnd = anchors.pipeCurves['fountain-ring'].getPointAt(1);
    // The camera sits outside the pipe/trench (Gate B fix #4 — never
    // coincident with the pipe centerline), but still close enough to be
    // clearly tracking it, not off in some unrelated part of the scene.
    expect(posAtStart.distanceTo(curveStart)).toBeLessThan(6);
    expect(posAtEnd.distanceTo(curveEnd)).toBeLessThan(6);
    expect(posAtEnd.distanceTo(posAtStart)).toBeGreaterThan(0.5);
  });

  it('blends between portrait and landscape variants over ~0.3s instead of cutting', () => {
    const ctx = createStubContext({ width: 390, height: 844, dpr: 2, orientation: 'portrait' });
    const player = new CinematicBeatPlayer(ctx);

    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'finale', fountain: null });
    for (let i = 0; i < 60; i++) player.update(1 / 60);
    const portraitPos = ctx.camera.position.clone();

    ctx.viewport = { width: 844, height: 390, dpr: 2, orientation: 'landscape' };
    player.update(1 / 60);
    const oneFrameAfterOrientationChange = ctx.camera.position.clone();
    expect(oneFrameAfterOrientationChange.distanceTo(portraitPos)).toBeLessThan(3);

    for (let i = 0; i < 60; i++) player.update(1 / 60); // well past the 0.3s blend
    const settledLandscapePos = ctx.camera.position.clone();
    expect(settledLandscapePos.distanceTo(portraitPos)).toBeGreaterThan(
      oneFrameAfterOrientationChange.distanceTo(portraitPos),
    );
  });

  it('has a fountain-reveal beat covering all three fountains', () => {
    const ctx = createStubContext({ width: 390, height: 844, dpr: 2, orientation: 'portrait' });
    const player = new CinematicBeatPlayer(ctx);
    for (const id of ALL_FOUNTAIN_IDS) {
      expect(() => {
        ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'fountain-reveal', fountain: id });
        for (let i = 0; i < 10; i++) player.update(1 / 60);
      }).not.toThrow();
    }
  });
});

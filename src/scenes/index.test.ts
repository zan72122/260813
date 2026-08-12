// src/scenes/index.test.ts
// Colocated unit test: registers the garden scene against a stub
// SceneContext, verifies stable mesh names exist for Worker B to hook
// materials/VFX onto, and that it reacts to GameEvent without throwing.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createEventBus, type SceneContext } from '../contracts';
import { getSceneAnchors } from './anchors';
import { createGardenScene } from './index';

function createStubContext(): SceneContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 390 / 844, 0.1, 100);
  const renderer = { info: { render: { calls: 0, triangles: 0 } } } as unknown as THREE.WebGLRenderer;
  return {
    scene,
    camera,
    renderer,
    bus: createEventBus(),
    quality: 'medium',
    viewport: { width: 390, height: 844, dpr: 2, orientation: 'portrait' },
    audio: { muted: false, async unlock() {}, play() {}, setIntensity() {} },
  };
}

function findByName(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (obj.name === name) found = obj;
  });
  return found;
}

describe('garden scene', () => {
  it('builds the stable-named objects Worker B upgrades materials/VFX onto', () => {
    const ctx = createStubContext();
    const scene = createGardenScene(ctx);

    for (const name of [
      'valve-head',
      'wrench',
      'fountain-fan-nozzle',
      'fountain-ring-nozzle',
      'fountain-crown-nozzle',
      'king-procession',
      'whistle',
      'pipe-network',
      'pipe-water-blob',
      'garden-path',
    ]) {
      expect(findByName(scene.group, name), `expected mesh/group named "${name}"`).toBeDefined();
    }

    scene.dispose();
  });

  it('reacts to phase/valve/water/fountain events without throwing', () => {
    const ctx = createStubContext();
    const scene = createGardenScene(ctx);
    const anchors = getSceneAnchors();

    expect(() => {
      ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'garden-idle', fountain: 'fountain-fan' });
      scene.update(0.5, 0.5);
      ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'whistle-cue', fountain: 'fountain-fan' });
      scene.update(0.1, 0.6);
      ctx.bus.emitEvent({ kind: 'valve-progress', openness: 0.5, angularVelocityRadPerSec: 2 });
      ctx.bus.emitEvent({ kind: 'water-progress', t: 0.5, fountain: 'fountain-fan' });
      scene.update(0.1, 0.7);
      ctx.bus.emitEvent({ kind: 'water-arrived', fountain: 'fountain-fan' });
      ctx.bus.emitEvent({ kind: 'fountain-flow', fountain: 'fountain-fan', intensity: 1 });
      ctx.bus.emitEvent({ kind: 'hint', target: 'valve' });
      scene.update(0.1, 0.8);
    }).not.toThrow();

    const wrench = findByName(scene.group, 'wrench-pivot') as THREE.Group;
    expect(wrench.rotation.y).toBeGreaterThan(0);

    const blob = findByName(scene.group, 'pipe-water-blob') as THREE.Mesh;
    const fanCurvePoint = anchors.pipeCurves['fountain-fan'].getPointAt(0.5);
    expect(blob.position.distanceTo(fanCurvePoint)).toBeLessThan(1e-4);

    scene.dispose();
  });

  it('walks the king procession toward the current fountain during garden-idle', () => {
    const ctx = createStubContext();
    const scene = createGardenScene(ctx);
    const anchors = getSceneAnchors();
    const king = findByName(scene.group, 'king-procession') as THREE.Group;

    const startDistance = king.position.distanceTo(anchors.fountains['fountain-fan'].kingStop);
    ctx.bus.emitEvent({ kind: 'phase-changed', phase: 'garden-idle', fountain: 'fountain-fan' });
    for (let i = 0; i < 10; i++) scene.update(1, i);
    const endDistance = king.position.distanceTo(anchors.fountains['fountain-fan'].kingStop);

    expect(endDistance).toBeLessThan(startDistance);
    expect(endDistance).toBeLessThan(0.05);

    scene.dispose();
  });
});

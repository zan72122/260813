// src/scenes/build/whistle.ts
// Whistle prop: visible in the whistle-cue framing, swings + glows for the
// cue and for the idle hint. A curved brass tube on a short post.

import * as THREE from 'three';
import { brassMaterial, goldMaterial } from './materials';

export interface WhistleVisual {
  readonly group: THREE.Group;
  /** Nudge the whistle into a swing (called on entering whistle-cue and on hints). */
  trigger(): void;
  update(dt: number, elapsed: number): void;
}

export function buildWhistle(): WhistleVisual {
  const group = new THREE.Group();
  group.name = 'whistle-post';

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.9, 8), brassMaterial());
  post.position.y = 0.45;
  post.castShadow = true;
  group.add(post);

  const pivot = new THREE.Group();
  pivot.name = 'whistle-pivot';
  pivot.position.y = 0.92;
  group.add(pivot);

  const whistleMat = goldMaterial();
  const whistle = new THREE.Group();
  whistle.name = 'whistle';

  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.12, -0.05, 0),
    new THREE.Vector3(0.22, -0.02, 0),
  );
  const tubeGeo = new THREE.TubeGeometry(curve, 16, 0.035, 10, false);
  const tube = new THREE.Mesh(tubeGeo, whistleMat);
  tube.castShadow = true;
  whistle.add(tube);

  const mouthEnd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), whistleMat);
  mouthEnd.position.copy(curve.getPoint(1));
  whistle.add(mouthEnd);

  pivot.add(whistle);

  let swingPhase = 0;
  let swingEnergy = 0;

  return {
    group,
    trigger(): void {
      swingEnergy = 1;
    },
    update(dt: number, elapsed: number): void {
      swingPhase = elapsed;
      swingEnergy = Math.max(0, swingEnergy - dt * 0.6);
      const idleSway = Math.sin(swingPhase * 1.1) * 0.04;
      const activeSway = Math.sin(swingPhase * 9) * 0.35 * swingEnergy;
      pivot.rotation.z = idleSway + activeSway;
      const emissiveBoost = swingEnergy * 0.6;
      whistleMat.emissive.setRGB(emissiveBoost, emissiveBoost * 0.8, emissiveBoost * 0.2);
    },
  };
}

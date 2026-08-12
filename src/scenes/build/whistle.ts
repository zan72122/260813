// src/scenes/build/whistle.ts
// Whistle prop: visible in the whistle-cue framing, swings + glows for the
// cue and for the idle hint. Gate B Wave 5 fix: previously read as a
// genie-lamp/bottle (a fat sphere dwarfing a thin curved tube). Rebuilt as an
// unmistakable small fontainier's pealess whistle — a slender barrel with a
// distinct narrower mouthpiece tube the child can read as "something you
// blow", plus a small cord loop — hung from a post by its cord.

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
  pivot.position.y = 0.94;
  group.add(pivot);

  // Cord: a short hanging loop from the post down to the whistle body.
  const cordMat = brassMaterial();
  const cordCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, -0.14, 0),
    new THREE.Vector3(0, -0.24, 0),
  );
  const cord = new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 10, 0.012, 6, false), cordMat);
  pivot.add(cord);

  const whistleMat = goldMaterial();
  const whistle = new THREE.Group();
  whistle.name = 'whistle';
  whistle.position.y = -0.24;
  whistle.rotation.z = Math.PI / 2; // lies horizontal, barrel pointing sideways

  // Barrel: the main body a child reads as "the whistle".
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.22, 14), whistleMat);
  whistle.add(barrel);

  // Mouthpiece: a distinctly narrower tube at one end — the "blow here" cue.
  const mouthpiece = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.14, 12), whistleMat);
  mouthpiece.position.y = 0.11 + 0.07;
  whistle.add(mouthpiece);
  const mouthRim = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.006, 6, 12), whistleMat);
  mouthRim.rotation.x = Math.PI / 2;
  mouthRim.position.y = 0.11 + 0.14;
  whistle.add(mouthRim);

  // Fipple window: a small flat cut near the barrel's far end, the little
  // rectangular slot that makes a pealess whistle unmistakable.
  const windowGeo = new THREE.BoxGeometry(0.05, 0.02, 0.012);
  const windowMesh = new THREE.Mesh(windowGeo, cordMat);
  windowMesh.position.set(0, -0.06, 0.05);
  whistle.add(windowMesh);

  // Cord loop ring at the far end, for hanging.
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14), cordMat);
  loop.rotation.y = Math.PI / 2;
  loop.position.y = -0.14;
  whistle.add(loop);

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
      const idleSway = Math.sin(swingPhase * 1.1) * 0.05;
      const activeSway = Math.sin(swingPhase * 9) * 0.4 * swingEnergy;
      pivot.rotation.z = idleSway + activeSway;
      const emissiveBoost = swingEnergy * 0.6;
      whistleMat.emissive.setRGB(emissiveBoost, emissiveBoost * 0.8, emissiveBoost * 0.2);
    },
  };
}

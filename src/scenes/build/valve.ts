// src/scenes/build/valve.ts
// Valve mechanism nook: brass valve head with a square top + a special
// wrench (socket + long handle reaching the outer rim, so the touch point
// isn't hidden under the finger) + verdigris accents, per MASTER_SPEC.

import * as THREE from 'three';
import { brassMaterial, verdigrisMaterial } from './materials';

export interface ValveVisual {
  readonly group: THREE.Group;
  readonly wrenchPivot: THREE.Group;
  /** rotation in radians about the valve stem (Y axis), openness*2.5 turns. */
  setWrenchRotation(radians: number): void;
  update(dt: number, elapsed: number, glowEnergy: number): void;
}

const WRENCH_HANDLE_LENGTH = 0.92; // reaches the outer rim, away from center

export function buildValve(): ValveVisual {
  const group = new THREE.Group();
  group.name = 'valve-nook';

  const pipeStub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.5, 12), brassMaterial());
  pipeStub.position.y = 0.25;
  pipeStub.castShadow = true;
  group.add(pipeStub);

  const headMat = brassMaterial();
  const head = new THREE.Group();
  head.name = 'valve-head';
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.22, 16), headMat);
  body.castShadow = true;
  head.add(body);
  const squareTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), headMat);
  squareTop.position.y = 0.16;
  squareTop.castShadow = true;
  head.add(squareTop);
  head.position.y = 0.5 + 0.11;
  group.add(head);

  // Verdigris accents: aged patina rings around the valve body.
  const verdigrisMat = verdigrisMaterial();
  for (const y of [-0.06, 0.06]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 20), verdigrisMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    head.add(ring);
  }

  const wrenchPivot = new THREE.Group();
  wrenchPivot.name = 'wrench-pivot';
  wrenchPivot.position.copy(head.position);
  group.add(wrenchPivot);

  const wrenchMat = brassMaterial();
  const wrench = new THREE.Group();
  wrench.name = 'wrench';

  const socket = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), wrenchMat);
  socket.rotation.x = Math.PI / 2;
  wrench.add(socket);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, WRENCH_HANDLE_LENGTH), wrenchMat);
  handle.position.z = WRENCH_HANDLE_LENGTH / 2 + 0.1;
  handle.castShadow = true;
  wrench.add(handle);

  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), wrenchMat);
  grip.position.z = WRENCH_HANDLE_LENGTH + 0.1;
  wrench.add(grip);

  wrench.position.y = 0.21;
  wrenchPivot.add(wrench);

  // Faint circular light-trail ring used for the hint + the "clockwise"
  // suggestion during valve-turn; Worker B upgrades to a real glow shader.
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xf6e39a, transparent: true, opacity: 0 });
  const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.015, 6, 32), glowMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.copy(head.position);
  glowRing.name = 'valve-hint-ring';
  group.add(glowRing);

  return {
    group,
    wrenchPivot,
    setWrenchRotation(radians: number): void {
      wrenchPivot.rotation.y = radians;
    },
    update(dt: number, elapsed: number, glowEnergy: number): void {
      glowMat.opacity = THREE.MathUtils.clamp(glowEnergy, 0, 1) * 0.6;
      glowRing.rotation.z = elapsed * 0.8;
      void dt;
    },
  };
}

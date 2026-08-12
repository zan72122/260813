// src/scene/yard.ts
// Ground-level construction yard at the current build level: timber deck,
// a stacked-beam pile, and a handful of instanced crate props. Deterministic
// from the seeded PRNG passed in.

import { BoxGeometry, DynamicDrawUsage, Group, InstancedMesh, Mesh, Object3D, PlaneGeometry } from 'three';
import type { MaterialSet } from '../visual/materials';

const MAX_CRATES = 10;

export interface YardRig {
  group: Group;
  dispose(): void;
}

export function createYardRig(materials: MaterialSet, rand: () => number): YardRig {
  const group = new Group();
  group.name = 'yard';

  const deckGeo = new PlaneGeometry(30, 24);
  const deck = new Mesh(deckGeo, materials.timber);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.01;
  group.add(deck);

  // stacked spare beams near the yard edge (cosmetic, low-poly boxes)
  const stackGeo = new BoxGeometry(3.2, 0.16, 0.3);
  const stackMesh = new InstancedMesh(stackGeo, materials.iron, 6);
  const dummy = new Object3D();
  for (let i = 0; i < 6; i += 1) {
    dummy.position.set(-9 + (i % 2) * 0.35, 0.1 + Math.floor(i / 2) * 0.18, 7 + (i % 2) * 0.4);
    dummy.rotation.y = 0.05 * (rand() - 0.5);
    dummy.updateMatrix();
    stackMesh.setMatrixAt(i, dummy.matrix);
  }
  stackMesh.count = 6;
  group.add(stackMesh);

  // instanced crates
  const crateGeo = new BoxGeometry(0.6, 0.6, 0.6);
  const crateMesh = new InstancedMesh(crateGeo, materials.crateWood, MAX_CRATES);
  crateMesh.instanceMatrix.setUsage(DynamicDrawUsage);
  let n = 0;
  for (let i = 0; i < 5; i += 1) {
    const x = 7 + rand() * 3;
    const z = -6 + rand() * 8;
    dummy.position.set(x, 0.3, z);
    dummy.rotation.y = rand() * Math.PI;
    dummy.updateMatrix();
    crateMesh.setMatrixAt(n, dummy.matrix);
    n += 1;
  }
  crateMesh.count = n;
  group.add(crateMesh);

  function dispose(): void {
    deckGeo.dispose();
    stackGeo.dispose();
    crateGeo.dispose();
  }

  return { group, dispose };
}

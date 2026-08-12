// src/scenes/build/ground.ts
// Lawn base, the king's stone path, hedge parterres, and a few gold statue
// silhouettes (Lathe) along the way. All procedural primitives, no assets,
// per docs/VISUAL_DIRECTION.md ("完全写実にも汎用ファンタジーにも寄せない").

import * as THREE from 'three';
import { goldMaterial, hedgeMaterial, lawnMaterial, stoneEdgeMaterial, stoneMaterial } from './materials';

export interface DisposableGroup {
  readonly group: THREE.Group;
  dispose(): void;
}

const PATH_HALF_WIDTH = 1.6;

function buildStatue(): THREE.Mesh {
  // Abstract gold silhouette: pedestal tapering to a slender finial, capped
  // with a small sphere — deliberately not a figure, per non-goals.
  const profile = [
    new THREE.Vector2(0.5, 0),
    new THREE.Vector2(0.46, 0.12),
    new THREE.Vector2(0.3, 0.16),
    new THREE.Vector2(0.22, 0.55),
    new THREE.Vector2(0.14, 0.62),
    new THREE.Vector2(0.16, 1.3),
    new THREE.Vector2(0.05, 1.35),
  ];
  const geometry = new THREE.LatheGeometry(profile, 16);
  const mesh = new THREE.Mesh(geometry, goldMaterial());
  mesh.castShadow = true;
  mesh.name = 'garden-statue';
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), goldMaterial());
  cap.position.y = 1.42;
  cap.castShadow = true;
  mesh.add(cap);
  return mesh;
}

export function buildGround(): DisposableGroup {
  const group = new THREE.Group();
  group.name = 'garden-ground';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const lawnGeo = new THREE.PlaneGeometry(30, 26);
  const lawnMat = lawnMaterial();
  const lawn = new THREE.Mesh(lawnGeo, lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  group.add(lawn);
  geometries.push(lawnGeo);
  materials.push(lawnMat);

  const pathGeo = new THREE.BoxGeometry(PATH_HALF_WIDTH * 2, 0.06, 21);
  const pathMat = stoneMaterial();
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.position.set(0, 0.03, 0);
  path.receiveShadow = true;
  path.name = 'garden-path';
  group.add(path);
  geometries.push(pathGeo);
  materials.push(pathMat);

  const edgeGeo = new THREE.BoxGeometry(0.18, 0.14, 21);
  const edgeMat = stoneEdgeMaterial();
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(side * (PATH_HALF_WIDTH + 0.1), 0.07, 0);
    edge.receiveShadow = true;
    edge.castShadow = true;
    group.add(edge);
  }
  geometries.push(edgeGeo);
  materials.push(edgeMat);

  // Geometric hedge parterres flanking the path, in blocks between fountains.
  const hedgeGeo = new THREE.BoxGeometry(1.5, 0.55, 2.1);
  const hedgeMat = hedgeMaterial();
  const hedgeZs = [-8, -6.5, -3.3, -1.8, 1.8, 3.3, 6.5, 8];
  for (const z of hedgeZs) {
    for (const side of [-1, 1]) {
      const hedge = new THREE.Mesh(hedgeGeo, hedgeMat);
      hedge.position.set(side * 2.6, 0.275, z);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      hedge.name = 'hedge-parterre';
      group.add(hedge);
    }
  }
  geometries.push(hedgeGeo);
  materials.push(hedgeMat);

  // A handful of gold statues punctuating the hedge line.
  const statueZs = [-7, 0, 7];
  for (const z of statueZs) {
    const statue = buildStatue();
    statue.position.set(-3.6, 0, z);
    group.add(statue);
  }

  return {
    group,
    dispose(): void {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (Array.isArray(obj.geometry)) obj.geometry.forEach((g: THREE.BufferGeometry) => g.dispose());
          else obj.geometry?.dispose?.();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose?.();
        }
      });
    },
  };
}

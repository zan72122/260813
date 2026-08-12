// src/scenes/build/ground.ts
// Lawn base, the king's stone path, low balustrade edging, hedge parterres
// with topiary accents, and gold statue silhouettes (Lathe) along the way.
// All procedural primitives, no assets, per docs/VISUAL_DIRECTION.md
// ("完全写実にも汎用ファンタジーにも寄せない"). Gate B Wave 5 fix round:
// richer/more articulated garden dressing (balustrade, topiary, taller
// statue count) using InstancedMesh so draw-call budget stays low.

import * as THREE from 'three';
import { goldMaterial, hedgeMaterial, lawnMaterial, stoneEdgeMaterial, stoneMaterial } from './materials';

export interface DisposableGroup {
  readonly group: THREE.Group;
  dispose(): void;
}

const PATH_HALF_WIDTH = 1.6;
/** Half-width span occupied by a hedge parterre block on either side of the
 * path (x = ±2.6, block width 1.5) — everything else (statues, balustrade,
 * topiary) is placed to keep clear of this, and src/scenes/anchors.ts keeps
 * the valve/whistle nook clear of it too. */
const HEDGE_X = 2.6;
const HEDGE_HALF_WIDTH = 0.75;

function buildStatue(): THREE.Mesh {
  // Abstract gold silhouette: a slender obelisk/finial, capped with a small
  // sphere — deliberately not a figure (non-goals) and deliberately NOT
  // vase/lamp-shaped (Gate B Wave 5 fix: the previous wide-flared-base
  // profile read as a genie lamp). Narrow throughout, widening only very
  // slightly at the plinth foot.
  const profile = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.22, 0),
    new THREE.Vector2(0.22, 0.1),
    new THREE.Vector2(0.15, 0.14),
    new THREE.Vector2(0.15, 0.24),
    new THREE.Vector2(0.09, 0.3),
    new THREE.Vector2(0.09, 1.15),
    new THREE.Vector2(0.03, 1.3),
  ];
  const geometry = new THREE.LatheGeometry(profile, 14);
  const mesh = new THREE.Mesh(geometry, goldMaterial());
  mesh.castShadow = true;
  mesh.name = 'garden-statue';
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), goldMaterial());
  cap.position.y = 1.36;
  cap.castShadow = true;
  mesh.add(cap);
  return mesh;
}

function buildBaluster(): THREE.BufferGeometry {
  // A small classical baluster silhouette (Lathe), instanced along the path
  // edges instead of the old plain box curb — reads as a proper low
  // balustrade even at establish-shot distance.
  const profile = [
    new THREE.Vector2(0.09, 0),
    new THREE.Vector2(0.1, 0.02),
    new THREE.Vector2(0.04, 0.08),
    new THREE.Vector2(0.06, 0.16),
    new THREE.Vector2(0.08, 0.2),
    new THREE.Vector2(0.045, 0.26),
    new THREE.Vector2(0.05, 0.3),
    new THREE.Vector2(0.09, 0.32),
  ];
  return new THREE.LatheGeometry(profile, 8);
}

function buildTopiaryCone(): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8));
  trunk.position.y = 0.11;
  group.add(trunk);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 10));
  cone.position.y = 0.22 + 0.425;
  group.add(cone);
  return group;
}

export function buildGround(): DisposableGroup {
  const group = new THREE.Group();
  group.name = 'garden-ground';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const lawnGeo = new THREE.PlaneGeometry(46, 34);
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

  const edgeGeo = new THREE.BoxGeometry(0.18, 0.1, 21);
  const edgeMat = stoneEdgeMaterial();
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(side * (PATH_HALF_WIDTH + 0.1), 0.05, 0);
    edge.receiveShadow = true;
    edge.castShadow = true;
    group.add(edge);
  }
  geometries.push(edgeGeo);
  materials.push(edgeMat);

  // Low balustrade: a row of small Lathe balusters along each path edge,
  // one InstancedMesh per side so richness doesn't cost extra draw calls.
  const balusterGeo = buildBaluster();
  const balusterMat = stoneEdgeMaterial();
  const balusterSpacing = 0.9;
  const balusterCount = Math.floor(21 / balusterSpacing);
  for (const side of [-1, 1]) {
    const instanced = new THREE.InstancedMesh(balusterGeo, balusterMat, balusterCount);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.name = 'path-balustrade';
    const m = new THREE.Matrix4();
    for (let i = 0; i < balusterCount; i++) {
      const z = -10.5 + i * balusterSpacing + balusterSpacing / 2;
      m.makeTranslation(side * (PATH_HALF_WIDTH + 0.2), 0.1, z);
      instanced.setMatrixAt(i, m);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }
  geometries.push(balusterGeo);
  materials.push(balusterMat);

  // Geometric hedge parterres flanking the path, in blocks between fountains,
  // with a slight height variation so the row reads as hand-composed rather
  // than a single repeated primitive.
  const hedgeGeo = new THREE.BoxGeometry(1.5, 1, 2.1);
  const hedgeMat = hedgeMaterial();
  const hedgeZs = [-8, -6.5, -3.3, -1.8, 1.8, 3.3, 6.5, 8];
  for (const [i, z] of hedgeZs.entries()) {
    const height = i % 2 === 0 ? 0.5 : 0.62;
    for (const side of [-1, 1]) {
      const hedge = new THREE.Mesh(hedgeGeo, hedgeMat);
      hedge.scale.y = height;
      hedge.position.set(side * HEDGE_X, (height * 1) / 2, z);
      hedge.castShadow = true;
      hedge.receiveShadow = true;
      hedge.name = 'hedge-parterre';
      group.add(hedge);
    }
  }
  geometries.push(hedgeGeo);
  materials.push(hedgeMat);

  // Topiary cone accents punctuating the outer corners of each hedge block —
  // instanced (one InstancedMesh per part: trunk, cone), so the extra
  // articulation ("more parterre shapes") only costs two draw calls total.
  const topiary = buildTopiaryCone();
  const topiaryTrunkGeo = (topiary.children[0] as THREE.Mesh).geometry;
  const topiaryConeGeo = (topiary.children[1] as THREE.Mesh).geometry;
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.9 });
  const coneMat = hedgeMaterial();
  const topiaryInstances: [number, number, number][] = [];
  for (const z of hedgeZs) {
    for (const side of [-1, 1]) {
      topiaryInstances.push([side * (HEDGE_X + HEDGE_HALF_WIDTH + 0.35), 0, z - 1.15]);
      topiaryInstances.push([side * (HEDGE_X + HEDGE_HALF_WIDTH + 0.35), 0, z + 1.15]);
    }
  }
  for (const [geo, mat] of [
    [topiaryTrunkGeo, trunkMat],
    [topiaryConeGeo, coneMat],
  ] as const) {
    const instanced = new THREE.InstancedMesh(geo, mat, topiaryInstances.length);
    instanced.castShadow = true;
    instanced.name = 'topiary-accent';
    const m = new THREE.Matrix4();
    topiaryInstances.forEach(([x, y, z], i) => {
      m.makeTranslation(x, y, z);
      instanced.setMatrixAt(i, m);
    });
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
    geometries.push(geo);
  }
  materials.push(trunkMat, coneMat);

  // Gold statues punctuating the hedge line on both sides — kept well clear
  // of the hedge blocks (HEDGE_X + HEDGE_HALF_WIDTH + margin) and of the
  // valve/whistle nook (src/scenes/anchors.ts, x <= -4.0).
  const statueZs = [-6.5, -1.8, 1.8, 6.5];
  for (const z of statueZs) {
    for (const side of [-1, 1]) {
      const statue = buildStatue();
      statue.position.set(side * (HEDGE_X + HEDGE_HALF_WIDTH + 1.1), 0, z);
      group.add(statue);
    }
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

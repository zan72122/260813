// src/scenes/build/fountains.ts
// Three fountain basins along the king's path (fan / ring / crown), each with
// a stable-named nozzle group Worker B upgrades with Hero Water Material +
// VFX. We only own the placeholder shape + the height/opacity reaction to
// `fountain-flow` intensity so the causal chain reads correctly before
// Worker B's pass lands.

import * as THREE from 'three';
import type { FountainId } from '../../contracts';
import type { FountainAnchor } from '../anchors';
import { goldMaterial, stoneEdgeMaterial, stoneMaterial, waterMaterial } from './materials';

export interface FountainJet {
  readonly mesh: THREE.Mesh;
  readonly baseHeight: number;
  readonly maxHeight: number;
}

export interface FountainVisual {
  readonly id: FountainId;
  readonly group: THREE.Group;
  readonly nozzleGroup: THREE.Group;
  readonly jets: FountainJet[];
  readonly wetRing: THREE.Mesh;
  setIntensity(intensity: number): void;
}

function buildBasin(radius: number): THREE.Group {
  const group = new THREE.Group();

  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 0.94, 0),
    new THREE.Vector2(radius * 0.98, 0.06),
    new THREE.Vector2(radius, 0.16),
    new THREE.Vector2(radius * 0.9, 0.2),
  ];
  const rimGeo = new THREE.LatheGeometry(profile, 32);
  const rim = new THREE.Mesh(rimGeo, stoneMaterial());
  rim.castShadow = true;
  rim.receiveShadow = true;
  group.add(rim);

  const floorGeo = new THREE.CircleGeometry(radius * 0.94, 32);
  const floor = new THREE.Mesh(floorGeo, waterMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  floor.name = 'basin-water-surface';
  group.add(floor);

  return group;
}

function makeJet(height: number, radiusTop: number, radiusBottom: number): FountainJet {
  const geometry = new THREE.ConeGeometry(radiusTop, height, 10, 1, true);
  geometry.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geometry, waterMaterial());
  mesh.scale.y = 0.001; // starts collapsed; grows with flow intensity
  mesh.userData.radiusBottom = radiusBottom;
  return { mesh, baseHeight: height, maxHeight: height };
}

function buildFanNozzle(): { group: THREE.Group; jets: FountainJet[] } {
  const group = new THREE.Group();
  group.name = 'fountain-fan-nozzle';
  const jets: FountainJet[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const angle = THREE.MathUtils.lerp(-Math.PI * 0.35, Math.PI * 0.35, t);
    const jet = makeJet(1.1 + Math.sin(t * Math.PI) * 0.5, 0.05, 0.03);
    jet.mesh.position.set(Math.sin(angle) * 0.15, 0, Math.cos(angle) * 0.15 - 0.15);
    jet.mesh.rotation.z = -angle * 0.6;
    group.add(jet.mesh);
    jets.push(jet);
  }
  return { group, jets };
}

function buildRingNozzle(): { group: THREE.Group; jets: FountainJet[] } {
  const group = new THREE.Group();
  group.name = 'fountain-ring-nozzle';
  const jets: FountainJet[] = [];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const jet = makeJet(0.75, 0.045, 0.03);
    const r = 0.85;
    jet.mesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    group.add(jet.mesh);
    jets.push(jet);
  }
  return { group, jets };
}

function buildCrownNozzle(): { group: THREE.Group; jets: FountainJet[] } {
  const group = new THREE.Group();
  group.name = 'fountain-crown-nozzle';
  const jets: FountainJet[] = [];

  const center = makeJet(1.9, 0.09, 0.06);
  group.add(center.mesh);
  jets.push(center);

  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const jet = makeJet(0.6, 0.04, 0.025);
    const r = 1.0;
    jet.mesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    group.add(jet.mesh);
    jets.push(jet);
  }
  return { group, jets };
}

export function buildFountain(anchor: FountainAnchor): FountainVisual {
  const group = new THREE.Group();
  group.name = anchor.id;
  group.position.copy(anchor.center);

  const basin = buildBasin(anchor.basinRadius);
  group.add(basin);

  let nozzle: { group: THREE.Group; jets: FountainJet[] };
  if (anchor.id === 'fountain-fan') nozzle = buildFanNozzle();
  else if (anchor.id === 'fountain-ring') nozzle = buildRingNozzle();
  else nozzle = buildCrownNozzle();

  nozzle.group.position.y = 0.16;
  group.add(nozzle.group);

  // Simple "wet stone" placeholder ring — Worker B upgrades to a real
  // roughness-darkening Hero Material pass; we just wire the reaction.
  const wetGeo = new THREE.RingGeometry(anchor.basinRadius, anchor.basinRadius + 0.5, 32);
  const wetMat = stoneEdgeMaterial();
  wetMat.transparent = true;
  wetMat.opacity = 0;
  const wetRing = new THREE.Mesh(wetGeo, wetMat);
  wetRing.rotation.x = -Math.PI / 2;
  wetRing.position.y = 0.005;
  wetRing.name = `wet-stone-${anchor.id}`;
  group.add(wetRing);

  // Gold statue punctuating the basin edge (silhouette only, per non-goals).
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 8), goldMaterial());
  finial.position.set(anchor.basinRadius * 0.75, 0.2, anchor.basinRadius * 0.75);
  finial.castShadow = true;
  group.add(finial);

  function setIntensity(intensity: number): void {
    const clamped = THREE.MathUtils.clamp(intensity, 0, 1);
    for (const jet of nozzle.jets) {
      jet.mesh.scale.y = Math.max(0.001, clamped);
      const mat = jet.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.55 + clamped * 0.35;
    }
    wetMat.opacity = clamped * 0.35;
  }
  setIntensity(0);

  return { id: anchor.id, group, nozzleGroup: nozzle.group, jets: nozzle.jets, wetRing, setIntensity };
}

/**
 * Paris backdrop: a pale sky gradient dome, a flat silhouette skyline ring,
 * and a soft ground plane with a Champ-de-Mars hint (and a cut rectangle
 * matching the machine-room earth cutaway). No vertigo framing anywhere —
 * this is all background dressing, never the focus.
 */

import * as THREE from 'three';

import { PALETTE } from '../contracts/constants.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import { MACHINE_ROOM_BOUNDS } from './cutawayEarth.ts';

const SKY_RADIUS = 520;
const SKY_CENTER = new THREE.Vector3(35, 55, 0);
const GROUND_HALF = 260;
const GROUND_CENTER_X = 35;
const SKYLINE_RADIUS = 190;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSkyDome(registry: DisposeRegistry): THREE.Mesh {
  // Covers almost the full sphere (not just the upper hemisphere) so no
  // camera angle can look "through" a gap at the bottom into the renderer's
  // clear color -- cheap insurance since it's one low-poly BackSide mesh.
  const geometry = new THREE.SphereGeometry(SKY_RADIUS, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.97);
  const position = geometry.getAttribute('position');
  const zenith = new THREE.Color(PALETTE.skyZenith);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const colors = new Float32Array(position.count * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    tmp.fromBufferAttribute(position, i);
    const elevation = THREE.MathUtils.clamp(tmp.y / SKY_RADIUS, 0, 1);
    const mixed = horizon.clone().lerp(zenith, Math.pow(elevation, 0.55));
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  registry.track(geometry);
  const material = registry.track(
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  const dome = new THREE.Mesh(geometry, material);
  dome.position.copy(SKY_CENTER);
  dome.renderOrder = -10;
  return dome;
}

function buildSkyline(materials: MaterialLibrary, registry: DisposeRegistry): THREE.InstancedMesh {
  const rand = mulberry32(7007);
  const count = 26;
  const geometry = registry.track(new THREE.BoxGeometry(1, 1, 1));
  const mesh = new THREE.InstancedMesh(geometry, materials.skyline, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI * 0.42 + (i / (count - 1)) * Math.PI * 0.84;
    const radius = SKYLINE_RADIUS + rand() * 40;
    const height = 6 + rand() * 22;
    const width = 6 + rand() * 10;
    const x = GROUND_CENTER_X + Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    m.compose(
      new THREE.Vector3(x, height / 2, z),
      new THREE.Quaternion(),
      new THREE.Vector3(width, height, width),
    );
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function buildGround(materials: MaterialLibrary, registry: DisposeRegistry): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(GROUND_CENTER_X - GROUND_HALF, -GROUND_HALF);
  shape.lineTo(GROUND_CENTER_X + GROUND_HALF, -GROUND_HALF);
  shape.lineTo(GROUND_CENTER_X + GROUND_HALF, GROUND_HALF);
  shape.lineTo(GROUND_CENTER_X - GROUND_HALF, GROUND_HALF);
  shape.closePath();

  const hole = new THREE.Path();
  const b = MACHINE_ROOM_BOUNDS;
  hole.moveTo(b.xMin, b.zMin);
  hole.lineTo(b.xMax, b.zMin);
  hole.lineTo(b.xMax, b.zMax);
  hole.lineTo(b.xMin, b.zMax);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = registry.track(new THREE.ShapeGeometry(shape, 2));
  const ground = new THREE.Mesh(geometry, materials.ground);
  // ShapeGeometry lies in local XY; rotate +90 about X so local (x, y) -> world (x, 0, y).
  ground.rotation.x = Math.PI / 2;
  return ground;
}

export interface BackdropResult {
  readonly group: THREE.Group;
  readonly skylineMesh: THREE.InstancedMesh;
  readonly fullSkylineCount: number;
}

export function buildBackdrop(materials: MaterialLibrary, registry: DisposeRegistry): BackdropResult {
  const group = new THREE.Group();
  group.name = 'backdrop';
  group.add(buildSkyDome(registry));
  const skylineMesh = buildSkyline(materials, registry);
  group.add(skylineMesh);
  group.add(buildGround(materials, registry));
  return { group, skylineMesh, fullSkylineCount: skylineMesh.count };
}

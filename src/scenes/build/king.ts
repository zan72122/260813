// src/scenes/build/king.ts
// King procession token: a gold sun-disc emblem (Louis XIV's Sun King motif,
// abstracted) atop a small pole, trailed by a tiny simplified cortege — a
// handful of plain cone "attendant" markers. Deliberately NOT a detailed
// human figure, per MASTER_SPEC non-goals ("精密人物モデリング禁止").

import * as THREE from 'three';
import { goldMaterial } from './materials';

export interface KingProcessionVisual {
  readonly group: THREE.Group;
  /** Place + orient the token along the path; call every frame while moving. */
  setPose(position: THREE.Vector3, forward: THREE.Vector3): void;
  /** Idle animation: gentle bob + slow ray rotation; bigger bounce during finale. */
  update(dt: number, elapsed: number, joyful: boolean): void;
}

function buildSunDisc(): THREE.Group {
  const group = new THREE.Group();
  const mat = goldMaterial();

  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), mat);
  group.add(disc);

  const rays = new THREE.Group();
  const rayCount = 12;
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6), mat);
    ray.position.set(Math.cos(angle) * 0.27, Math.sin(angle) * 0.27, 0);
    ray.rotation.z = angle - Math.PI / 2;
    rays.add(ray);
  }
  group.add(rays);
  group.userData.rays = rays;
  group.rotation.x = 0; // faces +Z by default (rotated to face travel direction by setPose)
  return group;
}

export function buildKingProcession(): KingProcessionVisual {
  const group = new THREE.Group();
  group.name = 'king-procession';

  const poleMat = goldMaterial();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), poleMat);
  pole.position.y = 0.55;
  group.add(pole);

  const sun = buildSunDisc();
  sun.position.y = 1.15;
  sun.castShadow = true;
  group.add(sun);

  const cortege = new THREE.Group();
  cortege.name = 'king-cortege';
  const attendantMat = goldMaterial();
  const offsets = [
    [-0.3, -0.6],
    [0.3, -0.6],
    [-0.5, -1.1],
    [0.5, -1.1],
    [0, -1.5],
  ];
  for (const [x, z] of offsets) {
    const attendant = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 8), attendantMat);
    attendant.position.set(x ?? 0, 0.2, z ?? 0);
    attendant.castShadow = true;
    cortege.add(attendant);
  }
  group.add(cortege);

  const forwardQuat = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const lookTarget = new THREE.Vector3();

  return {
    group,
    setPose(position: THREE.Vector3, forward: THREE.Vector3): void {
      group.position.copy(position);
      if (forward.lengthSq() > 1e-6) {
        lookTarget.copy(position).add(forward);
        const m = new THREE.Matrix4().lookAt(position, lookTarget, upAxis);
        forwardQuat.setFromRotationMatrix(m);
        group.quaternion.copy(forwardQuat);
      }
    },
    update(dt: number, elapsed: number, joyful: boolean): void {
      const rays = sun.userData.rays as THREE.Group;
      rays.rotation.z = elapsed * 0.4;
      const bobAmplitude = joyful ? 0.12 : 0.03;
      const bobSpeed = joyful ? 6 : 1.6;
      sun.position.y = 1.15 + Math.sin(elapsed * bobSpeed) * bobAmplitude;
      void dt;
    },
  };
}

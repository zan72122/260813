// src/app/placeholderScene.ts
// Minimal placeholder scene for Wave 1 scaffold verification: ground plane,
// sky gradient background, one animated box. Worker A (src/game|scenes|camera)
// replaces this with the real garden/valve/fountain scenes.
// Owned by Integrator (src/app/**).

import * as THREE from 'three';
import { createSkyGradientTexture } from './sky';

export interface PlaceholderScene {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export function createPlaceholderScene(scene: THREE.Scene): PlaceholderScene {
  scene.background = createSkyGradientTexture();
  scene.fog = new THREE.Fog(0xeaf6ff, 20, 60);

  const group = new THREE.Group();
  group.name = 'placeholder-scene';

  const groundGeometry = new THREE.PlaneGeometry(40, 40);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x6fae6f, roughness: 0.9 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxMaterial = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.2, roughness: 0.4 });
  const box = new THREE.Mesh(boxGeometry, boxMaterial);
  box.position.set(0, 0.5, 0);
  box.castShadow = true;
  group.add(box);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
  sun.position.set(5, 8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  group.add(sun);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  group.add(ambient);

  scene.add(group);

  return {
    group,
    update(_dt: number, elapsed: number): void {
      box.rotation.y = elapsed * 0.6;
      box.rotation.x = elapsed * 0.3;
      box.position.y = 0.5 + Math.sin(elapsed * 1.2) * 0.15;
    },
    dispose(): void {
      groundGeometry.dispose();
      groundMaterial.dispose();
      boxGeometry.dispose();
      boxMaterial.dispose();
      if (scene.background instanceof THREE.Texture) {
        scene.background.dispose();
      }
      scene.remove(group);
      scene.background = null;
      scene.fog = null;
    },
  };
}

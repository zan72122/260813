import * as THREE from 'three';
import { createStarSpriteTexture } from './materials/textures.ts';

export interface StarsHandles {
  points: THREE.Points;
  setVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
}

/** Faint ceiling stars for the nap reveal — a single Points draw call, opacity-tweened in by the caller. */
export function buildStars(count = 40): StarsHandles {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 3.2;
    const z = -1.4 + Math.random() * -0.6;
    const y = 1.7 + Math.random() * 0.35;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const tex = createStarSpriteTexture(32);
  const material = new THREE.PointsMaterial({
    map: tex,
    size: 0.05,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;

  return {
    points,
    setVisible: (visible: boolean) => {
      points.visible = visible;
    },
    setOpacity: (opacity: number) => {
      material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
    },
  };
}

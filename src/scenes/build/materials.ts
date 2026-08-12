// src/scenes/build/materials.ts
// Placeholder-quality materials in the docs/VISUAL_DIRECTION.md palette.
// Worker B (rendering-audio) upgrades these to Hero Materials; we only need
// stable, reasonable-looking stand-ins plus the stable mesh *names* called
// out in docs/CONTRACTS.md so Worker B's VFX/material passes can find them.

import * as THREE from 'three';

export const PALETTE = {
  hedgeDeep: 0x2e5339,
  hedgeLight: 0x3d6b4a,
  stoneWarm: 0xe0dbcb,
  stoneEdge: 0xcfc6b3,
  gold: 0xc9a227,
  goldHighlight: 0xf0d878,
  brass: 0xa67c3d,
  verdigris: 0x5e8f7a,
  water: 0x7fb8c4,
  lawn: 0x6f9563,
} as const;

export function hedgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.hedgeDeep, roughness: 0.95, metalness: 0 });
}

export function stoneMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.stoneWarm, roughness: 0.85, metalness: 0.02 });
}

export function stoneEdgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.stoneEdge, roughness: 0.8, metalness: 0.02 });
}

export function goldMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.35, metalness: 0.75 });
}

export function brassMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.4, metalness: 0.8 });
}

export function verdigrisMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.verdigris, roughness: 0.7, metalness: 0.3 });
}

export function waterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.water,
    transparent: true,
    opacity: 0.75,
    roughness: 0.15,
    metalness: 0.05,
  });
}

export function lawnMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: PALETTE.lawn, roughness: 0.95, metalness: 0 });
}

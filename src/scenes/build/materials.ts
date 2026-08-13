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
  // Warm, LIGHT brown — Gate B round 3: docs/CAMERA_STORYBOARD.md explicitly
  // forbids a near-black soil band ("土壌を黒く潰さない（近黒禁止）"). The
  // previous 0x4a3a2a read as ~70% black on screen once underground with
  // only ambient/hemisphere light reaching it (no direct sun down there).
  soil: 0xb8925f,
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
  // DoubleSide: Gate B round 3's diagram-style pipe-run camera sits below
  // ground looking up toward the surface for the "thin strip of lawn at the
  // top of frame" layer (docs/CAMERA_STORYBOARD.md) — a single-sided plane
  // would be invisible (backface-culled) from underneath.
  return new THREE.MeshStandardMaterial({ color: PALETTE.lawn, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
}

/** Warm, readable trench soil for the pipe-run cutaway diagram
 * (src/scenes/build/pipes.ts). A small emissive floor guarantees it never
 * reads as near-black underground, where only ambient/hemisphere light
 * reaches (no direct sun) — the storyboard's "近黒禁止" requirement. */
export function soilMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.soil,
    roughness: 0.92,
    metalness: 0,
    emissive: new THREE.Color(PALETTE.soil).multiplyScalar(0.35),
  });
}

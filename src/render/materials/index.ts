/**
 * The 5 hero materials (VISUAL_ACCEPTANCE.md § Hero Materials) plus the
 * handful of supporting materials (pin/target-ring glow, ground, sky, sand
 * stream/dust) the scene needs. All are MeshStandardMaterial variants with
 * procedurally-generated canvas textures (textures.ts) — no
 * MeshPhysicalMaterial, no bundled images, per PRODUCT_SPEC/ARCHITECTURE_CONTRACT.
 *
 * DOM-dependent (transitively, via textures.ts) — only ever constructed by
 * render/index.ts at renderer build/rebuild time (initial build AND
 * context-restored full rebuild), never imported by scene/ geometry
 * builders or DOM-free unit tests.
 */
import * as THREE from 'three';
import {
  createBrassTexture,
  createForgedIronTexture,
  createIronTexture,
  createSandStreamTexture,
  createSandTexture,
  createSkyTexture,
  createWoodTexture,
} from './textures';

export interface HeroMaterials {
  /** Hero material #1: dry sand (heightfield surface, stream, pile, grains). */
  sand: THREE.MeshStandardMaterial;
  /** Hero material #2: dark wrought iron with rivets — lattice legs, girder ring, sandbox iron bands. */
  iron: THREE.MeshStandardMaterial;
  /** Same texture, slightly darker/more metallic — rivet studs (visually reads as a distinct, slightly raised detail against `iron`). */
  ironRivet: THREE.MeshStandardMaterial;
  /** Hero material #3a: black-iron hydraulic cylinder body. */
  jackCylinder: THREE.MeshStandardMaterial;
  /** Hero material #3b: polished brass piston with an oily sheen (low roughness, high metalness — the "clearcoat的ハイライト" via specular response, kept as MeshStandardMaterial per ARCHITECTURE_CONTRACT). */
  jackPiston: THREE.MeshStandardMaterial;
  /** Hero material #4: knotty scaffold/sandbox wood. */
  wood: THREE.MeshStandardMaterial;
  /** Wood-toned material for the sandbox's iron reinforcement bands (reuses `iron`). */
  ironBand: THREE.MeshStandardMaterial;
  /** Hero material #5: forged iron wedge, with hammer-dent texture. */
  forgedWedge: THREE.MeshStandardMaterial;
  /** Alignment pin — emissive-capable template, cloned per-leg so glow can be driven independently. */
  pin: THREE.MeshStandardMaterial;
  /** Semi-transparent target ring — emissive-capable template, cloned per-leg. */
  targetRing: THREE.MeshStandardMaterial;
  /** Ground plane. */
  ground: THREE.MeshStandardMaterial;
  /** Unlit sky/horizon gradient. */
  sky: THREE.MeshBasicMaterial;
  /** Worker silhouettes — flat, unlit-ish dark material (small/backlit, detail doesn't matter). */
  worker: THREE.MeshStandardMaterial;
  /** Sand stream (gate → sandbox floor) — transparent, scrolling UV. */
  sandStream: THREE.MeshBasicMaterial;
  /** Dust puff (hammered event). */
  dust: THREE.MeshBasicMaterial;
  /** Hammer head. */
  hammer: THREE.MeshStandardMaterial;
}

/** Builds every material fresh (and every texture fresh) — safe to call again after a WebGL context-restored event to fully rebuild GPU resources. */
export function createHeroMaterials(): HeroMaterials {
  const sandTex = createSandTexture(512);
  const ironTex = createIronTexture(512);
  const brassTex = createBrassTexture(256);
  const woodTex = createWoodTexture(512);
  const forgedTex = createForgedIronTexture(256);
  const skyTex = createSkyTexture(512);

  const sand = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 0.95, metalness: 0.0, color: 0xffffff });

  const iron = new THREE.MeshStandardMaterial({ map: ironTex, roughness: 0.75, metalness: 0.55, color: 0xffffff });
  const ironRivet = new THREE.MeshStandardMaterial({ map: ironTex, roughness: 0.55, metalness: 0.75, color: 0xbfa877 });

  const jackCylinder = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.35, metalness: 0.85 });
  const jackPiston = new THREE.MeshStandardMaterial({ map: brassTex, color: 0xffffff, roughness: 0.12, metalness: 0.9 });

  const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, metalness: 0.02 });
  const ironBand = new THREE.MeshStandardMaterial({ map: ironTex, roughness: 0.5, metalness: 0.7, color: 0xd8c9a8 });

  const forgedWedge = new THREE.MeshStandardMaterial({ map: forgedTex, roughness: 0.4, metalness: 0.8 });
  const hammer = new THREE.MeshStandardMaterial({ map: forgedTex, roughness: 0.5, metalness: 0.6, color: 0xb08d3f });

  const pin = new THREE.MeshStandardMaterial({
    color: 0xd8c9a8,
    roughness: 0.4,
    metalness: 0.75,
    emissive: 0xffcf7a,
    emissiveIntensity: 0,
  });
  const targetRing = new THREE.MeshStandardMaterial({
    color: 0xfff2c8,
    roughness: 0.3,
    metalness: 0.2,
    emissive: 0xffdf9a,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  const ground = new THREE.MeshStandardMaterial({ color: 0x9c8a63, roughness: 1, metalness: 0 });
  const sky = new THREE.MeshBasicMaterial({ map: skyTex, fog: false, side: THREE.BackSide });
  const worker = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9, metalness: 0 });

  const sandStreamTex = createSandStreamTexture(128);
  const sandStream = new THREE.MeshBasicMaterial({
    map: sandStreamTex,
    color: 0xd9b573,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const dust = new THREE.MeshBasicMaterial({ color: 0xcbb98c, transparent: true, opacity: 0.35, depthWrite: false });

  return {
    sand,
    iron,
    ironRivet,
    jackCylinder,
    jackPiston,
    wood,
    ironBand,
    forgedWedge,
    pin,
    targetRing,
    ground,
    sky,
    worker,
    sandStream,
    dust,
    hammer,
  };
}

/**
 * Disposes every material and every texture it owns. Call on full teardown
 * (dispose()) and just before a context-restored rebuild.
 *
 * Iterates the fields explicitly (rather than `Object.values`) so every
 * material stays precisely typed — `Object.values` on a plain interface
 * (no index signature) widens to `any[]`, which would silently defeat
 * strict-mode checking on the dispose calls below.
 */
export function disposeHeroMaterials(materials: HeroMaterials): void {
  const all: (THREE.MeshStandardMaterial | THREE.MeshBasicMaterial)[] = [
    materials.sand,
    materials.iron,
    materials.ironRivet,
    materials.jackCylinder,
    materials.jackPiston,
    materials.wood,
    materials.ironBand,
    materials.forgedWedge,
    materials.pin,
    materials.targetRing,
    materials.ground,
    materials.sky,
    materials.worker,
    materials.sandStream,
    materials.dust,
    materials.hammer,
  ];
  for (const mat of all) {
    if ('map' in mat && mat.map) mat.map.dispose();
    mat.dispose();
  }
}

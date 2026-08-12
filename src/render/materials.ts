/**
 * The five hero material families (VISUAL_ACCEPTANCE "Hero materials"),
 * built once and shared across every mesh that wants one — keeps draw
 * calls/material-switch cost down and gives `dispose()` a single place to
 * free everything. Colors come from `PALETTE`; no ad-hoc hex literals for
 * the hero surfaces.
 */

import * as THREE from 'three';

import { PALETTE } from '../contracts/constants.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import {
  createBlackIronTexture,
  createBrassTexture,
  createCabinTexture,
  createCableTexture,
  createGroundTexture,
  createIronTexture,
} from './textures.ts';

export interface MaterialLibrary {
  /** 1. Dark iron lattice (girders, chords, platforms). */
  readonly iron: THREE.MeshStandardMaterial;
  /** Iron, slightly brighter — for surfaces catching more lamplight (cut-face rims). */
  readonly ironLit: THREE.MeshStandardMaterial;
  /** Painted solid cap faces of the authored cutaway (VISUAL_ACCEPTANCE "Cutaway policy"). */
  readonly cutawayCap: THREE.MeshStandardMaterial;
  /** 2. Brass — valve wheels, piston collars, pulley hub trim. */
  readonly brass: THREE.MeshStandardMaterial;
  /** 2. Black iron — piston/machinery bodies. */
  readonly blackIron: THREE.MeshStandardMaterial;
  /** 3. Thick steel cable, twist-mapped, scrollable via `map.offset.y`. */
  readonly cable: THREE.MeshStandardMaterial;
  /** 4. Warm ochre passenger cabin shell. */
  readonly cabin: THREE.MeshStandardMaterial;
  /** Cabin trim / linkage bars (darker iron-brass mix read as machined steel). */
  readonly linkage: THREE.MeshStandardMaterial;
  /** 5. Colored water. */
  readonly water: THREE.MeshStandardMaterial;
  /** 5. The ONLY glass — cabin window + water-tank / sight-glass panes. */
  readonly glass: THREE.MeshPhysicalMaterial;
  /** Rails the carrier rides on — same steel family as cable, unmapped. */
  readonly rail: THREE.MeshStandardMaterial;
  /** Ground plane. */
  readonly ground: THREE.MeshStandardMaterial;
  /** Dollhouse earth cross-section cap faces (machine-room cutaway). */
  readonly earth: THREE.MeshStandardMaterial;
  /** Pale flat Paris skyline silhouettes. */
  readonly skyline: THREE.MeshBasicMaterial;
  /** Friendly robot operator body (rounded, warm off-white). */
  readonly robotBody: THREE.MeshStandardMaterial;
  /** Robot / passenger accent (big friendly eyes, buttons). */
  readonly robotAccent: THREE.MeshStandardMaterial;
  /** Soft red ball rolling on the cabin floor. */
  readonly ball: THREE.MeshStandardMaterial;
  /** Two friendly passenger colors (warm, rounded figures). */
  readonly passengerA: THREE.MeshStandardMaterial;
  readonly passengerB: THREE.MeshStandardMaterial;
  /** Warm lamp housing + glow. */
  readonly lamp: THREE.MeshStandardMaterial;
  readonly lampGlow: THREE.MeshBasicMaterial;
  dispose(): void;
}

export function createMaterialLibrary(registry: DisposeRegistry): MaterialLibrary {
  const ironTex = registry.track(createIronTexture());
  const brassTex = registry.track(createBrassTexture());
  const blackIronTex = registry.track(createBlackIronTexture());
  const cableTex = registry.track(createCableTexture());
  const cabinTex = registry.track(createCabinTexture());
  const groundTex = registry.track(createGroundTexture());

  // Note: MeshStandardMaterial multiplies `color` by `map` texel color. Every
  // map baked below already carries its own PALETTE-derived tone, so `color`
  // stays white (or a light tint) here -- multiplying two already-dark values
  // together would crush the result toward black regardless of scene lighting.
  const iron = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: ironTex,
      roughness: 0.75,
      metalness: 0.08,
    }),
  );

  const ironLit = registry.track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff).lerp(new THREE.Color(PALETTE.undergroundLamplight), 0.2),
      map: ironTex,
      roughness: 0.55,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
  );

  const cutawayCap = registry.track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE.iron).lerp(new THREE.Color('#9a9aa0'), 0.35),
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );

  const brass = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: brassTex,
      roughness: 0.32,
      metalness: 0.25,
    }),
  );

  const blackIron = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: blackIronTex,
      roughness: 0.42,
      metalness: 0.12,
    }),
  );

  const cable = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: cableTex,
      roughness: 0.45,
      metalness: 0.18,
    }),
  );

  const cabin = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: cabinTex,
      roughness: 0.55,
      metalness: 0.05,
      // DoubleSide: `interiorProof` puts the camera inside the shell, where a
      // default FrontSide box would backface-cull invisible and let the
      // exterior lattice/sky show through the "walls".
      side: THREE.DoubleSide,
    }),
  );

  const linkage = registry.track(
    new THREE.MeshStandardMaterial({
      color: '#4a4a52',
      roughness: 0.4,
      metalness: 0.2,
    }),
  );

  const water = registry.track(
    new THREE.MeshStandardMaterial({
      color: PALETTE.waterTeal,
      roughness: 0.25,
      metalness: 0.05,
      emissive: new THREE.Color(PALETTE.waterTeal).multiplyScalar(0.12),
    }),
  );

  // The ONE glass family: cabin windows + tank/sight-glass panes.
  const glass = registry.track(
    new THREE.MeshPhysicalMaterial({
      color: '#eaf3f5',
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.55,
      thickness: 0.05,
      depthWrite: false,
    }),
  );

  const rail = registry.track(
    new THREE.MeshStandardMaterial({
      color: '#9a9ea5',
      roughness: 0.35,
      metalness: 0.2,
    }),
  );

  const ground = registry.track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundTex,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
  );

  const earth = registry.track(
    new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 0.98, metalness: 0, side: THREE.DoubleSide }),
  );

  const skyline = registry.track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.skyZenith).lerp(new THREE.Color(PALETTE.skyHorizon), 0.55),
      fog: false,
    }),
  );

  const robotBody = registry.track(
    new THREE.MeshStandardMaterial({ color: '#f4ede0', roughness: 0.5, metalness: 0.1 }),
  );
  const robotAccent = registry.track(
    new THREE.MeshStandardMaterial({ color: '#3fa8b8', roughness: 0.3, metalness: 0.2 }),
  );
  const ball = registry.track(
    new THREE.MeshStandardMaterial({ color: '#d85b4a', roughness: 0.45, metalness: 0.05 }),
  );
  const passengerA = registry.track(
    new THREE.MeshStandardMaterial({ color: '#6fa8c9', roughness: 0.55, metalness: 0.05 }),
  );
  const passengerB = registry.track(
    new THREE.MeshStandardMaterial({ color: '#e08fa0', roughness: 0.55, metalness: 0.05 }),
  );
  const lamp = registry.track(
    new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: 0.3, metalness: 0.25 }),
  );
  const lampGlow = registry.track(
    new THREE.MeshBasicMaterial({ color: PALETTE.undergroundLamplight, fog: false }),
  );

  return {
    iron,
    ironLit,
    cutawayCap,
    brass,
    blackIron,
    cable,
    cabin,
    linkage,
    water,
    glass,
    rail,
    ground,
    earth,
    skyline,
    robotBody,
    robotAccent,
    ball,
    passengerA,
    passengerB,
    lamp,
    lampGlow,
    dispose(): void {
      // Textures + materials are all registered with `registry`; the owner
      // (EiffelSceneWorld) disposes the whole registry on teardown/rebuild.
    },
  };
}

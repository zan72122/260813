// src/visual/materials.ts
// Shared/reused materials for the whole scene, built once from the
// procedural texture set. Every module pulls from here instead of creating
// its own MeshStandardMaterial so instancing/batching stays cheap and
// dispose() has one place to release everything.

import { Color, DoubleSide, MeshStandardMaterial } from 'three';
import type { TextureSet } from './textures';

export interface MaterialSet {
  iron: MeshStandardMaterial;
  ironDark: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  timber: MeshStandardMaterial;
  ghost: MeshStandardMaterial;
  haussmannWall: MeshStandardMaterial;
  trocadero: MeshStandardMaterial;
  cloth: MeshStandardMaterial[];
  skin: MeshStandardMaterial;
  coal: MeshStandardMaterial;
  crateWood: MeshStandardMaterial;
  bridgeStone: MeshStandardMaterial;
}

const CLOTH_PALETTE = ['#4a5f7a', '#7a4a3f', '#5c6b45', '#8a6a3a', '#3f4a5c'];

export function buildMaterialSet(tex: TextureSet): MaterialSet {
  const iron = new MeshStandardMaterial({
    map: tex.iron,
    roughness: 0.85,
    metalness: 0.35,
    color: new Color('#b3543a'),
  });
  const ironDark = new MeshStandardMaterial({
    map: tex.iron,
    roughness: 0.9,
    metalness: 0.4,
    color: new Color('#5a4640'),
  });
  const brass = new MeshStandardMaterial({
    color: new Color('#c9a24a'),
    roughness: 0.35,
    metalness: 0.85,
  });
  const timber = new MeshStandardMaterial({ map: tex.timber, roughness: 0.95, metalness: 0.02 });
  const ghost = new MeshStandardMaterial({
    color: new Color('#fff6e6'),
    transparent: true,
    opacity: 0.38,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
  });
  const haussmannWall = new MeshStandardMaterial({ map: tex.haussmann, roughness: 1, metalness: 0 });
  const trocadero = new MeshStandardMaterial({ color: new Color('#c9b89a'), roughness: 1, metalness: 0 });
  const cloth = CLOTH_PALETTE.map(
    (c) => new MeshStandardMaterial({ color: new Color(c), roughness: 0.9, metalness: 0, side: DoubleSide }),
  );
  const skin = new MeshStandardMaterial({ color: new Color('#c98f6a'), roughness: 0.85, metalness: 0 });
  const coal = new MeshStandardMaterial({
    color: new Color('#2a1510'),
    emissive: new Color('#ff5a1a'),
    emissiveIntensity: 1.4,
    roughness: 1,
  });
  const crateWood = new MeshStandardMaterial({ map: tex.timber, color: new Color('#a9895f'), roughness: 0.9 });
  const bridgeStone = new MeshStandardMaterial({ color: new Color('#d8cdb4'), roughness: 1, metalness: 0 });

  return {
    iron,
    ironDark,
    brass,
    timber,
    ghost,
    haussmannWall,
    trocadero,
    cloth,
    skin,
    coal,
    crateWood,
    bridgeStone,
  };
}

export function disposeMaterialSet(set: MaterialSet): void {
  set.iron.dispose();
  set.ironDark.dispose();
  set.brass.dispose();
  set.timber.dispose();
  set.ghost.dispose();
  set.haussmannWall.dispose();
  set.trocadero.dispose();
  set.cloth.forEach((m) => m.dispose());
  set.skin.dispose();
  set.coal.dispose();
  set.crateWood.dispose();
  set.bridgeStone.dispose();
}

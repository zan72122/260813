/**
 * One leg's MOVING rig: lattice bars + rivets + alignment pin, all parented
 * under a single Group whose `position.y` is the only thing that changes
 * per frame (`legOffsetToWorldY(state.legs[leg].legOffsetY)`). Everything
 * else about the leg (its XZ placement, its taper) is baked into the
 * geometry once at build time — see tower/legLatticeMath.ts.
 */
import * as THREE from 'three';
import type { LegId } from '../contracts/types';
import type { HeroMaterials } from '../render/materials';
import { buildLegLattice } from './tower/legLatticeGeometry';
import { buildPinAndRing } from './tower/pinAndRing';
import { legOffsetToWorldY } from './mapping';

export interface LegRig {
  /** Add directly to the scene. Its position.y is driven every frame by `updateLegRig`. */
  group: THREE.Group;
  /** The alignment-pin mesh (own material instance) — glow.ts drives its emissiveIntensity from alignmentError. */
  pin: THREE.Mesh;
  barCount: number;
  rivetCount: number;
}

export function buildLegRig(leg: LegId, materials: HeroMaterials): LegRig {
  const group = new THREE.Group();

  const lattice = buildLegLattice(leg, materials.iron, materials.ironRivet);
  group.add(lattice.bars, lattice.rivets);

  const { pin } = buildPinAndRing(leg, materials.pin, materials.targetRing);
  group.add(pin);

  return { group, pin, barCount: lattice.barCount, rivetCount: lattice.rivetCount };
}

/** Applies the current legOffsetY to the rig's Group — the ONLY per-frame mutation this rig needs. */
export function updateLegRig(rig: LegRig, legOffsetY: number): void {
  rig.group.position.y = legOffsetToWorldY(legOffsetY);
}

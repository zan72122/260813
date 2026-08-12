// src/vfx/particlePool.ts
// Shared global particle budget enforcement (≤1500 across everything, per
// MASTER_SPEC quality budget). Every VFX factory that spawns THREE.Points
// droplets/mist must claim its count here first and use only what it is
// granted — never allocate points outside this accounting.

import * as THREE from 'three';

export const GLOBAL_PARTICLE_BUDGET = 1500;

class ParticleBudget {
  private used = 0;

  /** Requests `count` particles; returns how many were actually granted. */
  claim(count: number): number {
    const available = Math.max(0, GLOBAL_PARTICLE_BUDGET - this.used);
    const granted = Math.max(0, Math.min(count, available));
    this.used += granted;
    return granted;
  }

  release(count: number): void {
    this.used = Math.max(0, this.used - count);
  }

  get remaining(): number {
    return GLOBAL_PARTICLE_BUDGET - this.used;
  }

  get inUse(): number {
    return this.used;
  }
}

/** Single process-wide budget shared by all vfx factories. */
export const globalParticleBudget = new ParticleBudget();

let sharedDropletSprite: THREE.CanvasTexture | null = null;

/** Small round white sprite for additive droplet/mist particles (procedural, no image asset). */
export function getDropletSprite(): THREE.CanvasTexture {
  if (sharedDropletSprite) return sharedDropletSprite;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable for droplet sprite.');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  sharedDropletSprite = new THREE.CanvasTexture(canvas);
  sharedDropletSprite.needsUpdate = true;
  return sharedDropletSprite;
}

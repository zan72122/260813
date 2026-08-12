/**
 * Light additive-sprite effects: steam wisps drifting off the underground
 * machinery, and a gentle sparkle burst when leveling succeeds
 * (PERFORMANCE_BUDGET "particles = light additive sprites, <= 200
 * (low: 0)"). Fixed-size particle pools, updated in place every frame —
 * no per-frame allocation once built.
 */

import * as THREE from 'three';

import { PALETTE } from '../contracts/constants.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import { createSoftDotTexture } from '../render/textures.ts';

const MAX_STEAM = 40;
const MAX_SPARKLE = 160;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

function makePool(count: number): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    pool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.3 });
  }
  return pool;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPoints(
  count: number,
  color: string,
  size: number,
  registry: DisposeRegistry,
  map: THREE.Texture,
): { points: THREE.Points; positions: Float32Array; colors: Float32Array; base: THREE.Color } {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  registry.track(geometry);

  // vertexColors carries each particle's life-fraction fade: additive blending means a
  // color scaled toward black contributes nothing, so this fades particles out cheaply
  // with no per-frame allocation and no custom shader.
  const material = new THREE.PointsMaterial({
    map,
    size,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    opacity: 0.9,
  });
  registry.track(material);

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, positions, colors, base: new THREE.Color(color) };
}

export class EffectsRig {
  readonly group: THREE.Group;

  private readonly steamPool = makePool(MAX_STEAM);
  private readonly sparklePool = makePool(MAX_SPARKLE);
  private readonly steamPoints;
  private readonly sparklePoints;
  private readonly rand = mulberry32(9009);
  private readonly sharedDot: THREE.Texture;

  private steamEmitter: THREE.Vector3 | null = null;
  private enabled = true;
  private steamBudget = MAX_STEAM;
  private sparkleBudget = MAX_SPARKLE;

  constructor(registry: DisposeRegistry) {
    this.group = new THREE.Group();
    this.group.name = 'effects';
    this.sharedDot = registry.track(createSoftDotTexture());

    const steam = buildPoints(MAX_STEAM, '#fff2df', 1.6, registry, this.sharedDot);
    this.steamPoints = steam;
    this.group.add(steam.points);

    const sparkle = buildPoints(MAX_SPARKLE, PALETTE.brass, 0.55, registry, this.sharedDot);
    this.sparklePoints = sparkle;
    this.group.add(sparkle.points);
  }

  /** Set (or clear, with `null`) the world position steam wisps drift up from. */
  setSteamEmitter(position: THREE.Vector3 | null): void {
    this.steamEmitter = position;
  }

  /** Fire a one-shot sparkle burst at a world position (leveling success). */
  burstSparkle(position: THREE.Vector3): void {
    if (!this.enabled || this.sparkleBudget <= 0) return;
    let spawned = 0;
    const toSpawn = Math.min(this.sparkleBudget, 46);
    for (const p of this.sparklePool) {
      if (spawned >= toSpawn) break;
      if (p.active) continue;
      const angle = this.rand() * Math.PI * 2;
      const speed = 0.6 + this.rand() * 1.4;
      p.active = true;
      p.x = position.x;
      p.y = position.y;
      p.z = position.z;
      p.vx = Math.cos(angle) * speed;
      p.vy = 0.6 + this.rand() * 1.2;
      p.vz = Math.sin(angle) * speed;
      p.maxLife = 0.6 + this.rand() * 0.5;
      p.life = p.maxLife;
      spawned += 1;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.group.visible = enabled;
    if (!enabled) {
      for (const p of this.steamPool) p.active = false;
      for (const p of this.sparklePool) p.active = false;
    }
  }

  /** Particle budget from the active QualityTier (0 disables the family entirely). */
  setBudget(totalBudget: number): void {
    const ratio = totalBudget / (MAX_STEAM + MAX_SPARKLE);
    this.steamBudget = Math.round(MAX_STEAM * ratio);
    this.sparkleBudget = Math.round(MAX_SPARKLE * ratio);
  }

  update(dt: number): void {
    if (!this.enabled) return;

    if (this.steamEmitter && this.steamBudget > 0) {
      for (const p of this.steamPool) {
        if (p.active) continue;
        if (this.rand() > dt * 6) continue;
        p.active = true;
        p.x = this.steamEmitter.x + (this.rand() - 0.5) * 1.4;
        p.y = this.steamEmitter.y;
        p.z = this.steamEmitter.z + (this.rand() - 0.5) * 1.4;
        p.vx = (this.rand() - 0.5) * 0.15;
        p.vy = 0.4 + this.rand() * 0.3;
        p.vz = (this.rand() - 0.5) * 0.15;
        p.maxLife = 2.2 + this.rand() * 1.2;
        p.life = p.maxLife;
        break;
      }
    }

    this.stepPool(this.steamPool, dt, this.steamPoints, 0.9);
    this.stepPool(this.sparklePool, dt, this.sparklePoints, 2.2);

    this.steamPoints.points.geometry.getAttribute('position').needsUpdate = true;
    this.steamPoints.points.geometry.getAttribute('color').needsUpdate = true;
    this.sparklePoints.points.geometry.getAttribute('position').needsUpdate = true;
    this.sparklePoints.points.geometry.getAttribute('color').needsUpdate = true;
  }

  private stepPool(
    pool: Particle[],
    dt: number,
    target: { readonly positions: Float32Array; readonly colors: Float32Array; readonly base: THREE.Color },
    drag: number,
  ): void {
    const { positions, colors, base } = target;
    for (let i = 0; i < pool.length; i += 1) {
      const p = pool[i]!;
      if (p.active) {
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
        } else {
          p.vy -= drag * 0.02 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
        }
      }
      const fraction = p.active ? Math.max(0, p.life / p.maxLife) : 0;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      colors[i * 3] = base.r * fraction;
      colors[i * 3 + 1] = base.g * fraction;
      colors[i * 3 + 2] = base.b * fraction;
    }
  }

  dispose(): void {
    // Geometries/materials/texture are registry-tracked by the caller.
  }
}

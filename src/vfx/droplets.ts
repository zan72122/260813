// src/vfx/droplets.ts
// Reusable fake-physics droplet/mist particle emitter (ballistic arcs +
// gravity, NOT a fluid sim) built on a single custom-shader THREE.Points
// object per emitter, with per-particle size/alpha so droplets can grow in
// and fade out smoothly. Particle counts are always claimed from
// globalParticleBudget so the ≤1500 project-wide cap is respected.

import * as THREE from 'three';
import { getDropletSprite, globalParticleBudget } from './particlePool';

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  uniform float uPixelRatio;
  void main() {
    vAlpha = aAlpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (300.0 / max(0.001, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    float a = tex.a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export interface DropletEmitterOptions {
  /** Upper bound requested from the shared budget; actual grant may be lower. */
  requestedCount: number;
  color: THREE.Color;
  baseSize: number;
  gravity: number;
  lifetimeRange: [number, number];
  fadeInFrac?: number;
  fadeOutFrac?: number;
  /** Caps peak per-particle alpha so dense overlapping additive droplets don't blow out to solid white. */
  peakAlpha?: number;
}

/** A single particle slot's simulation state. */
interface Slot {
  vx: number;
  vy: number;
  vz: number;
  age: number;
  lifetime: number;
  alive: boolean;
}

export class DropletEmitter {
  readonly points: THREE.Points;
  readonly grantedCount: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly slots: Slot[];
  private cursor = 0;
  private readonly opts: Required<DropletEmitterOptions>;

  constructor(opts: DropletEmitterOptions) {
    this.opts = {
      fadeInFrac: 0.12,
      fadeOutFrac: 0.35,
      peakAlpha: 1,
      ...opts,
    };
    this.grantedCount = globalParticleBudget.claim(Math.max(0, Math.floor(opts.requestedCount)));

    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(Math.max(1, this.grantedCount) * 3);
    this.sizes = new Float32Array(Math.max(1, this.grantedCount));
    this.alphas = new Float32Array(Math.max(1, this.grantedCount));
    this.slots = Array.from({ length: this.grantedCount }, () => ({
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      lifetime: 1,
      alive: false,
    }));

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uMap: { value: getDropletSprite() },
        uColor: { value: this.opts.color },
        uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Keep droplet color legible against ACES tone mapping (see waterJet.ts).
    this.material.toneMapped = false;

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Spawns up to `n` droplets at `origin` with velocities from `randomVelocity()`. */
  spawn(n: number, origin: THREE.Vector3, randomVelocity: () => THREE.Vector3): void {
    if (this.grantedCount === 0) return;
    for (let i = 0; i < n; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.grantedCount;
      const slot = this.slots[idx];
      if (!slot) continue;
      const v = randomVelocity();
      slot.vx = v.x;
      slot.vy = v.y;
      slot.vz = v.z;
      slot.age = 0;
      const [min, max] = this.opts.lifetimeRange;
      slot.lifetime = min + Math.random() * (max - min);
      slot.alive = true;
      this.positions[idx * 3] = origin.x;
      this.positions[idx * 3 + 1] = origin.y;
      this.positions[idx * 3 + 2] = origin.z;
    }
  }

  update(dt: number): void {
    if (this.grantedCount === 0) return;
    const { gravity, baseSize, fadeInFrac, fadeOutFrac, peakAlpha } = this.opts;
    for (let i = 0; i < this.grantedCount; i++) {
      const slot = this.slots[i];
      if (!slot || !slot.alive) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      slot.age += dt;
      if (slot.age >= slot.lifetime) {
        slot.alive = false;
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      slot.vy -= gravity * dt;
      const px = i * 3;
      const py = i * 3 + 1;
      const pz = i * 3 + 2;
      this.positions[px] = (this.positions[px] ?? 0) + slot.vx * dt;
      this.positions[py] = (this.positions[py] ?? 0) + slot.vy * dt;
      this.positions[pz] = (this.positions[pz] ?? 0) + slot.vz * dt;
      if ((this.positions[py] ?? 0) < -0.02) {
        // Settled to the ground — fade out quickly instead of a hard pop.
        slot.age = slot.lifetime - slot.lifetime * fadeOutFrac * 0.3;
      }

      const t = slot.age / slot.lifetime;
      let alpha = 1;
      if (t < fadeInFrac) alpha = t / fadeInFrac;
      else if (t > 1 - fadeOutFrac) alpha = (1 - t) / fadeOutFrac;
      this.alphas[i] = Math.max(0, Math.min(1, alpha)) * peakAlpha;
      this.sizes[i] = baseSize * (0.7 + 0.3 * Math.max(0, Math.min(1, alpha)));
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    globalParticleBudget.release(this.grantedCount);
    this.geometry.dispose();
    this.material.dispose();
  }
}

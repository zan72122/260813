import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  SRGBColorSpace
} from 'three';
import type { QualityTier, VfxSystem } from '../core';
import { getCtx2d, makeCanvas, withAlpha } from '../render/textureGen';

/**
 * Owner B (rendering-audio) real implementation. Every effect is a small
 * budget of billboard particles (three.js Points, auto camera-facing — no
 * camera reference needed here) or a handful of additive planes, using only
 * procedurally-painted canvas sprite textures (see ASSET_MANIFEST.md).
 * Positions are local to whatever Object3D is passed to attach(): dust sits
 * low (understage), footlights sit along the stage-front floor line, gobo
 * shafts hang toward canopy height pointing down at the stage, and birds fly
 * a little above stage height. Callers who need a different layout can scale
 * / offset the parent Object3D they pass to attach().
 *
 * Class kept named `NullVfxSystem` (see src/app/App.ts, out of this owner's
 * edit scope) — it is no longer a null object, only its name is pinned by
 * the existing wiring.
 */

interface TierCounts {
  dust: number;
  footlights: number;
  goboShafts: number;
  birds: number;
}

const TIER_COUNTS: Record<QualityTier, TierCounts> = {
  low: { dust: 60, footlights: 7, goboShafts: 2, birds: 2 },
  medium: { dust: 140, footlights: 10, goboShafts: 4, birds: 3 },
  high: { dust: 200, footlights: 12, goboShafts: 5, birds: 3 }
};

const DUST_CENTER_Y = -1.3;
const DUST_SPREAD = { x: 1.4, y: 0.9, z: 0.9 };
const FOOTLIGHT_Y = 0.06;
const FOOTLIGHT_Z = 1.55;
const FOOTLIGHT_SPAN_X = 1.3;
const GOBO_Y = 2.3;
const GOBO_SPAN_X = 1.6;
const BIRD_Y = 1.9;
const BIRD_SPAN_X = 1.1;
const BIRD_Z = -1.1;

function buildDiscTexture(color: string, size: number): CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = getCtx2d(canvas);
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, withAlpha(color, 1));
  grad.addColorStop(0.4, withAlpha(color, 0.65));
  grad.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildShaftTexture(size: number): CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = getCtx2d(canvas);
  const v = ctx.createLinearGradient(0, 0, 0, size);
  v.addColorStop(0, 'rgba(255,233,184,0.5)');
  v.addColorStop(0.55, 'rgba(255,233,184,0.16)');
  v.addColorStop(1, 'rgba(255,233,184,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, size, 0);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,1)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildBirdTexture(size: number): CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = getCtx2d(canvas);
  ctx.strokeStyle = 'rgba(38,30,22,0.88)';
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.08, size * 0.58);
  ctx.quadraticCurveTo(size * 0.3, size * 0.28, size * 0.5, size * 0.48);
  ctx.quadraticCurveTo(size * 0.7, size * 0.28, size * 0.92, size * 0.58);
  ctx.stroke();
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NullVfxSystem implements VfxSystem {
  private readonly root = new Group();
  private tier: QualityTier = 'high';
  private time = 0;

  // dust
  private dustPoints: Points | null = null;
  private dustGeometry: BufferGeometry | null = null;
  private dustVelocities: Float32Array = new Float32Array(0);
  private dustActive = false;
  private readonly dustTexture: CanvasTexture;
  private dustMaterial: PointsMaterial | null = null;

  // gobo (dappled light shafts)
  private readonly goboGroup = new Group();
  private goboMeshes: Mesh[] = [];
  private goboIntensity = 0;
  private readonly goboTexture: CanvasTexture;
  private readonly goboGeometry = new PlaneGeometry(0.55, 2.6);

  // footlights
  private footlightsPoints: Points | null = null;
  private footlightsGeometry: BufferGeometry | null = null;
  private footlightsIntensity = 0;
  private readonly footlightsTexture: CanvasTexture;
  private footlightsMaterial: PointsMaterial | null = null;

  // birds
  private birdsPoints: Points | null = null;
  private birdsGeometry: BufferGeometry | null = null;
  private birdsBasePositions: Float32Array = new Float32Array(0);
  private birdsPhases: Float32Array = new Float32Array(0);
  private birdsActive = false;
  private readonly birdsTexture: CanvasTexture;
  private birdsMaterial: PointsMaterial | null = null;

  constructor() {
    this.dustTexture = buildDiscTexture('#5a4228', 48);
    this.footlightsTexture = buildDiscTexture('#ffd9a0', 64);
    this.goboTexture = buildShaftTexture(96);
    this.birdsTexture = buildBirdTexture(32);
    this.root.add(this.goboGroup);
    this.rebuildAll(TIER_COUNTS.high);
  }

  attach(parent: Object3D): void {
    parent.add(this.root);
  }

  setDust(active: boolean): void {
    this.dustActive = active;
    if (this.dustPoints) this.dustPoints.visible = active;
  }

  setGobo(intensity: number): void {
    this.goboIntensity = Math.max(0, Math.min(1, intensity));
    this.goboGroup.visible = this.goboIntensity > 0.001;
  }

  setFootlights(intensity: number): void {
    this.footlightsIntensity = Math.max(0, Math.min(1, intensity));
    if (this.footlightsPoints) this.footlightsPoints.visible = this.footlightsIntensity > 0.001;
  }

  setBirds(active: boolean): void {
    this.birdsActive = active;
    if (this.birdsPoints) this.birdsPoints.visible = active;
  }

  update(dt: number): void {
    this.time += dt;

    if (this.dustActive && this.dustGeometry) {
      const pos = this.dustGeometry.getAttribute('position');
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = (arr[i] ?? 0) + (this.dustVelocities[i] ?? 0) * dt;
        arr[i + 1] = (arr[i + 1] ?? 0) + (this.dustVelocities[i + 1] ?? 0) * dt;
        arr[i + 2] = (arr[i + 2] ?? 0) + (this.dustVelocities[i + 2] ?? 0) * dt;
        // gentle wrap so motes drift forever within the understage volume
        if (Math.abs(arr[i]! - 0) > DUST_SPREAD.x) this.dustVelocities[i] = -(this.dustVelocities[i] ?? 0);
        if (arr[i + 1]! > DUST_CENTER_Y + DUST_SPREAD.y) arr[i + 1] = DUST_CENTER_Y - DUST_SPREAD.y;
        if (Math.abs(arr[i + 2]! - 0) > DUST_SPREAD.z) this.dustVelocities[i + 2] = -(this.dustVelocities[i + 2] ?? 0);
      }
      pos.needsUpdate = true;
    }

    if (this.goboIntensity > 0.001) {
      for (let i = 0; i < this.goboMeshes.length; i++) {
        const mesh = this.goboMeshes[i];
        if (!mesh) continue;
        const material = mesh.material as MeshBasicMaterial;
        const flicker = 0.85 + 0.15 * Math.sin(this.time * 0.6 + i * 1.7);
        material.opacity = this.goboIntensity * 0.5 * flicker;
      }
    }

    if (this.footlightsMaterial) {
      const flicker = 0.92 + 0.08 * Math.sin(this.time * 5.2);
      this.footlightsMaterial.opacity = this.footlightsIntensity * flicker;
    }

    if (this.birdsActive && this.birdsGeometry) {
      const pos = this.birdsGeometry.getAttribute('position');
      const arr = pos.array as Float32Array;
      for (let i = 0; i < this.birdsPhases.length; i++) {
        const phase = (this.birdsPhases[i] ?? 0) + this.time * (1.6 + i * 0.2);
        const bx = this.birdsBasePositions[i * 3] ?? 0;
        const by = this.birdsBasePositions[i * 3 + 1] ?? 0;
        const bz = this.birdsBasePositions[i * 3 + 2] ?? 0;
        arr[i * 3] = bx + Math.sin(phase * 0.5) * 0.35;
        arr[i * 3 + 1] = by + Math.sin(phase) * 0.06;
        arr[i * 3 + 2] = bz;
      }
      pos.needsUpdate = true;
    }
  }

  applyQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.rebuildAll(TIER_COUNTS[tier]);
    if (this.dustPoints) this.dustPoints.visible = this.dustActive;
    this.goboGroup.visible = this.goboIntensity > 0.001;
    if (this.footlightsPoints) this.footlightsPoints.visible = this.footlightsIntensity > 0.001;
    if (this.birdsPoints) this.birdsPoints.visible = this.birdsActive;
  }

  dispose(): void {
    this.disposeDust();
    this.disposeGobo();
    this.disposeFootlights();
    this.disposeBirds();
    this.goboGeometry.dispose();
    this.dustTexture.dispose();
    this.footlightsTexture.dispose();
    this.goboTexture.dispose();
    this.birdsTexture.dispose();
    this.root.removeFromParent();
  }

  // ---- (re)build per QualityTier -------------------------------------------------------

  private rebuildAll(counts: TierCounts): void {
    this.rebuildDust(counts.dust);
    this.rebuildGobo(counts.goboShafts);
    this.rebuildFootlights(counts.footlights);
    this.rebuildBirds(counts.birds);
  }

  private rebuildDust(count: number): void {
    this.disposeDust();
    const rng = seededRandom(0xd057);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() * 2 - 1) * DUST_SPREAD.x;
      positions[i * 3 + 1] = DUST_CENTER_Y + (rng() * 2 - 1) * DUST_SPREAD.y;
      positions[i * 3 + 2] = (rng() * 2 - 1) * DUST_SPREAD.z;
      velocities[i * 3] = (rng() - 0.5) * 0.03;
      velocities[i * 3 + 1] = 0.015 + rng() * 0.02;
      velocities[i * 3 + 2] = (rng() - 0.5) * 0.03;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      map: this.dustTexture,
      size: 0.045,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.5
    });
    const points = new Points(geometry, material);
    points.visible = this.dustActive;
    points.frustumCulled = false;
    this.dustGeometry = geometry;
    this.dustMaterial = material;
    this.dustVelocities = velocities;
    this.dustPoints = points;
    this.root.add(points);
  }

  private disposeDust(): void {
    if (this.dustPoints) this.root.remove(this.dustPoints);
    this.dustGeometry?.dispose();
    this.dustMaterial?.dispose();
    this.dustGeometry = null;
    this.dustMaterial = null;
    this.dustPoints = null;
  }

  private rebuildGobo(count: number): void {
    this.disposeGoboMeshes();
    const rng = seededRandom(0x6067);
    for (let i = 0; i < count; i++) {
      const material = new MeshBasicMaterial({
        map: this.goboTexture,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        opacity: 0
      });
      const mesh = new Mesh(this.goboGeometry, material);
      const t = count === 1 ? 0.5 : i / (count - 1);
      mesh.position.set((t * 2 - 1) * GOBO_SPAN_X, GOBO_Y, -0.6 + (rng() - 0.5) * 0.6);
      mesh.rotation.z = (rng() - 0.5) * 0.35;
      mesh.rotation.x = -0.15 + (rng() - 0.5) * 0.1;
      this.goboMeshes.push(mesh);
      this.goboGroup.add(mesh);
    }
  }

  private disposeGoboMeshes(): void {
    for (const mesh of this.goboMeshes) {
      this.goboGroup.remove(mesh);
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.goboMeshes = [];
  }

  private disposeGobo(): void {
    this.disposeGoboMeshes();
  }

  private rebuildFootlights(count: number): void {
    this.disposeFootlights();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      positions[i * 3] = (t * 2 - 1) * FOOTLIGHT_SPAN_X;
      positions[i * 3 + 1] = FOOTLIGHT_Y;
      positions[i * 3 + 2] = FOOTLIGHT_Z;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      map: this.footlightsTexture,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity: 0
    });
    const points = new Points(geometry, material);
    points.visible = this.footlightsIntensity > 0.001;
    points.frustumCulled = false;
    this.footlightsGeometry = geometry;
    this.footlightsMaterial = material;
    this.footlightsPoints = points;
    this.root.add(points);
  }

  private disposeFootlights(): void {
    if (this.footlightsPoints) this.root.remove(this.footlightsPoints);
    this.footlightsGeometry?.dispose();
    this.footlightsMaterial?.dispose();
    this.footlightsGeometry = null;
    this.footlightsMaterial = null;
    this.footlightsPoints = null;
  }

  private rebuildBirds(count: number): void {
    this.disposeBirds();
    const rng = seededRandom(0xb12d);
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      positions[i * 3] = (t * 2 - 1) * BIRD_SPAN_X;
      positions[i * 3 + 1] = BIRD_Y + (rng() - 0.5) * 0.3;
      positions[i * 3 + 2] = BIRD_Z + (rng() - 0.5) * 0.4;
      phases[i] = rng() * Math.PI * 2;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions.slice(), 3));
    const material = new PointsMaterial({
      map: this.birdsTexture,
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      opacity: 0.92
    });
    const points = new Points(geometry, material);
    points.visible = this.birdsActive;
    points.frustumCulled = false;
    this.birdsGeometry = geometry;
    this.birdsMaterial = material;
    this.birdsBasePositions = positions;
    this.birdsPhases = phases;
    this.birdsPoints = points;
    this.root.add(points);
  }

  private disposeBirds(): void {
    if (this.birdsPoints) this.root.remove(this.birdsPoints);
    this.birdsGeometry?.dispose();
    this.birdsMaterial?.dispose();
    this.birdsGeometry = null;
    this.birdsMaterial = null;
    this.birdsPoints = null;
  }
}

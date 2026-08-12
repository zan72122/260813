// src/vfx/waterJet.ts
// The #1 hero VFX: createWaterJet('fan'|'ring'|'crown'). All fake physics —
// NO fluid simulation. Each jet is a small cluster of tapered, additive-
// leaning translucent "water strand" meshes (procedural cylinder geometry,
// no external assets) that stage-grow from a single thin central jet up to
// the full fan/ring/crown silhouette as setIntensity(0..1) rises, plus a
// shared droplet spray + base mist particle emitter (budgeted, see
// particlePool.ts).

import * as THREE from 'three';
import type { QualityTier } from '../contracts';
import { DropletEmitter } from './droplets';

export type WaterJetKind = 'fan' | 'ring' | 'crown';

export interface WaterJet {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setIntensity(v: number): void;
  dispose(): void;
}

const WATER_BASE_COLOR = new THREE.Color('#3f8fa0');
const WATER_FOAM_COLOR = new THREE.Color('#f4fbfb');

const STRAND_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STRAND_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform vec3 uBaseColor;
  uniform vec3 uFoamColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  void main() {
    // Foam only right at the spray tip — most of the column reads as
    // translucent teal water, not a solid white shape.
    float foam = smoothstep(0.85, 1.0, vUv.y);
    vec3 color = mix(uBaseColor, uFoamColor, foam);
    float fresnel = pow(1.0 - clamp(abs(vNormalView.z), 0.0, 1.0), 2.4);
    // Deliberately modest alpha: this is normal (not additive) blending, so
    // overlapping strands compose like real translucent water instead of
    // stacking into a blown-out white cloud.
    float alpha = uOpacity * (0.2 + 0.32 * fresnel) * mix(0.45, 0.8, foam);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

function createWaterBodyMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: STRAND_VERTEX,
    fragmentShader: STRAND_FRAGMENT,
    uniforms: {
      uBaseColor: { value: WATER_BASE_COLOR.clone() },
      uFoamColor: { value: WATER_FOAM_COLOR.clone() },
      uOpacity: { value: 0.85 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
  });
  // Keep the water's color punchy/legible regardless of the scene's ACES
  // tone mapping curve — a common technique for stylized VFX shaders so
  // translucent color reads as water instead of washing toward white.
  material.toneMapped = false;
  return material;
}

function createStrandGeometry(height: number, baseRadius: number, radialSegments: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(baseRadius * 1.15, baseRadius * 0.55, height, radialSegments, 6, true);
  geo.translate(0, height / 2, 0);
  return geo;
}

interface StrandSpec {
  x: number;
  z: number;
  tiltX: number;
  tiltZ: number;
  height: number;
  baseRadius: number;
  threshold: number; // intensity at which this strand starts appearing
}

function strandCountForTier(kind: WaterJetKind, tier: QualityTier): number {
  const table: Record<WaterJetKind, Record<QualityTier, number>> = {
    fan: { low: 4, medium: 6, high: 9 },
    ring: { low: 5, medium: 7, high: 10 },
    crown: { low: 3, medium: 5, high: 8 }, // surrounding-ring count; +1 central always
  };
  return table[kind][tier];
}

function buildStrandSpecs(kind: WaterJetKind, tier: QualityTier): StrandSpec[] {
  const specs: StrandSpec[] = [];
  if (kind === 'fan') {
    const n = strandCountForTier('fan', tier);
    const center = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(i - center);
      const maxDist = Math.max(1, center);
      const spread = ((i - center) / maxDist) * 0.62; // radians of outward tilt
      specs.push({
        x: (i - center) * 0.09,
        z: 0,
        tiltX: 0,
        tiltZ: spread,
        height: 1.0 - dist * 0.05,
        baseRadius: 0.05 - dist * 0.003,
        threshold: (dist / maxDist) * 0.82,
      });
    }
  } else if (kind === 'ring') {
    const n = strandCountForTier('ring', tier);
    const radius = 0.62;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      specs.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        tiltX: Math.sin(angle) * 0.18,
        tiltZ: -Math.cos(angle) * 0.18,
        height: 0.72,
        baseRadius: 0.045,
        threshold: (i / n) * 0.85,
      });
    }
  } else {
    // crown: tall central spike (threshold 0) + surrounding shorter ring.
    specs.push({ x: 0, z: 0, tiltX: 0, tiltZ: 0, height: 1.35, baseRadius: 0.07, threshold: 0 });
    const n = strandCountForTier('crown', tier);
    const radius = 0.5;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      specs.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        tiltX: Math.sin(angle) * 0.22,
        tiltZ: -Math.cos(angle) * 0.22,
        height: 0.5,
        baseRadius: 0.04,
        threshold: 0.15 + (i / n) * 0.75,
      });
    }
  }
  return specs;
}

function particleBudgetForTier(tier: QualityTier): { spray: number; mist: number } {
  switch (tier) {
    case 'low':
      return { spray: 60, mist: 18 };
    case 'medium':
      return { spray: 110, mist: 32 };
    case 'high':
      return { spray: 170, mist: 50 };
  }
}

export function createWaterJet(kind: WaterJetKind, quality: QualityTier = 'high'): WaterJet {
  const group = new THREE.Group();
  group.name = `vfx-water-jet-${kind}`;

  const material = createWaterBodyMaterial();
  const specs = buildStrandSpecs(kind, quality);
  const strands = specs.map((spec) => {
    const geo = createStrandGeometry(spec.height, spec.baseRadius, 8);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(spec.x, 0, spec.z);
    mesh.rotation.set(spec.tiltX, 0, spec.tiltZ);
    mesh.scale.set(0.0001, 0.0001, 0.0001);
    mesh.visible = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    return { mesh, geo, spec };
  });

  const budget = particleBudgetForTier(quality);
  const spray = new DropletEmitter({
    requestedCount: budget.spray,
    color: WATER_FOAM_COLOR.clone(),
    baseSize: 3,
    gravity: 2.4,
    lifetimeRange: [0.4, 0.85],
    peakAlpha: 0.55,
  });
  spray.points.renderOrder = 3;
  group.add(spray.points);

  // Fine mist hugs the base — short-lived, low, small — rather than
  // billowing up to cover the whole jet silhouette.
  const mist = new DropletEmitter({
    requestedCount: budget.mist,
    color: WATER_BASE_COLOR.clone().lerp(new THREE.Color('#ffffff'), 0.7),
    baseSize: 3,
    gravity: 0.35,
    lifetimeRange: [0.5, 1.0],
    peakAlpha: 0.4,
  });
  mist.points.renderOrder = 1;
  group.add(mist.points);

  let current = 0;
  let target = 0;
  let spawnAccumulator = 0;
  const scratchOrigin = new THREE.Vector3();

  // Droplets fly outward from each strand's own position (not just straight
  // up) so the spray disperses into a wide umbrella matching the jet's
  // fan/ring/crown silhouette instead of clumping into a ball above it.
  const scratchOutward = new THREE.Vector2();
  function randomSprayVelocity(spec: StrandSpec): THREE.Vector3 {
    scratchOutward.set(spec.x, spec.z);
    if (scratchOutward.lengthSq() < 1e-6) scratchOutward.set(Math.random() - 0.5, Math.random() - 0.5);
    scratchOutward.normalize();
    const outwardSpeed = 0.55 + Math.random() * 1.0;
    const jitter = 0.4;
    const upward = 0.8 + Math.random() * 0.75;
    return new THREE.Vector3(
      scratchOutward.x * outwardSpeed + (Math.random() - 0.5) * jitter,
      upward,
      scratchOutward.y * outwardSpeed + (Math.random() - 0.5) * jitter,
    );
  }

  function randomMistVelocity(): THREE.Vector3 {
    return new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.03 + Math.random() * 0.08, (Math.random() - 0.5) * 0.3);
  }

  return {
    group,
    update(dt: number, _elapsed: number): void {
      current += (target - current) * Math.min(1, dt * 3.2);

      for (const s of strands) {
        const window = 0.18;
        const g = Math.max(0, Math.min(1, (current - s.spec.threshold) / window));
        if (g <= 0.001) {
          s.mesh.visible = false;
          continue;
        }
        s.mesh.visible = true;
        const radialGrow = 0.3 + 0.7 * g;
        s.mesh.scale.set(radialGrow, g, radialGrow);
      }

      if (current > 0.03) {
        spawnAccumulator += dt * (10 + current * 55);
        const grownStrands = strands.filter((s) => s.mesh.visible);
        while (spawnAccumulator >= 1 && grownStrands.length > 0) {
          spawnAccumulator -= 1;
          const s = grownStrands[Math.floor(Math.random() * grownStrands.length)];
          if (!s) continue;
          scratchOrigin.set(s.spec.x, s.spec.height * s.mesh.scale.y * 0.96, s.spec.z);
          spray.spawn(1, scratchOrigin, () => randomSprayVelocity(s.spec));
        }
        if (Math.random() < dt * (2 + current * 6)) {
          scratchOrigin.set((Math.random() - 0.5) * 0.9, 0.02, (Math.random() - 0.5) * 0.9);
          mist.spawn(1, scratchOrigin, randomMistVelocity);
        }
      }

      spray.update(dt);
      mist.update(dt);
    },
    setIntensity(v: number): void {
      target = Math.max(0, Math.min(1, v));
    },
    dispose(): void {
      material.dispose();
      for (const s of strands) s.geo.dispose();
      spray.dispose();
      mist.dispose();
    },
  };
}

// src/vfx/waterJet.ts
// The #1 hero VFX: createWaterJet('fan'|'ring'|'crown'). All fake physics —
// NO fluid simulation. Each jet is a bundle of THIN parabolic-arc water
// streams (simple projectile math: y = vy*t - 1/2*g*t^2), one merged
// BufferGeometry + a single shared shader per jet (cheap: one draw call for
// the whole water body). setIntensity(0..1) drives a "reveal length" per
// stream via a baked-in per-vertex threshold, so the water visibly climbs
// outward along each arc as it grows — literal rising/falling streams, not
// a scale-up blob. Small, low-opacity foam/mist particles are budgeted via
// the shared particlePool and clustered only where streams actually land.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityTier } from '../contracts';
import { DropletEmitter } from './droplets';

export type WaterJetKind = 'fan' | 'ring' | 'crown';

export interface WaterJet {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setIntensity(v: number): void;
  dispose(): void;
}

// "透明で朝の光にきらめく水" — transparent, sparkling morning water. Kept
// deliberately unsaturated/translucent; foam is reserved for the tip/landing
// zone only so large areas never approach flat white.
const WATER_BASE_COLOR = new THREE.Color('#2c7288');
const WATER_FOAM_COLOR = new THREE.Color('#eef9fa');
const GRAVITY = 2.4; // stylized, not real 9.8 — keeps arcs compact & readable

const JET_VERTEX = /* glsl */ `
  attribute float aThreshold;
  varying vec2 vUv;
  varying float vThreshold;
  varying float vViewDist;
  void main() {
    vUv = uv;
    vThreshold = aThreshold;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDist = length(mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// vUv.y runs 0->1 along an individual stream's own arc length; vUv.x runs
// 0->1 around its thin circumference. Growth reveals fragments up to
// `revealLen` (driven by uIntensity vs. this stream's baked threshold) so at
// low intensity only a short stub near the nozzle is visible, climbing
// outward as intensity rises — never a big blown-out area.
const JET_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uIntensity;
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uFoamColor;
  varying vec2 vUv;
  varying float vThreshold;
  varying float vViewDist;
  void main() {
    float window = 0.26;
    float local = clamp((uIntensity - vThreshold) / window, 0.0, 1.0);
    if (local <= 0.001) discard;
    float revealLen = local;
    if (vUv.y > revealLen + 0.015) discard;

    float leadEdge = smoothstep(revealLen - 0.12, revealLen, vUv.y);
    // Flowing streak variation along the stream reads as moving water
    // rather than a static translucent tube.
    float streak = 0.8 + 0.2 * sin(vUv.y * 46.0 - uTime * 5.5 + vUv.x * 6.283);
    // Cheap fake specular: bright band on one side of the thin tube only.
    float rim = pow(abs(sin(vUv.x * 3.14159265)), 3.0);

    float landingFoam = smoothstep(0.9, 1.0, vUv.y) * smoothstep(0.88, 1.0, local);
    float foamMix = clamp(leadEdge * 0.3 + landingFoam * 0.85, 0.0, 1.0);
    vec3 color = mix(uBaseColor, uFoamColor, foamMix);

    // Defensive near-camera fade: cinematic camera transitions can briefly
    // put the camera very close to or "inside" a strand (e.g. mid-blend
    // between two cinematic keyframes). Without this, a wall of dozens of
    // nearly-coincident translucent fragments right at the lens reads as a
    // solid white blowout no matter how low each fragment's own alpha is.
    float nearFade = smoothstep(0.06, 0.5, vViewDist);

    float startFade = smoothstep(0.0, 0.05, vUv.y);
    float alpha = (0.2 + 0.16 * rim) * streak * (0.35 + 0.65 * leadEdge) * startFade;
    alpha = clamp((alpha + landingFoam * 0.22) * nearFade, 0.0, 0.5);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function createJetMaterial(): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: JET_VERTEX,
    fragmentShader: JET_FRAGMENT,
    uniforms: {
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uBaseColor: { value: WATER_BASE_COLOR.clone() },
      uFoamColor: { value: WATER_FOAM_COLOR.clone() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
  // No renderer.toneMapping is set in this project (NoToneMapping default),
  // but keep this defensively false so the shader's own careful alpha
  // ceiling is what determines brightness, not a tone curve.
  material.toneMapped = false;
  return material;
}

interface StreamSpec {
  /** Horizontal (XZ) unit launch direction; (0,0) only for a purely vertical stream. */
  dir: THREE.Vector2;
  landDistance: number;
  peakHeight: number;
  /** Intensity at which this stream starts revealing (0..~0.8). */
  threshold: number;
  radius: number;
  isCentral?: boolean;
  /** Filled in by buildJetGeometry from the actual sampled arc — local space. */
  landingPoint: THREE.Vector3;
}

function countForTier(kind: WaterJetKind, tier: QualityTier): number {
  const table: Record<WaterJetKind, Record<QualityTier, number>> = {
    fan: { low: 5, medium: 7, high: 9 },
    ring: { low: 6, medium: 8, high: 11 },
    crown: { low: 4, medium: 5, high: 7 }, // surrounding-ring count; +1 central always
  };
  return table[kind][tier];
}

function tubeResForTier(tier: QualityTier): { tubular: number; radial: number } {
  switch (tier) {
    case 'low':
      return { tubular: 12, radial: 5 };
    case 'medium':
      return { tubular: 16, radial: 6 };
    case 'high':
      return { tubular: 22, radial: 8 };
  }
}

function buildStreamSpecs(kind: WaterJetKind, tier: QualityTier): StreamSpec[] {
  const specs: StreamSpec[] = [];
  if (kind === 'fan') {
    const n = countForTier('fan', tier);
    const spreadDeg = 78;
    for (let i = 0; i < n; i++) {
      const tNorm = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
      const angle = THREE.MathUtils.degToRad(tNorm * (spreadDeg / 2));
      const edge = Math.abs(tNorm);
      specs.push({
        dir: new THREE.Vector2(Math.sin(angle), Math.cos(angle)),
        landDistance: 0.55 + edge * 0.28,
        peakHeight: 0.92 - edge * 0.32,
        threshold: edge * 0.72,
        radius: 0.032 - edge * 0.006,
        landingPoint: new THREE.Vector3(),
      });
    }
  } else if (kind === 'ring') {
    const n = countForTier('ring', tier);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      specs.push({
        dir: new THREE.Vector2(Math.sin(angle), Math.cos(angle)),
        landDistance: 0.8,
        peakHeight: 0.6,
        threshold: (i / n) * 0.72,
        radius: 0.03,
        landingPoint: new THREE.Vector3(),
      });
    }
  } else {
    // crown: tall near-vertical central spike (threshold 0) + a surrounding
    // ring of shorter arcs, per MASTER_SPEC "中央高噴流＋低い周囲噴流".
    specs.push({
      dir: new THREE.Vector2(0.12, 0.99),
      landDistance: 0.16,
      peakHeight: 1.3,
      threshold: 0,
      radius: 0.05,
      isCentral: true,
      landingPoint: new THREE.Vector3(),
    });
    const n = countForTier('crown', tier);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      specs.push({
        dir: new THREE.Vector2(Math.sin(angle), Math.cos(angle)),
        landDistance: 0.5,
        peakHeight: 0.48,
        threshold: 0.16 + (i / n) * 0.56,
        radius: 0.026,
        landingPoint: new THREE.Vector3(),
      });
    }
  }
  return specs;
}

/** Samples one stream's parabolic arc, tags it with its threshold, and records its landing point. */
function buildStreamGeometry(spec: StreamSpec, tubularSegments: number, radialSegments: number): THREE.BufferGeometry {
  const vy = Math.sqrt(2 * GRAVITY * Math.max(0.03, spec.peakHeight));
  const totalT = (2 * vy) / GRAVITY;
  const vh = spec.landDistance / Math.max(0.0001, totalT);
  const segs = Math.max(6, spec.isCentral ? Math.round(tubularSegments * 1.1) : tubularSegments);

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * totalT;
    const y = Math.max(0, vy * t - 0.5 * GRAVITY * t * t);
    const dist = vh * t;
    points.push(new THREE.Vector3(spec.dir.x * dist, y, spec.dir.y * dist));
  }
  spec.landingPoint.copy(points[points.length - 1] ?? new THREE.Vector3());

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.35);
  const geo = new THREE.TubeGeometry(curve, segs, spec.radius, radialSegments, false);
  const vertexCount = geo.getAttribute('position').count;
  geo.setAttribute('aThreshold', new THREE.BufferAttribute(new Float32Array(vertexCount).fill(spec.threshold), 1));
  return geo;
}

function buildJetGeometry(specs: StreamSpec[], tubularSegments: number, radialSegments: number): THREE.BufferGeometry {
  const parts = specs.map((spec) => buildStreamGeometry(spec, tubularSegments, radialSegments));
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) {
    throw new Error('vfx: failed to merge water jet stream geometries (mismatched attributes).');
  }
  return merged;
}

interface ParticleBudget {
  foam: number;
  mist: number;
}

function particleBudgetForTier(tier: QualityTier): ParticleBudget {
  switch (tier) {
    case 'low':
      return { foam: 14, mist: 8 };
    case 'medium':
      return { foam: 22, mist: 12 };
    case 'high':
      return { foam: 32, mist: 18 };
  }
}

export function createWaterJet(kind: WaterJetKind, quality: QualityTier = 'high'): WaterJet {
  const group = new THREE.Group();
  group.name = `vfx-water-jet-${kind}`;

  const specs = buildStreamSpecs(kind, quality);
  const res = tubeResForTier(quality);
  const geometry = buildJetGeometry(specs, res.tubular, res.radial);
  const material = createJetMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `vfx-water-jet-${kind}-body`;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false; // arcs land far from the merged geometry's own origin-centered bounds
  group.add(mesh);

  // Small, low-opacity foam right where streams land + a faint low veil of
  // mist at the base — never big soft blobs, per the water-readability fix.
  const budget = particleBudgetForTier(quality);
  const landingFoam = new DropletEmitter({
    requestedCount: budget.foam,
    color: WATER_FOAM_COLOR.clone(),
    baseSize: 2.1,
    gravity: 2.0,
    lifetimeRange: [0.25, 0.5],
    peakAlpha: 0.4,
  });
  landingFoam.points.renderOrder = 3;
  group.add(landingFoam.points);

  const mist = new DropletEmitter({
    requestedCount: budget.mist,
    color: WATER_BASE_COLOR.clone().lerp(new THREE.Color('#ffffff'), 0.75),
    baseSize: 2.8,
    gravity: 0.3,
    lifetimeRange: [0.4, 0.7],
    peakAlpha: 0.2,
  });
  mist.points.renderOrder = 1;
  group.add(mist.points);

  let current = 0;
  let target = 0;
  let spawnAccumulator = 0;
  const scratch = new THREE.Vector3();

  return {
    group,
    update(dt: number, elapsed: number): void {
      current += (target - current) * Math.min(1, dt * 3.5);
      const u = material.uniforms;
      u.uIntensity!.value = current;
      u.uTime!.value = elapsed;

      if (current > 0.05) {
        spawnAccumulator += dt * (4 + current * 11);
        while (spawnAccumulator >= 1) {
          spawnAccumulator -= 1;
          const active = specs.filter((s) => current - s.threshold > 0.16);
          const chosen = active[Math.floor(Math.random() * active.length)];
          if (!chosen) break;
          // Jitter the spawn position itself (not just velocity) so foam at
          // a shared landing zone (e.g. crown's central spike) spreads into
          // a small cluster of droplets rather than one bright point.
          scratch.set(
            chosen.landingPoint.x + (Math.random() - 0.5) * 0.16,
            chosen.landingPoint.y,
            chosen.landingPoint.z + (Math.random() - 0.5) * 0.16,
          );
          landingFoam.spawn(
            1,
            scratch,
            () => new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.28 + Math.random() * 0.28, (Math.random() - 0.5) * 0.3),
          );
        }
        if (Math.random() < dt * (2.5 + current * 4)) {
          scratch.set((Math.random() - 0.5) * 0.45, 0.015, (Math.random() - 0.5) * 0.45);
          mist.spawn(
            1,
            scratch,
            () => new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.04 + Math.random() * 0.06, (Math.random() - 0.5) * 0.15),
          );
        }
      }
      landingFoam.update(dt);
      mist.update(dt);
    },
    setIntensity(v: number): void {
      target = Math.max(0, Math.min(1, v));
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
      landingFoam.dispose();
      mist.dispose();
    },
  };
}

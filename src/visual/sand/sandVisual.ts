/**
 * One leg's full sand visual: InstancedMesh grains (capped at
 * QualityState.particleMax), a heightfield sand surface (≤40×40 grid)
 * inside the sandbox cutaway, a scrolling-UV stream from the gate, and a
 * small pile growing below. All parented under the leg's sandAnchor
 * (scene/props/legGroundRig.ts) so their local coordinates are relative to
 * the sandbox's interior floor.
 */
import * as THREE from 'three';
import type { LegId } from '../../contracts/types';
import type { HeroMaterials } from '../../render/materials';
import {
  grainCountForLevel,
  pileHeightForLevel,
  pileRadiusForLevel,
  streamOpacityForRate,
  streamScrollSpeedForRate,
  streamWidthForRate,
} from './mappings';

/** Hard cap on heightfield grid resolution per axis — PERFORMANCE_BUDGET "heightfield砂面(≤40×40 grid)". */
export const HEIGHTFIELD_MAX_SEGMENTS = 40;

const SURFACE_NOISE_AMPLITUDE = 0.035;
const MAX_PILE_HEIGHT = 0.55;
const MAX_PILE_RADIUS = 0.6;
const STREAM_LENGTH = 1.6;

function seededNoise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SandGrainField {
  mesh: THREE.InstancedMesh;
  slots: { x: number; z: number; jitterY: number }[];
}

function buildGrainField(material: THREE.Material, width: number, depth: number, maxCount: number, seed: number): SandGrainField {
  const rng = seededNoise(seed);
  const slots = Array.from({ length: Math.max(1, maxCount) }, () => ({
    x: (rng() - 0.5) * width * 0.94,
    z: (rng() - 0.5) * depth * 0.94,
    jitterY: rng() * 0.03,
  }));
  const geometry = new THREE.TetrahedronGeometry(0.045, 0);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, maxCount));
  mesh.count = 0;
  return { mesh, slots };
}

/** Repositions/hides grain instances for the current visible `count` and `surfaceY`. Only the grains get a per-frame CPU update, per PERFORMANCE_BUDGET's explicit exception. */
export function updateGrainField(field: SandGrainField, count: number, surfaceY: number): void {
  const n = Math.max(0, Math.min(count, field.slots.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const slot = field.slots[i];
    if (!slot) continue;
    m.compose(new THREE.Vector3(slot.x, surfaceY + slot.jitterY, slot.z), q, s);
    field.mesh.setMatrixAt(i, m);
  }
  field.mesh.count = n;
  field.mesh.instanceMatrix.needsUpdate = true;
}

function buildHeightfieldSurface(material: THREE.Material, width: number, depth: number, seed: number): THREE.Mesh {
  const segX = Math.min(HEIGHTFIELD_MAX_SEGMENTS, 24);
  const segZ = Math.min(HEIGHTFIELD_MAX_SEGMENTS, 24);
  const geometry = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geometry.rotateX(-Math.PI / 2);
  const rng = seededNoise(seed ^ 0x51ed);
  const pos = geometry.attributes.position;
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (rng() - 0.5) * SURFACE_NOISE_AMPLITUDE);
    }
    pos.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Authored at unit width; actual on-screen width is driven via `mesh.scale.x` each frame (mappings.ts streamWidthForRate). */
const STREAM_UNIT_WIDTH = 1;

function buildStream(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(STREAM_UNIT_WIDTH, STREAM_LENGTH, 1, 8);
  geometry.translate(0, -STREAM_LENGTH / 2, 0); // top edge at local origin (the gate opening)
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  return mesh;
}

function buildPile(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.ConeGeometry(1, 1, 10);
  geometry.translate(0, 0.5, 0); // base at local origin
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(0.001, 0.001, 0.001);
  mesh.castShadow = true;
  return mesh;
}

export interface LegSandVisual {
  group: THREE.Group; // parent under the leg's sandAnchor
  grains: SandGrainField;
  surface: THREE.Mesh;
  stream: THREE.Mesh;
  pile: THREE.Mesh;
  floorY: number;
  fullY: number;
}

/** Builds one leg's full sand visual set. `footprint` is the sandbox's interior width/depth (legGroundRig.ts's `sandboxInterior`). `particleMax` is QualityState.particleMax at build time (rebuilt on quality downgrade — see render/index.ts). */
export function buildLegSandVisual(
  leg: LegId,
  materials: HeroMaterials,
  footprint: { width: number; depth: number },
  particleMax: number,
): LegSandVisual {
  const group = new THREE.Group();

  const fullY = footprint.depth * 0.32; // sand piled a bit above the floor when full
  const floorY = 0.01;

  const grains = buildGrainField(materials.sand, footprint.width, footprint.depth, particleMax, 0x9e17 + leg * 7919);
  group.add(grains.mesh);

  const surface = buildHeightfieldSurface(materials.sand, footprint.width, footprint.depth, 0x33ab + leg * 613);
  group.add(surface);

  const stream = buildStream(materials.sandStream);
  stream.position.set(0, 0, 0);
  group.add(stream);

  const pile = buildPile(materials.sand);
  group.add(pile);

  return { group, grains, surface, stream, pile, floorY, fullY };
}

/** Per-frame sand visual update from live LegState fields + the current QualityState.particleMax + the current sandFlow rate (from render/liveSignals.ts — sandFlow is not part of GameState). */
export function updateLegSandVisual(visual: LegSandVisual, sandLevel: number, particleMax: number, flowRate: number): void {
  const surfaceY = visual.floorY + Math.max(0, Math.min(1, sandLevel)) * (visual.fullY - visual.floorY);
  visual.surface.position.y = surfaceY;

  const grainCount = grainCountForLevel(sandLevel, particleMax);
  updateGrainField(visual.grains, grainCount, surfaceY);

  const pileH = pileHeightForLevel(sandLevel, MAX_PILE_HEIGHT);
  const pileR = pileRadiusForLevel(sandLevel, MAX_PILE_RADIUS);
  visual.pile.scale.set(Math.max(0.001, pileR), Math.max(0.001, pileH), Math.max(0.001, pileR));

  const width = streamWidthForRate(flowRate);
  const opacity = streamOpacityForRate(flowRate);
  visual.stream.visible = opacity > 0.01;
  visual.stream.scale.set(width, 1, 1);
  const mat = visual.stream.material as THREE.MeshBasicMaterial;
  mat.opacity = opacity;
}

/**
 * Advances a stream mesh's texture scrolling UV offset — the "scrolling-UV
 * stream mesh" PERFORMANCE_BUDGET.md calls for. Faster `flowRate` scrolls
 * faster (mappings.ts streamScrollSpeedForRate), so the stream reads as
 * continuously falling sand whose speed visibly tracks gate openness.
 * Called every fixed tick (not just when the visible parameters change) so
 * the motion stays smooth and framerate-independent. Takes the stream mesh
 * directly (not the whole LegSandVisual) — it only ever touches the
 * texture offset, and this keeps it trivially testable with a bare mesh.
 * A no-op if the material has no texture (nothing to scroll).
 */
export function advanceStreamScroll(streamMesh: THREE.Mesh, dtSeconds: number, flowRate: number): void {
  const mat = streamMesh.material as THREE.MeshBasicMaterial;
  const tex = mat.map;
  if (!tex) return;
  tex.offset.y -= streamScrollSpeedForRate(flowRate) * dtSeconds;
}

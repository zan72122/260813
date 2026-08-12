/**
 * Timber scaffolding geometry: all 4 legs' pole+brace segments combined
 * into a single InstancedMesh (PERFORMANCE_BUDGET "足場…はInstancedMesh").
 */
import * as THREE from 'three';
import { allScaffoldSegments } from './scaffoldMath';
import { buildBarInstancedMesh } from '../segmentInstancing';

/** Cross-section thickness (world units) of one scaffold timber pole/brace. */
export const SCAFFOLD_TIMBER_THICKNESS = 0.16;

/** Builds the combined scaffolding InstancedMesh for all 4 legs. */
export function buildScaffold(material: THREE.Material, height: number): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const segments = allScaffoldSegments(height);
  const mesh = buildBarInstancedMesh(geometry, material, segments, SCAFFOLD_TIMBER_THICKNESS);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

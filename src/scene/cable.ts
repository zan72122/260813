/**
 * The one continuous thick steel cable: sheave carriage -> around the big
 * pulley -> up through the earth cutaway -> up the leg corridor to the
 * carrier's current position. A single TubeGeometry rebuilt each rendered
 * frame (path shape depends on live arc length) with a scrolling texture
 * offset so the travel direction reads by motion, not just color
 * (VISUAL_ACCEPTANCE "Color-coded causality").
 *
 * Geometry is swapped (not endlessly re-tracked) each rebuild: the old
 * BufferGeometry is disposed and released from the registry immediately,
 * so a long play session never grows the dispose registry (PERFORMANCE_
 * BUDGET "JS heap growth ~0").
 */

import * as THREE from 'three';

import { TRACK_LENGTH } from '../contracts/constants.ts';
import { trackPoint } from '../game/track.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';

const CABLE_RADIUS = 0.13;
const MAX_TRACK_SAMPLES = 34;
/** Texture repeats scrolled per meter of cable travel (visual tuning, not a contract quantity). */
const SCROLL_PER_METER = 0.18;

export interface CableRig {
  readonly mesh: THREE.Mesh;
  update(params: {
    readonly carriagePosition: THREE.Vector3;
    readonly pulleyCenter: THREE.Vector3;
    readonly pulleyRadiusVisual: number;
    readonly exitPoint: THREE.Vector3;
    readonly arcLength: number;
    readonly cableTravel: number;
  }): void;
  dispose(): void;
}

export function buildCable(materials: MaterialLibrary, registry: DisposeRegistry): CableRig {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), materials.cable);
  let currentGeometry: THREE.BufferGeometry | null = null;

  function update(params: {
    readonly carriagePosition: THREE.Vector3;
    readonly pulleyCenter: THREE.Vector3;
    readonly pulleyRadiusVisual: number;
    readonly exitPoint: THREE.Vector3;
    readonly arcLength: number;
    readonly cableTravel: number;
  }): void {
    const { carriagePosition, pulleyCenter, pulleyRadiusVisual, exitPoint, arcLength, cableTravel } = params;
    const points: THREE.Vector3[] = [];
    points.push(carriagePosition.clone().add(new THREE.Vector3(0, 0.25, 0)));
    points.push(new THREE.Vector3(pulleyCenter.x - pulleyRadiusVisual * 1.35, carriagePosition.y + 0.25, 0));
    points.push(pulleyCenter.clone().add(new THREE.Vector3(0, -pulleyRadiusVisual, 0)));
    points.push(pulleyCenter.clone().add(new THREE.Vector3(pulleyRadiusVisual * 0.85, pulleyRadiusVisual * 0.5, 0)));
    points.push(pulleyCenter.clone().add(new THREE.Vector3(0, pulleyRadiusVisual * 1.05, 0)));
    points.push(new THREE.Vector3((pulleyCenter.x + exitPoint.x) / 2, pulleyCenter.y + pulleyRadiusVisual + 1.2, 0));
    points.push(exitPoint.clone());

    const clampedArc = Math.min(TRACK_LENGTH, Math.max(0, arcLength));
    const sampleCount = Math.max(2, Math.min(MAX_TRACK_SAMPLES, Math.ceil((clampedArc / TRACK_LENGTH) * MAX_TRACK_SAMPLES) + 1));
    for (let i = 1; i <= sampleCount; i += 1) {
      const s = (i / sampleCount) * clampedArc;
      const [x, y] = trackPoint(s);
      points.push(new THREE.Vector3(x, y, 0));
    }

    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.15);
    const tubeSegments = Math.max(16, points.length * 3);
    const nextGeometry = new THREE.TubeGeometry(curve, tubeSegments, CABLE_RADIUS, 8, false);

    mesh.geometry = nextGeometry;
    if (currentGeometry) {
      registry.release(currentGeometry);
      currentGeometry.dispose();
    }
    currentGeometry = nextGeometry;
    registry.track(currentGeometry);

    const map = materials.cable.map;
    if (map) {
      map.offset.y = (cableTravel * SCROLL_PER_METER) % 1;
    }
  }

  return {
    mesh,
    update,
    dispose(): void {
      if (currentGeometry) {
        registry.release(currentGeometry);
        currentGeometry.dispose();
        currentGeometry = null;
      }
    },
  };
}

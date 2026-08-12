// src/scenes/build/pipes.ts
// Underground pipe cutaway: one TubeGeometry per fountain routed from the
// valve (src/scenes/anchors.ts pipeCurves), visible once the camera descends
// below y=0 during pipe-run (ordinary depth occlusion against the opaque
// single-sided lawn plane does the "cutaway" for free — no shader needed).

import * as THREE from 'three';
import type { FountainId } from '../../contracts';
import { getSceneAnchors } from '../anchors';
import { brassMaterial, waterMaterial } from './materials';

export interface PipesVisual {
  readonly group: THREE.Group;
  readonly waterBlob: THREE.Mesh;
  /** Move the glowing water blob to t (0..1) along the given fountain's pipe. */
  setWaterProgress(fountain: FountainId, t: number): void;
  setBlobVisible(visible: boolean): void;
}

export function buildPipes(): PipesVisual {
  const anchors = getSceneAnchors();
  const group = new THREE.Group();
  group.name = 'pipe-network';

  const pipeMat = brassMaterial();
  for (const id of Object.keys(anchors.pipeCurves) as FountainId[]) {
    const curve = anchors.pipeCurves[id];
    const geometry = new THREE.TubeGeometry(curve, 24, 0.14, 8, false);
    const mesh = new THREE.Mesh(geometry, pipeMat);
    mesh.name = `pipe-${id}`;
    mesh.receiveShadow = false;
    group.add(mesh);
  }

  const waterBlob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), waterMaterial());
  waterBlob.name = 'pipe-water-blob';
  waterBlob.visible = false;
  group.add(waterBlob);

  const point = new THREE.Vector3();

  return {
    group,
    waterBlob,
    setWaterProgress(fountain: FountainId, t: number): void {
      const curve = anchors.pipeCurves[fountain];
      curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), point);
      waterBlob.position.copy(point);
    },
    setBlobVisible(visible: boolean): void {
      waterBlob.visible = visible;
    },
  };
}

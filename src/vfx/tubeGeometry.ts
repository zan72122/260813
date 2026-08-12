// src/vfx/tubeGeometry.ts
// Manual partial-arc tube builder (same algorithm as THREE.TubeGeometry's
// Frenet-frame sweep, generalized to an arbitrary arc instead of a full
// 360° ring) so we can build a "cutaway" pipe shell that's open on one side,
// plus a matching inner water-slug tube. No external geometry assets.

import * as THREE from 'three';

export function buildArcTubeGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radius: number,
  radialSegments: number,
  arcStartRad: number,
  arcLengthRad: number,
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const alongT = i / tubularSegments;
    const point = curve.getPointAt(alongT);
    const N = frames.normals[i] as THREE.Vector3;
    const B = frames.binormals[i] as THREE.Vector3;

    for (let j = 0; j <= radialSegments; j++) {
      const aroundT = j / radialSegments;
      const angle = arcStartRad + aroundT * arcLengthRad;
      const sin = Math.sin(angle);
      const cos = -Math.cos(angle);

      normal.x = cos * N.x + sin * B.x;
      normal.y = cos * N.y + sin * B.y;
      normal.z = cos * N.z + sin * B.z;
      normal.normalize();
      normals.push(normal.x, normal.y, normal.z);

      vertex.x = point.x + radius * normal.x;
      vertex.y = point.y + radius * normal.y;
      vertex.z = point.z + radius * normal.z;
      positions.push(vertex.x, vertex.y, vertex.z);

      uvs.push(aroundT, alongT);
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + (j + 1);
      const d = (radialSegments + 1) * i + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

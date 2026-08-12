// src/vfx/tubeGeometry.ts
// Manual partial-arc tube builder (same sweep algorithm as THREE.TubeGeometry,
// generalized to an arbitrary arc instead of a full 360° ring) so we can
// build a "cutaway" pipe shell that's open on one side, plus a matching
// inner water-slug tube. No external geometry assets.
//
// Uses a world-up-aligned cross-section frame (Gram-Schmidt against +Y)
// rather than THREE.Curve's Frenet frames: Frenet frames rotation-minimize
// but start from an arbitrary initial orientation and can twist along a
// winding curve, which would rotate the cutaway's gap unpredictably along
// the pipe's length. Locking the frame to world-up instead keeps the gap
// facing "up" consistently along the whole curve, which is what makes the
// cutaway read correctly from an external side-view camera tracking
// alongside the pipe (Worker A's pipe-run beat) regardless of how the pipe
// curve itself winds underground.

import * as THREE from 'three';

interface UpAlignedFrames {
  normals: THREE.Vector3[];
  binormals: THREE.Vector3[];
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_REF = new THREE.Vector3(1, 0, 0);

function computeUpAlignedFrames(curve: THREE.Curve<THREE.Vector3>, segments: number): UpAlignedFrames {
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  const scratchTangent = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const tangent = curve.getTangentAt(t).normalize();
    const dot = tangent.dot(WORLD_UP);
    let normal: THREE.Vector3;
    if (Math.abs(dot) > 0.995) {
      // Tangent nearly vertical — world-up is a degenerate reference here,
      // fall back to a fixed horizontal axis instead.
      scratchTangent.copy(FALLBACK_REF).addScaledVector(tangent, -FALLBACK_REF.dot(tangent));
      normal = scratchTangent.lengthSq() > 1e-6 ? scratchTangent.clone().normalize() : new THREE.Vector3(0, 0, 1);
    } else {
      scratchTangent.copy(WORLD_UP).addScaledVector(tangent, -dot);
      normal = scratchTangent.clone().normalize();
    }
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    normals.push(normal);
    binormals.push(binormal);
  }
  return { normals, binormals };
}

export function buildArcTubeGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radius: number,
  radialSegments: number,
  arcStartRad: number,
  arcLengthRad: number,
): THREE.BufferGeometry {
  const frames = computeUpAlignedFrames(curve, tubularSegments);
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
      // angle = 0 points along N (world-up-aligned); the gap left out of
      // [arcStartRad, arcStartRad + arcLengthRad] by the caller therefore
      // consistently faces "up" along the whole curve.
      const angle = arcStartRad + aroundT * arcLengthRad;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

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

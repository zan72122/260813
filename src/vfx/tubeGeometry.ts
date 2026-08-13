// src/vfx/tubeGeometry.ts
// Manual partial-arc tube builder (same sweep algorithm as THREE.TubeGeometry,
// generalized to an arbitrary arc instead of a full 360° ring) so we can
// build a "cutaway" pipe shell that's open on one side, plus a matching
// inner water-slug tube. No external geometry assets.
//
// Uses a world-up-seeded Rotation-Minimizing Frame (RMF): the cross-section
// "normal" starts aligned to world-up (Gram-Schmidt against +Y) at t=0, then
// is PROPAGATED incrementally along the curve (rotating by exactly the angle
// between each pair of consecutive tangents, same technique as THREE.Curve's
// own computeFrenetFrames) rather than recomputed independently at every
// sample. An earlier version recomputed "up minus tangent component" fresh
// at each sample, which is fine almost everywhere but has a degenerate
// branch when the tangent swings close to vertical (e.g. where an
// underground pipe curve bends up into a fountain's riser) — right at that
// point the frame could discontinuously snap to a fallback axis, twisting
// the cutaway's gap out of view for the rest of the curve. Incremental
// propagation is continuous by construction: no per-sample recomputation,
// so no jump is possible, regardless of how the tangent moves.
//
// Full 360° twist along a real-world curve isn't guaranteed to end back at
// "up" after propagation, but our pipe curves are gentle enough that this
// hasn't been an issue in practice, and it is unconditionally better than a
// hard discontinuity.

import * as THREE from 'three';

interface UpAlignedFrames {
  normals: THREE.Vector3[];
  binormals: THREE.Vector3[];
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_REF = new THREE.Vector3(1, 0, 0);

function computeUpSeededRmfFrames(curve: THREE.Curve<THREE.Vector3>, segments: number): UpAlignedFrames {
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    tangents.push(curve.getTangentAt(i / segments).normalize());
  }

  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  // Seed frame 0: project world-up perpendicular to the starting tangent
  // (falling back to a fixed horizontal axis only if the curve *starts*
  // near-vertical — everywhere else is handled by propagation, not this
  // branch, so a fallback here can't cause a mid-curve discontinuity).
  const dot0 = tangents[0]!.dot(WORLD_UP);
  let normal0: THREE.Vector3;
  if (Math.abs(dot0) > 0.995) {
    normal0 = FALLBACK_REF.clone().addScaledVector(tangents[0]!, -FALLBACK_REF.dot(tangents[0]!));
    if (normal0.lengthSq() < 1e-6) normal0 = new THREE.Vector3(0, 0, 1);
    normal0.normalize();
  } else {
    normal0 = WORLD_UP.clone().addScaledVector(tangents[0]!, -dot0).normalize();
  }
  normals.push(normal0);
  binormals.push(new THREE.Vector3().crossVectors(tangents[0]!, normal0).normalize());

  const rotationAxis = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  for (let i = 1; i <= segments; i++) {
    const prevTangent = tangents[i - 1]!;
    const tangent = tangents[i]!;
    const nextNormal = normals[i - 1]!.clone();

    rotationAxis.crossVectors(prevTangent, tangent);
    if (rotationAxis.length() > Number.EPSILON) {
      rotationAxis.normalize();
      const theta = Math.acos(THREE.MathUtils.clamp(prevTangent.dot(tangent), -1, 1));
      nextNormal.applyMatrix4(rotationMatrix.makeRotationAxis(rotationAxis, theta));
    }
    normals.push(nextNormal);
    binormals.push(new THREE.Vector3().crossVectors(tangent, nextNormal).normalize());
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
  const frames = computeUpSeededRmfFrames(curve, tubularSegments);
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
      // angle = 0 points along N (world-up-aligned at the curve's start);
      // the gap left out of [arcStartRad, arcStartRad + arcLengthRad] by
      // the caller therefore faces "up" at the start and stays continuous
      // (never snaps) along the rest of the curve.
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

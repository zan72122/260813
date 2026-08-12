/**
 * Custom wedge-prism geometry — a doorstop-like solid: full height at the
 * "head" end (where the hammer strikes) tapering to a sharp edge at the
 * "tip" end (which drives into the junction slot). None of Three's built-in
 * primitives produce this shape, so it is hand-built from 6 vertices.
 * Authored with the tip at local -Z, the head at local +Z, resting on the
 * local XZ plane (base at Y=0).
 *
 * Non-indexed (each face gets its own vertex copies) so
 * `computeVertexNormals()` yields correct flat/hard-edged shading — a
 * forged metal wedge should not look rounded.
 */
import * as THREE from 'three';

export function createWedgeGeometry(width: number, height: number, length: number): THREE.BufferGeometry {
  const hw = width / 2;
  const tip = -length / 2;
  const head = length / 2;

  // 6 logical corners of the wedge solid.
  const A: [number, number, number] = [-hw, 0, tip]; // tip, left
  const B: [number, number, number] = [hw, 0, tip]; // tip, right
  const C: [number, number, number] = [hw, 0, head]; // head base, right
  const D: [number, number, number] = [-hw, 0, head]; // head base, left
  const E: [number, number, number] = [-hw, height, head]; // head top, left
  const F: [number, number, number] = [hw, height, head]; // head top, right

  // Triangulated faces (outward winding): bottom, head end, top slant, 2 side triangles.
  const faces: [number, number, number][][] = [
    [A, C, B],
    [A, D, C], // bottom (ABCD)
    [D, F, C],
    [D, E, F], // head end (DCFE)
    [A, B, F],
    [A, F, E], // top slant (ABFE)
    [A, E, D], // left triangle
    [B, C, F], // right triangle
  ];

  const positions: number[] = [];
  for (const tri of faces) {
    for (const v of tri) positions.push(...v);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

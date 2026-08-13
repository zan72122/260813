import * as THREE from 'three';

/**
 * Procedural beveled/rounded geometry helpers. The art direction forbids
 * razor-sharp boxes, so every "box-like" shape in the game (table top,
 * shelves, baskets, toy blocks, cart body) is built from a rounded-rect
 * Shape extruded with a bevel rather than a raw BoxGeometry.
 */
export function roundedRectShape(width: number, depth: number, radius: number): THREE.Shape {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(radius, w, d);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  return shape;
}

export interface RoundedBoxOptions {
  width: number;
  height: number;
  depth: number;
  cornerRadius?: number;
  bevelSize?: number;
  bevelSegments?: number;
}

/** A gently beveled box built by extruding a rounded rectangle. Extrudes along Z then is rotated so height runs along Y. */
export function roundedBoxGeometry(opts: RoundedBoxOptions): THREE.BufferGeometry {
  const { width, height, depth, cornerRadius = Math.min(width, depth) * 0.12, bevelSize, bevelSegments = 3 } = opts;
  const shape = roundedRectShape(width, depth, cornerRadius);
  const bevel = bevelSize ?? Math.min(height * 0.18, 0.03);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(height - bevel * 2, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments,
    curveSegments: 6,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, height / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

/** A soft rounded-plank plane (thin rounded box) used for shelves/table tops when a flatter silhouette reads better. */
export function roundedPlankGeometry(width: number, thickness: number, depth: number, cornerRadius = 0.04): THREE.BufferGeometry {
  return roundedBoxGeometry({ width, height: thickness, depth, cornerRadius, bevelSize: thickness * 0.35 });
}

/** Squashed rounded cube for plush toys — same bevel technique, non-uniform scale applied post-hoc by caller. */
export function plushBlockGeometry(size: number): THREE.BufferGeometry {
  return roundedBoxGeometry({ width: size, height: size * 0.85, depth: size, cornerRadius: size * 0.32, bevelSize: size * 0.22, bevelSegments: 4 });
}

/**
 * M11 fix (fix-round-1): plush toys need a silhouette that reads as
 * distinctly "soft/lumpy" at a glance next to a wood block (cubic) and a
 * plastic ball (sphere) — a heavily-rounded box (plushBlockGeometry above)
 * still reads as a box family, just softer-edged. This merges 3 overlapping,
 * unevenly-sized spheres into one asymmetric blob (one draw call, same as
 * any other single-mesh toy) for a genuinely non-box, non-sphere silhouette.
 */
export function plushLumpGeometry(size: number): THREE.BufferGeometry {
  const lumps: THREE.BufferGeometry[] = [];
  const core = new THREE.SphereGeometry(size * 0.52, 12, 9);
  lumps.push(core);
  const earOffsets: [number, number, number, number][] = [
    [-size * 0.32, size * 0.24, size * 0.08, 0.62],
    [size * 0.3, size * 0.2, -size * 0.1, 0.58],
    [0, -size * 0.22, size * 0.18, 0.5],
  ];
  for (const [x, y, z, scale] of earOffsets) {
    const lump = new THREE.SphereGeometry(size * 0.52 * scale, 10, 8);
    lump.translate(x, y, z);
    lumps.push(lump);
  }
  const geo = mergeGeometries(lumps);
  geo.scale(1, 0.88, 1);
  return geo;
}

export function woodBlockGeometry(size: number): THREE.BufferGeometry {
  return roundedBoxGeometry({ width: size, height: size, depth: size, cornerRadius: size * 0.14, bevelSize: size * 0.05, bevelSegments: 2 });
}

/** Merges multiple positioned geometries (each already transformed) into one BufferGeometry, disposing the sources. Used to keep NPCs / furniture to one draw call per group. */
export function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Manual merge (avoids pulling in the BufferGeometryUtils examples module):
  // all inputs must share the same attribute set (position, normal, uv, color).
  const attrNames = ['position', 'normal', 'uv', 'color'] as const;
  const merged = new THREE.BufferGeometry();
  const counts = geometries.map((g) => g.attributes['position']!.count);
  const totalVerts = counts.reduce((a, b) => a + b, 0);

  for (const name of attrNames) {
    const itemSize = name === 'uv' ? 2 : name === 'color' ? 3 : 3;
    const hasAll = geometries.every((g) => g.attributes[name]);
    if (!hasAll && name !== 'color') continue;
    const array = new Float32Array(totalVerts * itemSize);
    let offset = 0;
    for (const g of geometries) {
      const attr = g.attributes[name];
      if (attr) {
        array.set(attr.array as Float32Array, offset);
      } else if (name === 'color') {
        array.fill(1, offset, offset + g.attributes['position']!.count * itemSize);
      }
      offset += g.attributes['position']!.count * itemSize;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(array, itemSize));
  }

  // Merge indices, offsetting by cumulative vertex count.
  let indexTotal = 0;
  let hasIndex = true;
  for (const g of geometries) {
    if (!g.index) {
      hasIndex = false;
      break;
    }
    indexTotal += g.index.count;
  }
  if (hasIndex) {
    const indexArray = totalVerts > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
    let idxOffset = 0;
    let vertOffset = 0;
    for (const g of geometries) {
      const idx = g.index!;
      for (let i = 0; i < idx.count; i++) {
        indexArray[idxOffset + i] = idx.getX(i) + vertOffset;
      }
      idxOffset += idx.count;
      vertOffset += g.attributes['position']!.count;
    }
    merged.setIndex(new THREE.BufferAttribute(indexArray, 1));
  }

  for (const g of geometries) g.dispose();
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Paints a solid vertex color onto a geometry in place (used before merging so each sub-part keeps its region color). */
export function paintGeometry(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const count = geo.attributes['position']!.count;
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    array[i * 3] = color.r;
    array[i * 3 + 1] = color.g;
    array[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(array, 3));
  return geo;
}

/** Applies a local transform (position/rotation/scale) to a geometry's vertices in place, returning it for chaining. */
export function transformGeometry(
  geo: THREE.BufferGeometry,
  position?: THREE.Vector3,
  rotation?: THREE.Euler,
  scale?: THREE.Vector3,
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rotation) q.setFromEuler(rotation);
  m.compose(position ?? new THREE.Vector3(), q, scale ?? new THREE.Vector3(1, 1, 1));
  geo.applyMatrix4(m);
  return geo;
}

/**
 * B7 fix (fix-round-1): disposes every geometry + material found under `root`
 * (Mesh and InstancedMesh alike). Deliberately does NOT touch `material.map`
 * (or any other texture) — textures used here are shared, module-level-cached
 * procedural textures (see toys.ts/baskets.ts/mats.ts) that outlive any one
 * seed's systems and must not be disposed out from under the next reshuffle.
 * Call this on a seed-scoped system's group right before discarding it.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!('geometry' in mesh) || !('material' in mesh)) return;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

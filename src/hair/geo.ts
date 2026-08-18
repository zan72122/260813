import * as THREE from 'three';

export interface SweepOptions {
  /** Radial segments of the cross-section. */
  radial?: number;
  /** 0..1 flattening of the cross-section (1 = round tube, 0.5 = ribbon-ish). */
  flatten?: (t: number) => number;
  /**
   * Optional reference direction. When set, the cross-section's WIDE axis is
   * kept perpendicular to it (a ribbon lying flat in the plane ⊥ ref) —
   * used by the braid tail so petals splay inside the flower plane.
   */
  ref?: THREE.Vector3;
}

/**
 * Parallel-transport frames along a polyline — stable ribbon/tube orientation
 * without the twisting artifacts of Frenet frames.
 */
export function transportFrames(points: THREE.Vector3[]): { tangents: THREE.Vector3[]; normals: THREE.Vector3[]; binormals: THREE.Vector3[] } {
  const n = points.length;
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, n - 1)];
    tangents.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  let normal = new THREE.Vector3(0, 0, 1);
  if (Math.abs(tangents[0].dot(normal)) > 0.9) normal = new THREE.Vector3(1, 0, 0);
  normal.sub(tangents[0].clone().multiplyScalar(normal.dot(tangents[0]))).normalize();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const axis = new THREE.Vector3().crossVectors(tangents[i - 1], tangents[i]);
      const len = axis.length();
      if (len > 1e-6) {
        axis.divideScalar(len);
        const angle = Math.acos(THREE.MathUtils.clamp(tangents[i - 1].dot(tangents[i]), -1, 1));
        normal = normal.clone().applyAxisAngle(axis, angle);
      } else {
        normal = normal.clone();
      }
    }
    normals.push(normal.clone().normalize());
    binormals.push(new THREE.Vector3().crossVectors(tangents[i], normals[i]).normalize());
  }
  return { tangents, normals, binormals };
}

/**
 * Sweep an elliptical cross-section along points. Vertices and indices are
 * ordered along the length so geometry.drawRange can grow a strand
 * root→tip without rebuilding. uv.y runs root(0)→tip(1) and drives the
 * sway weight in the hair shader.
 */
/** Frames whose "wide" axis (normal) lies in the plane perpendicular to ref. */
export function refFrames(points: THREE.Vector3[], ref: THREE.Vector3): { normals: THREE.Vector3[]; binormals: THREE.Vector3[] } {
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(i - 1, 0)];
    const b = points[Math.min(i + 1, n - 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    let wide = new THREE.Vector3().crossVectors(ref, t);
    if (wide.lengthSq() < 1e-8) wide = new THREE.Vector3(1, 0, 0);
    wide.normalize();
    normals.push(wide);
    binormals.push(new THREE.Vector3().crossVectors(t, wide).normalize());
  }
  return { normals, binormals };
}

function framesFor(points: THREE.Vector3[], opts: SweepOptions): { normals: THREE.Vector3[]; binormals: THREE.Vector3[] } {
  return opts.ref ? refFrames(points, opts.ref) : transportFrames(points);
}

export function sweepTube(
  points: THREE.Vector3[],
  radius: (t: number) => number,
  opts: SweepOptions = {}
): THREE.BufferGeometry {
  const radial = opts.radial ?? 7;
  const n = points.length;
  const { normals, binormals } = framesFor(points, opts);
  const posArr = new Float32Array(n * radial * 3);
  const normArr = new Float32Array(n * radial * 3);
  const uvArr = new Float32Array(n * radial * 2);
  const idx: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = Math.max(radius(t), 0.0005);
    const flat = opts.flatten ? opts.flatten(t) : 1;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const offset = new THREE.Vector3()
        .addScaledVector(normals[i], ca * r)
        .addScaledVector(binormals[i], sa * r * flat);
      const k = (i * radial + j) * 3;
      posArr[k] = points[i].x + offset.x;
      posArr[k + 1] = points[i].y + offset.y;
      posArr[k + 2] = points[i].z + offset.z;
      const nrm = new THREE.Vector3()
        .addScaledVector(normals[i], ca)
        .addScaledVector(binormals[i], sa * flat)
        .normalize();
      normArr[k] = nrm.x;
      normArr[k + 1] = nrm.y;
      normArr[k + 2] = nrm.z;
      const ku = (i * radial + j) * 2;
      uvArr[ku] = j / radial;
      uvArr[ku + 1] = t;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + j2;
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + j2;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  g.setIndex(idx);
  return g;
}

/**
 * In-place update of an existing sweep geometry with new points/radius —
 * avoids reallocations during per-frame morphs (drop, coil).
 * points.length must equal the segment count the geometry was built with.
 */
export function updateSweep(
  g: THREE.BufferGeometry,
  points: THREE.Vector3[],
  radius: (t: number) => number,
  opts: SweepOptions = {}
): void {
  const radial = opts.radial ?? 7;
  const n = points.length;
  const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
  const normAttr = g.getAttribute('normal') as THREE.BufferAttribute;
  const { normals, binormals } = framesFor(points, opts);
  const pos = posAttr.array as Float32Array;
  const norm = normAttr.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = Math.max(radius(t), 0.0005);
    const flat = opts.flatten ? opts.flatten(t) : 1;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const k = (i * radial + j) * 3;
      pos[k] = points[i].x + normals[i].x * ca * r + binormals[i].x * sa * r * flat;
      pos[k + 1] = points[i].y + normals[i].y * ca * r + binormals[i].y * sa * r * flat;
      pos[k + 2] = points[i].z + normals[i].z * ca * r + binormals[i].z * sa * r * flat;
      const nx = normals[i].x * ca + binormals[i].x * sa * flat;
      const ny = normals[i].y * ca + binormals[i].y * sa * flat;
      const nz = normals[i].z * ca + binormals[i].z * sa * flat;
      const il = 1 / Math.max(Math.hypot(nx, ny, nz), 1e-6);
      norm[k] = nx * il;
      norm[k + 1] = ny * il;
      norm[k + 2] = nz * il;
    }
  }
  posAttr.needsUpdate = true;
  normAttr.needsUpdate = true;
  g.computeBoundingSphere();
}

/** Strand tips taper to a point over the last ~15% — no "broom" chops. */
export function tipTaper(t: number): number {
  return 1 - THREE.MathUtils.smoothstep(t, 0.82, 1) * 0.92;
}

/** Sample a Catmull-Rom spline through control points into n points. */
export function sampleSpline(controls: THREE.Vector3[], n: number, tension = 0.5): THREE.Vector3[] {
  const curve = new THREE.CatmullRomCurve3(controls, false, 'catmullrom', tension);
  return curve.getSpacedPoints(n - 1);
}

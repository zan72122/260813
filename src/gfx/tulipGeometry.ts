import * as THREE from 'three';

/**
 * A tulip built from maths, in two poses at once.
 *
 * `position` holds the OPEN flower and `aBud` holds the same vertex in its
 * closed-bud pose. The vertex shader lerps between them, so "the flower opens"
 * costs one float per instance instead of an animation system. The same
 * geometry drives every LOD - only the segment counts change.
 */

export interface TulipOptions {
  radialSegs: number;
  headSegs: number;
  stemSegs: number;
  petals: number;
  leaves: number;
  /** total plant height in world units when instance scale is 1 */
  height: number;
}

export const NEAR_TULIP: TulipOptions = { radialSegs: 18, headSegs: 8, stemSegs: 4, petals: 6, leaves: 2, height: 1 };
export const MID_TULIP: TulipOptions = { radialSegs: 12, headSegs: 3, stemSegs: 1, petals: 6, leaves: 2, height: 1 };

/**
 * Cup radius from the base of the flower head (0) to the rim (1).
 * A tulip is widest a little above halfway and then draws back in - getting
 * that curve right is most of what stops it looking like a plastic bowl.
 */
const OPEN_PROFILE = [0.026, 0.115, 0.175, 0.203, 0.216, 0.212, 0.199, 0.196];

function sampleProfile(p: number[], v: number) {
  const x = v * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(x));
  const f = x - i;
  return p[i] * (1 - f) + p[i + 1] * f;
}

export function buildTulipGeometry(o: TulipOptions): THREE.BufferGeometry {
  const pos: number[] = [];
  const bud: number[] = [];
  const nrm: number[] = [];
  const bnrm: number[] = [];
  const part: number[] = [];
  const hgt: number[] = [];
  const cup: number[] = [];
  const idx: number[] = [];

  const H = o.height;
  const stemTop = 0.660 * H;
  const headH = 0.340 * H;
  const headBudH = headH * 1.14;

  const push = (
    p: THREE.Vector3, b: THREE.Vector3, n: THREE.Vector3, bn: THREE.Vector3, pt: number, cv = 0,
  ) => {
    pos.push(p.x, p.y, p.z);
    bud.push(b.x, b.y, b.z);
    nrm.push(n.x, n.y, n.z);
    bnrm.push(bn.x, bn.y, bn.z);
    part.push(pt);
    cup.push(cv);
    hgt.push(Math.min(1, Math.max(0, p.y / H)));
  };

  const v3 = () => new THREE.Vector3();

  // ---------------------------------------------------------------- stem ----
  const stemBend = 0.045 * H;
  const stemBase = idxBase(pos);
  for (let j = 0; j <= o.stemSegs; j++) {
    const t = j / o.stemSegs;
    const y = t * stemTop;
    const r = (0.0225 - 0.008 * t) * H;
    const bx = stemBend * t * t;
    for (let i = 0; i <= o.radialSegs; i++) {
      const a = (i / o.radialSegs) * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      const p = v3().set(bx + nx * r, y, nz * r);
      const n = v3().set(nx, 0.18, nz).normalize();
      push(p, p.clone(), n, n.clone(), 0);
    }
  }
  gridIndices(idx, stemBase, o.stemSegs, o.radialSegs);

  // --------------------------------------------------------------- leaves ---
  const leafSegs = 5;
  for (let l = 0; l < o.leaves; l++) {
    const dirA = (l / o.leaves) * Math.PI * 2 + 0.6;
    const dx = Math.cos(dirA), dz = Math.sin(dirA);
    const leafH = (0.60 + 0.08 * l) * H;
    const spread = 0.20 * H;
    const wMax = 0.055 * H;
    const base = idxBase(pos);
    for (let j = 0; j <= leafSegs; j++) {
      const s = j / leafSegs;
      const y = leafH * s * (1 - 0.22 * s);
      const out = spread * Math.pow(s, 1.7);
      const w = wMax * Math.pow(Math.sin(Math.min(1, s * 1.02) * Math.PI), 0.62) * (1 - 0.15 * s);
      const cx = dx * out, cz = dz * out;
      // width runs perpendicular to the leaf direction, with a slight curl
      const px = -dz, pz = dx;
      const curl = 0.16 * H * Math.pow(s, 2);
      for (let k = -1; k <= 1; k += 2) {
        // the blade droops a little as it reaches out - stiff leaves look fake
        const p = v3().set(cx + px * w * k, y - curl * 0.12, cz + pz * w * k);
        const n = v3().set(dx * 0.25, 1, dz * 0.25).normalize();
        push(p, p.clone(), n, n.clone(), 1);
      }
    }
    // strip: 2 verts per row
    for (let j = 0; j < leafSegs; j++) {
      const a = base + j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
  }

  // ----------------------------------------------------------------- head ---
  const headBase = idxBase(pos);
  const budScale = 0.40;
  for (let j = 0; j <= o.headSegs; j++) {
    const v = j / o.headSegs;
    const rBaseO = sampleProfile(OPEN_PROFILE, v) * H;
    const rBaseB = rBaseO * budScale * (1 - Math.pow(v, 2.6) * 0.86) * 1.55;
    for (let i = 0; i <= o.radialSegs; i++) {
      const a = (i / o.radialSegs) * Math.PI * 2;
      const lobe = Math.cos(o.petals * a) * 0.5 + 0.5; // 1 at petal centre, 0 at seam
      const nx = Math.cos(a), nz = Math.sin(a);

      // the seams between petals tuck in, the petal centres bulge and rise to
      // a point: six soft tips instead of one continuous rim
      const rO = rBaseO * (0.87 + 0.19 * lobe) + 0.030 * H * Math.pow(v, 5.0) * lobe;
      const yO = stemTop + v * headH + 0.095 * H * Math.pow(v, 3.2) * lobe
                 - 0.030 * H * Math.pow(v, 3.0) * (1 - lobe);
      const p = v3().set(nx * rO, yO, nz * rO);

      const rB = rBaseB * (0.92 + 0.14 * lobe);
      const yB = stemTop + v * headBudH + 0.055 * H * Math.pow(v, 3) * lobe;
      const b = v3().set(nx * rB, yB, nz * rB);

      // slope of the profile drives the normal, so the cup shades like a cup
      const dv = 1 / o.headSegs;
      const rNext = sampleProfile(OPEN_PROFILE, Math.min(1, v + dv)) * H * (0.87 + 0.19 * lobe);
      const dr = (rNext - rBaseO * (0.87 + 0.19 * lobe)) / (dv * headH);
      const n = v3().set(nx, -dr, nz).normalize();
      const bn = v3().set(nx * 0.85, 0.5 * v, nz * 0.85).normalize();
      push(p, b, n, bn, 2, v);
    }
  }
  gridIndices(idx, headBase, o.headSegs, o.radialSegs);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aBud', new THREE.Float32BufferAttribute(bud, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aBudNormal', new THREE.Float32BufferAttribute(bnrm, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  geo.setAttribute('aCup', new THREE.Float32BufferAttribute(cup, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

function idxBase(pos: number[]) { return pos.length / 3; }

function gridIndices(idx: number[], base: number, rows: number, cols: number) {
  const stride = cols + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = base + j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
}

/** A single flower head only - used for the hero close-up bloom. */
export function tulipTriangleCount(geo: THREE.BufferGeometry) {
  const i = geo.getIndex();
  return i ? i.count / 3 : 0;
}

'use strict';
/* shapes.js — polygon generators, triangulation, pattern data.
   All pattern coordinates live in object-local space (object radius ~= 1). */
const Shapes = (() => {
  const TAU = Math.PI * 2;
  const deg = a => a * Math.PI / 180;

  function polyArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }
  function ensureCCW(pts) { return polyArea(pts) < 0 ? pts.slice().reverse() : pts; }

  function dedupe(pts) {
    const out = [];
    for (const p of pts) {
      const q = out[out.length - 1];
      if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4) out.push(p);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4) out.pop();
    }
    return out;
  }

  function chaikin(pts, iter) {
    let cur = pts;
    for (let k = 0; k < iter; k++) {
      const out = [];
      for (let i = 0, n = cur.length; i < n; i++) {
        const p = cur[i], q = cur[(i + 1) % n];
        out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
        out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
      }
      cur = out;
    }
    return cur;
  }

  function earClip(pts) {
    const idx = [];
    const V = [];
    for (let i = 0; i < pts.length; i++) V.push(i);
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inTri = (p, a, b, c) =>
      cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12;
    let guard = 0;
    while (V.length > 3 && guard++ < 20000) {
      let clipped = false;
      for (let i = 0; i < V.length; i++) {
        const i0 = V[(i + V.length - 1) % V.length], i1 = V[i], i2 = V[(i + 1) % V.length];
        const a = pts[i0], b = pts[i1], c = pts[i2];
        if (cross(a, b, c) <= 1e-12) continue;
        let ok = true;
        for (let j = 0; j < V.length; j++) {
          const vj = V[j];
          if (vj === i0 || vj === i1 || vj === i2) continue;
          if (inTri(pts[vj], a, b, c)) { ok = false; break; }
        }
        if (ok) { idx.push(i0, i1, i2); V.splice(i, 1); clipped = true; break; }
      }
      if (!clipped) {
        for (let i = 1; i < V.length - 1; i++) idx.push(V[0], V[i], V[i + 1]);
        return idx;
      }
    }
    if (V.length === 3) idx.push(V[0], V[1], V[2]);
    return idx;
  }

  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  }

  /* Mesh: interleaved [x, y, lx, ly] where (lx,ly) is bbox-normalized (-1..1). */
  function buildMesh(rawPts) {
    const pts = ensureCCW(dedupe(rawPts));
    const indices = earClip(pts);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const p of pts) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const hx = Math.max(1e-5, (maxX - minX) / 2), hy = Math.max(1e-5, (maxY - minY) / 2);
    const verts = new Float32Array(pts.length * 4);
    for (let i = 0; i < pts.length; i++) {
      verts[i * 4] = pts[i][0];
      verts[i * 4 + 1] = pts[i][1];
      verts[i * 4 + 2] = (pts[i][0] - cx) / hx;
      verts[i * 4 + 3] = (pts[i][1] - cy) / hy;
    }
    const c = centroid(pts);
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1]));
    return { verts, indices: new Uint16Array(indices), centroid: c, radius: r, pts };
  }

  function quadMesh(half) {
    const h = half || 1;
    return {
      verts: new Float32Array([
        -h, -h, -1, -1,
         h, -h,  1, -1,
         h,  h,  1,  1,
        -h,  h, -1,  1]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
      centroid: [0, 0], radius: h * Math.SQRT2,
    };
  }

  // ---- generators -------------------------------------------------------
  function ellipse(cx, cy, rx, ry, rot, n) {
    rot = rot || 0; n = n || 44;
    const pts = [];
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU;
      const x = Math.cos(t) * rx, y = Math.sin(t) * ry;
      pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return pts;
  }

  /* Teardrop petal: pointy end at (cx,cy), round end len away along ang. */
  function teardrop(cx, cy, ang, len, wid, n) {
    n = n || 40;
    const pts = [];
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU;
      const x = 0.5 - 0.5 * Math.cos(t);          // 0..1 along petal
      const w = Math.sin(t) * (0.30 + 0.70 * Math.sqrt(x));
      const px = x * len, py = w * wid * 0.5;
      pts.push([cx + px * c - py * s, cy + px * s + py * c]);
    }
    return pts;
  }

  /* Crescent moon: circle R at (cx,cy) minus circle r offset by (ox,oy). */
  function crescent(cx, cy, R, ox, oy, r, n) {
    n = n || 80;
    const flags = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      const p = [Math.cos(a) * R, Math.sin(a) * R];
      flags.push(Math.hypot(p[0] - ox, p[1] - oy) > r);
    }
    let s = -1;
    for (let i = 0; i < n; i++) {
      if (flags[i] && !flags[(i + n - 1) % n]) { s = i; break; }
    }
    if (s < 0) return ellipse(cx, cy, R, R);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const k = (s + i) % n;
      if (!flags[k]) break;
      const a = k / n * TAU;
      pts.push([Math.cos(a) * R, Math.sin(a) * R]);
    }
    const pA = pts[pts.length - 1], pB = pts[0];
    const aA = Math.atan2(pA[1] - oy, pA[0] - ox);
    const aB = Math.atan2(pB[1] - oy, pB[0] - ox);
    let d = aB - aA;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const midInside = dd => {
      const am = aA + dd / 2;
      return Math.hypot(ox + Math.cos(am) * r, oy + Math.sin(am) * r) < R;
    };
    if (!midInside(d)) d = d > 0 ? d - TAU : d + TAU;
    const m = 26;
    for (let i = 1; i < m; i++) {
      const a = aA + d * i / m;
      pts.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
    return pts.map(p => [p[0] + cx, p[1] + cy]);
  }

  /* Wavy ribbon with tapered ends (for the sea). */
  function waveBand(cx, cy, halfSpan, amp, freq, thick, phase, n) {
    n = n || 44;
    const top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const x = -halfSpan + 2 * halfSpan * i / n;
      const tpr = Math.sqrt(Math.max(0.06, 1 - (x / halfSpan) * (x / halfSpan)));
      const y = amp * Math.sin(x * freq + phase) * (0.55 + 0.45 * tpr);
      top.push([x, y]);
      bot.push([x, y - thick * (0.40 + 0.60 * tpr)]);
    }
    return top.concat(bot.reverse()).map(p => [p[0] + cx, p[1] + cy]);
  }

  function star(cx, cy, R, r, pn, rot) {
    pn = pn || 5; rot = rot === undefined ? Math.PI / 2 : rot;
    const pts = [];
    for (let i = 0; i < pn * 2; i++) {
      const a = rot + i / (pn * 2) * TAU;
      const rad = i % 2 === 0 ? R : r;
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    return chaikin(pts, 1);
  }

  function fishBody(cx, cy, L, Wd, n) {
    n = n || 52;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU;
      const x = Math.cos(t) * L / 2;
      const y = Math.sin(t) * Wd / 2 * (1.0 - 0.42 * Math.cos(t));
      pts.push([cx + x, cy + y]);
    }
    return pts;
  }

  function fishTail(cx, cy, s) {
    const raw = [
      [0.10, 0.12], [-0.62, 0.60], [-0.95, 0.30], [-0.52, 0.02],
      [-0.95, -0.32], [-0.66, -0.62], [0.10, -0.12],
    ];
    return chaikin(raw.map(p => [cx + p[0] * s, cy + p[1] * s]), 2);
  }

  function mirrorX(pts) { return pts.map(p => [-p[0], p[1]]); }

  // ---- object SDFs (JS mirror of shader; shape: 0 plate, 1 box, 2 kanzashi)
  function sdShape(shape, x, y) {
    if (shape === 0) return Math.hypot(x, y) - 1.0;
    if (shape === 1) {
      const bx = 0.93 - 0.30, by = 0.93 - 0.30;
      const qx = Math.abs(x) - bx, qy = Math.abs(y) - by;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - 0.30;
    }
    const dHead = Math.hypot(x, y - 0.18) - 0.80;
    const ay = Math.min(Math.max(y, -1.02), -0.15);
    const dStick = Math.hypot(x, y - ay) - 0.115;
    return Math.min(dHead, dStick);
  }

  // ---- the five craft items --------------------------------------------
  const ITEM_DEFS = [
    { shape: 0, name: 'butterfly', build() {
        const UL = teardrop(-0.09, 0.14, deg(133), 0.68, 0.46);
        const LL = teardrop(-0.07, -0.06, deg(222), 0.52, 0.38);
        return [
          { pts: UL, seed: 0.12, group: 'a' },
          { pts: mirrorX(UL), seed: 0.31, group: 'b' },
          { pts: LL, seed: 0.55, group: 'c' },
          { pts: mirrorX(LL), seed: 0.72, group: 'd' },
          { pts: ellipse(0, 0.05, 0.088, 0.31), seed: 0.44, group: 'e' },
        ];
      } },
    { shape: 1, name: 'flower', build() {
        const out = [];
        for (let i = 0; i < 5; i++) {
          const a = deg(90 + i * 72);
          out.push({
            pts: teardrop(Math.cos(a) * 0.17, 0.02 + Math.sin(a) * 0.17, a, 0.50, 0.34),
            seed: 0.08 + i * 0.17, group: 'petal',
          });
        }
        out.push({ pts: ellipse(0, 0.02, 0.175, 0.175), seed: 0.5, group: 'core' });
        return out;
      } },
    { shape: 0, name: 'moonwave', build() {
        return [
          { pts: crescent(0.33, 0.42, 0.30, 0.12, 0.05, 0.26), seed: 0.85, group: 'moon' },
          { pts: waveBand(0, -0.10, 0.84, 0.075, 5.2, 0.16, 0.6), seed: 0.15, group: 'w1' },
          { pts: waveBand(0, -0.38, 0.78, 0.070, 5.6, 0.15, 2.6), seed: 0.35, group: 'w2' },
          { pts: waveBand(0, -0.63, 0.60, 0.060, 6.0, 0.14, 4.5), seed: 0.55, group: 'w3' },
        ];
      } },
    { shape: 1, name: 'fish', build() {
        return [
          { pts: fishBody(-0.05, 0.02, 0.85, 0.44), seed: 0.30, group: 'body' },
          { pts: fishTail(-0.47, 0.02, 0.42), seed: 0.50, group: 'tail' },
          { pts: teardrop(-0.04, 0.20, deg(78), 0.30, 0.17), seed: 0.70, group: 'finT' },
          { pts: teardrop(-0.04, -0.17, deg(-98), 0.26, 0.16), seed: 0.15, group: 'finB' },
          { pts: ellipse(0.52, 0.40, 0.105, 0.105), seed: 0.62, group: 'bub' },
          { pts: ellipse(0.68, 0.62, 0.078, 0.078), seed: 0.90, group: 'bub' },
        ];
      } },
    { shape: 2, name: 'stars', build() {
        return [
          { pts: crescent(-0.05, 0.44, 0.24, 0.10, 0.04, 0.205), seed: 0.80, group: 'moon' },
          { pts: star(0.42, 0.58, 0.155, 0.075), seed: 0.10, group: 'star' },
          { pts: star(-0.44, 0.56, 0.135, 0.065), seed: 0.30, group: 'star' },
          { pts: star(-0.33, 0.02, 0.160, 0.078), seed: 0.50, group: 'star' },
          { pts: star(0.35, 0.06, 0.135, 0.066), seed: 0.65, group: 'star' },
          { pts: star(0.00, -0.30, 0.120, 0.058), seed: 0.42, group: 'star' },
        ];
      } },
  ];

  return { buildMesh, quadMesh, sdShape, ITEM_DEFS, pointInPoly };

  function pointInPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
})();

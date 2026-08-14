import * as THREE from 'three';

/**
 * A rounded rectangle, optionally cut in half. The half shapes are what make
 * the final "snap": two extruded halves sitting flush look like one biscuit,
 * and when they part the extrusion walls are already a real cross-section.
 */
export function biscuitShape({ w = 1, h = 1, r = 0.26, side = 'full', overlap = 0 } = {}) {
  const x0 = side === 'right' ? -overlap : -w / 2;
  const x1 = side === 'left' ? overlap : w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const rl = side === 'right' ? 0 : r;
  const rr = side === 'left' ? 0 : r;
  const s = new THREE.Shape();
  s.moveTo(x0 + rl, y0);
  s.lineTo(x1 - rr, y0);
  if (rr) s.quadraticCurveTo(x1, y0, x1, y0 + rr);
  s.lineTo(x1, y1 - rr);
  if (rr) s.quadraticCurveTo(x1, y1, x1 - rr, y1);
  s.lineTo(x0 + rl, y1);
  if (rl) s.quadraticCurveTo(x0, y1, x0, y1 - rl);
  s.lineTo(x0, y0 + rl);
  if (rl) s.quadraticCurveTo(x0, y0, x0 + rl, y0);
  return s;
}

/**
 * Extrude a biscuit so it lies flat: printed face +Y, underside -Y.
 * Material slots: 0 = printed face, 1 = underside, 2 = crumbly edge.
 * `uvBox` is the *whole* biscuit's lid bounds, so half biscuits keep their
 * share of the animal instead of stretching it.
 */
export function biscuitGeometry({
  w = 1,
  h = 1,
  r = 0.26,
  side = 'full',
  thickness = 0.34,
  bevel = 0.07,
  curveSegments = 5,
  bevelSegments = 2,
  overlap = 0,
  uvBox = null,
} = {}) {
  const shape = biscuitShape({ w, h, r, side, overlap: side === 'full' ? 0 : overlap });
  const depth = Math.max(0.02, thickness - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    curveSegments,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    // offset the bevel inwards so the widest point is the shape itself: the
    // pillow keeps its size and, crucially, a half biscuit's cut face stays
    // perfectly flat on x=0 so two halves meet without a gap.
    bevelOffset: -bevel,
    bevelSegments,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateX(-Math.PI / 2);

  const box = uvBox || { x0: -w / 2 + bevel, x1: w / 2 - bevel, y0: -h / 2 + bevel, y1: h / 2 - bevel };
  remapLidUv(geo, box);
  splitLidGroups(geo);
  geo.computeBoundingSphere();
  return geo;
}

/** ExtrudeGeometry writes shape-space coordinates into the lid UVs; normalise them. */
function remapLidUv(geo, box) {
  const uv = geo.attributes.uv;
  const lid = geo.groups[0];
  const sx = 1 / (box.x1 - box.x0);
  const sy = 1 / (box.y1 - box.y0);
  for (let i = lid.start; i < lid.start + lid.count; i++) {
    uv.setXY(i, (uv.getX(i) - box.x0) * sx, (uv.getY(i) - box.y0) * sy);
  }
  uv.needsUpdate = true;
}

/** Split the single lid group into printed face / underside. */
function splitLidGroups(geo) {
  const lid = geo.groups[0];
  const sides = geo.groups[1];
  const half = lid.count / 2;
  const nrm = geo.attributes.normal;
  const firstIsTop = nrm.getY(lid.start) > 0;
  geo.clearGroups();
  geo.addGroup(lid.start, half, firstIsTop ? 0 : 1);
  geo.addGroup(lid.start + half, half, firstIsTop ? 1 : 0);
  if (sides) geo.addGroup(sides.start, sides.count, 2);
}

/** The chocolate blob that lives inside the shell (one slot, one material). */
export function fillingGeometry({
  w = 1,
  h = 1,
  r = 0.26,
  side = 'full',
  thickness = 0.18,
  inset = 0.11,
  overlap = 0,
} = {}) {
  const shape = biscuitShape({
    w: w - inset * 2,
    h: h - inset * 2,
    r: Math.max(0.02, r - inset * 0.5),
    side,
    overlap: side === 'full' ? 0 : overlap,
  });
  // the filling reaches further past the centre than the shell does, so a
  // broken half shows chocolate standing proud of the crumb — that band is the
  // cross-section the whole game has been building towards
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 0.06,
    curveSegments: 5,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.055,
    bevelSize: 0.055,
    bevelOffset: -0.055,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -(thickness - 0.06) / 2);
  geo.rotateX(-Math.PI / 2);
  geo.clearGroups();
  geo.computeBoundingSphere();
  return geo;
}

/** Flat rounded plate used for the conveyor belt and the tray. */
export function plateGeometry(w, d, r = 0.2, thickness = 0.12) {
  const shape = biscuitShape({ w, h: d, r, side: 'full' });
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    curveSegments: 3,
    steps: 1,
    bevelEnabled: false,
  });
  geo.translate(0, 0, -thickness);
  geo.rotateX(-Math.PI / 2);
  geo.clearGroups();
  return geo;
}

// Gummy silhouettes.
//
// Every shape is expressed as a list of closed polygons in a normalised
// [-1,1] box. One representation feeds three consumers:
//   * ExtrudeGeometry  -> the 3D gummy / the liquid in the cavity
//   * Path2D on canvas -> the cavity mask carved into the powder height map
//   * a flat cap poly  -> the sticker-ish outline used by the HUD
// Keeping a single source means the hole in the powder always matches the
// gummy that comes out of it.

const TAU = Math.PI * 2;

function circle(cx, cy, r, steps = 28) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

function ellipse(cx, cy, rx, ry, rot = 0, steps = 28) {
  const pts = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return pts;
}

function star(points = 5, outer = 1, inner = 0.46) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * TAU + Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

function heart(steps = 64) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y =
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push((x / 17) * 1.02, (y / 17) * 1.02);
  }
  return pts;
}

function leaf() {
  // small almond leaf that sits on the apple
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * TAU;
    const x = Math.cos(t) * 0.34;
    const y = Math.sin(t) * 0.15;
    const c = Math.cos(0.7);
    const s = Math.sin(0.7);
    pts.push(0.3 + x * c - y * s, 0.82 + x * s + y * c);
  }
  return pts;
}

/**
 * @typedef {{ id: string, label: string, parts: number[][] }} ShapeSpec
 */

/** @type {ShapeSpec[]} */
export const SHAPES = [
  { id: 'star', label: 'ほし', parts: [star(5, 1, 0.45)] },
  { id: 'heart', label: 'はーと', parts: [heart()] },
  {
    id: 'bear',
    label: 'くま',
    parts: [circle(0, -0.06, 0.82), circle(-0.62, 0.62, 0.33), circle(0.62, 0.62, 0.33)],
  },
  {
    id: 'bunny',
    label: 'うさぎ',
    parts: [
      ellipse(0, -0.22, 0.72, 0.62),
      ellipse(-0.3, 0.6, 0.17, 0.44, 0.18),
      ellipse(0.3, 0.6, 0.17, 0.44, -0.18),
    ],
  },
  {
    id: 'flower',
    label: 'はな',
    parts: [
      circle(0, 0.66, 0.42),
      circle(0.63, 0.2, 0.42),
      circle(0.39, -0.56, 0.42),
      circle(-0.39, -0.56, 0.42),
      circle(-0.63, 0.2, 0.42),
      circle(0, 0, 0.44),
    ],
  },
  {
    id: 'apple',
    label: 'りんご',
    parts: [
      ellipse(-0.32, -0.06, 0.5, 0.62),
      ellipse(0.32, -0.06, 0.5, 0.62),
      ellipse(0, -0.3, 0.55, 0.5),
      leaf(),
    ],
  },
];

// Normalise every silhouette to the same [-1,1] box so one `size` value means
// the same physical footprint whichever shape lands in a given cavity.
for (const spec of SHAPES) {
  let max = 0;
  for (const part of spec.parts) for (const v of part) max = Math.max(max, Math.abs(v));
  if (max > 0 && Math.abs(max - 1) > 1e-6) {
    const k = 1 / max;
    for (const part of spec.parts) for (let i = 0; i < part.length; i++) part[i] *= k;
  }
}

export const SHAPE_IDS = SHAPES.map((s) => s.id);

/** @param {string} id */
export function shapeById(id) {
  return SHAPES.find((s) => s.id === id) ?? SHAPES[0];
}

/**
 * Draw a shape into a 2D context, in the context's own units.
 * Used for the cavity mask and for HUD icons.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ShapeSpec} spec
 * @param {number} cx @param {number} cy @param {number} scale
 */
export function traceShape(ctx, spec, cx, cy, scale) {
  for (const part of spec.parts) {
    ctx.beginPath();
    for (let i = 0; i < part.length; i += 2) {
      const x = cx + part[i] * scale;
      const y = cy - part[i + 1] * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

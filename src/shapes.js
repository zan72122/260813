/**
 * Recipes for the clear plastic parts.
 *
 * Every play should feel a little different — different silhouette, different
 * internal stress, a different angle where it looks best — but never ugly.
 * The colours themselves come from real interference physics (see spectrum.js),
 * so "ugly palette" is impossible; what we vary here is *structure*: how much
 * of the retardation comes from the thickness dome (big soft colour fields),
 * the rim band (fine stripes), the moulding spokes, and the slow blobs.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODE = { FLOWER: 0, STAR: 1, GEAR: 2, BUTTERFLY: 3, LEAF: 4, SPOON: 5 };

// Per-silhouette character. ret = [dome, rim band, spokes, slow blobs] in nm.
const FAMILY = [
  {
    mode: MODE.FLOWER,
    size: 1.00,
    amp: [0.26, 0.34],
    freq: [5, 6, 7, 8],
    sharp: 1,
    ret: [[430, 600], [470, 700], [180, 300], [95, 175]],
    spokeN: null, // follows petal count — the stress really does follow them
  },
  {
    mode: MODE.STAR,
    size: 1.16,
    amp: [0.42, 0.55],
    freq: [5, 6],
    sharp: [0.38, 0.62],
    ret: [[380, 520], [600, 830], [150, 250], [105, 180]],
    spokeN: null,
  },
  {
    mode: MODE.GEAR,
    size: 1.06,
    amp: [0.17, 0.24],
    freq: [10, 12, 14],
    sharp: 1,
    ret: [[520, 700], [420, 600], [265, 400], [95, 175]],
    spokeN: 6,
  },
  {
    mode: MODE.BUTTERFLY,
    size: 1.05,
    amp: [0, 0],
    freq: [1],
    sharp: 1,
    ret: [[470, 650], [430, 615], [225, 340], [135, 225]],
    spokeN: 4,
  },
  {
    mode: MODE.LEAF,
    size: 0.95,
    amp: [0, 0],
    freq: [1],
    sharp: 1,
    ret: [[460, 630], [400, 575], [255, 375], [115, 200]],
    spokeN: 2,
  },
  {
    mode: MODE.SPOON,
    size: 1.22,
    amp: [0, 0],
    freq: [1],
    sharp: 1,
    ret: [[440, 610], [530, 740], [160, 265], [100, 180]],
    spokeN: 3,
  },
];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
const lerp = (rng, r) => r[0] + rng() * (r[1] - r[0]);

/**
 * @param {() => number} rng
 * @param {number} familyHint index to force a family, or -1 for random
 */
export function makeRecipe(rng, familyHint = -1) {
  const fi = familyHint >= 0 ? familyHint % FAMILY.length : Math.floor(rng() * FAMILY.length);
  const F = FAMILY[fi];
  const freq = pick(rng, F.freq);
  const amp = F.amp[0] + rng() * (F.amp[1] - F.amp[0]);
  const sharp = Array.isArray(F.sharp) ? lerp(rng, F.sharp) : F.sharp;

  return {
    family: fi,
    mode: F.mode,
    size: F.size,
    amp,
    freq,
    phase: rng() * Math.PI * 2,
    sharp,
    // the moulding gate — where the plastic was injected; stress radiates from it
    gate: rng() * Math.PI * 2,
    spokeN: F.spokeN === null ? freq : F.spokeN,
    ret: [
      lerp(rng, F.ret[0]),
      lerp(rng, F.ret[1]),
      lerp(rng, F.ret[2]),
      lerp(rng, F.ret[3]),
    ],
    seed: [
      2.0 + rng() * 3.4, // blob freq A
      2.0 + rng() * 3.4, // blob freq B
      rng() * Math.PI * 2, // phase
      rng(), // subtle hero-tint bias: pink-leaning vs cyan-leaning
    ],
    // the angle where this particular piece looks its very best
    sweet: rng() * Math.PI,
    rot: (rng() - 0.5) * 0.55,
  };
}

/** Hero piece plus the two companions it will be joined by. */
export function makeSet(seed) {
  const rng = mulberry32(seed);
  const hero = makeRecipe(rng);
  const others = [];
  const used = new Set([hero.family]);
  while (others.length < 2) {
    const r = makeRecipe(rng);
    if (used.has(r.family) && used.size < FAMILY.length) continue;
    used.add(r.family);
    others.push(r);
  }
  return { seed, hero, others };
}

export const FAMILY_COUNT = FAMILY.length;

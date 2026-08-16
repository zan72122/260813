import * as THREE from '../lib/three.module.js';
import { clamp } from './util.js';

// The game's whole color language lives here. Dyes are stored as three
// primary amounts (red / blue / yellow, each 0..1). Mixing is done in a
// subtractive "paint filter" space so red+blue really drifts through
// murky purple into a saturated purple, blue+yellow into green, etc.
// The result is then re-brightened so every mixture — including "wrong"
// three-color mixtures — stays pretty and kid-friendly.

export const DYE = {
  red:    { filter: new THREE.Color(1.0, 0.28, 0.34), water: new THREE.Color(0.93, 0.13, 0.2) },
  blue:   { filter: new THREE.Color(0.30, 0.52, 1.0), water: new THREE.Color(0.1, 0.36, 0.95) },
  yellow: { filter: new THREE.Color(1.0, 0.88, 0.26), water: new THREE.Color(1.0, 0.78, 0.05) },
};

const _c = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

// amounts: {r, b, y}. out: THREE.Color. Returns saturation strength 0..1.
export function mixDye(amounts, out) {
  const r = clamp(amounts.r, 0, 1);
  const b = clamp(amounts.b, 0, 1);
  const y = clamp(amounts.y, 0, 1);
  const total = r + b + y;
  if (total < 1e-4) {
    out.setRGB(1, 1, 1);
    return 0;
  }
  // Subtractive: white light through each dye filter, proportional to amount.
  const fr = DYE.red.filter, fb = DYE.blue.filter, fy = DYE.yellow.filter;
  let cr = Math.pow(fr.r, r) * Math.pow(fb.r, b) * Math.pow(fy.r, y);
  let cg = Math.pow(fr.g, r) * Math.pow(fb.g, b) * Math.pow(fy.g, y);
  let cb = Math.pow(fr.b, r) * Math.pow(fb.b, b) * Math.pow(fy.b, y);
  _c.setRGB(cr, cg, cb);
  // Re-brighten: keep the hue, lift lightness and saturation so mixtures
  // stay vivid instead of muddy. Even red+blue+yellow lands on a warm
  // cocoa rather than a punishing grey.
  _c.getHSL(_hsl);
  // Shade comes from concentration: a light dip gives an airy pastel, a
  // long deep soak gives a rich saturated colour — same hue, new shade.
  const maxc = Math.max(r, b, y);
  const strength = clamp(maxc + (total - maxc) * 0.25, 0, 1);
  const l = 0.78 - 0.42 * strength;
  const s = clamp(_hsl.s * 1.5 + 0.3, 0, 0.98);
  out.setHSL(_hsl.h, s, clamp(l, 0.34, 0.85));
  return strength;
}

// Convenience: mixed colour of a plain {r,b,y} object as a fresh Color.
export function dyeColor(amounts) {
  const c = new THREE.Color();
  mixDye(amounts, c);
  return c;
}

import * as THREE from 'three';
import { fbm2 } from '../core/math';

export interface Palette {
  key: string;
  /** flower colours, ordered so neighbouring entries look good side by side */
  flowers: string[];
  sky: string;
  skyLow: string;
  fog: string;
  sun: string;
  /** how strongly the field is organised into stripes vs. blobs */
  banding: number;
  bandAngle: number;
  green: string;
  greenDark: string;
}

/**
 * Real tulip fields are planted in blocks, which is why they read so well from
 * far away. Each palette keeps pink generous (the brief asks for it) and avoids
 * putting two similar hues next to each other.
 */
export const PALETTES: Palette[] = [
  {
    key: 'classic',
    flowers: ['#d92b46', '#ef5f92', '#ffc634', '#fbeedd', '#f5772c', '#9a4fc4', '#f68fb8', '#c8203f'],
    sky: '#5aa8de', skyLow: '#d8ecfa', fog: '#cfe6f4', sun: '#fff4dc',
    banding: 0.55, bandAngle: 0.42, green: '#5eb45f', greenDark: '#2f7a44',
  },
  {
    key: 'pastel',
    flowers: ['#f79ab8', '#ffd0e0', '#fbe58f', '#f4efe6', '#b79bf0', '#f8bd87', '#ef88ab', '#e2c6f5'],
    sky: '#78c0ea', skyLow: '#eaf5fd', fog: '#e0eff9', sun: '#fff6e6',
    banding: 0.7, bandAngle: 1.15, green: '#7cc47a', greenDark: '#3f8a56',
  },
  {
    key: 'sunset',
    flowers: ['#ee3d55', '#f4784a', '#ffc23c', '#f6dcc0', '#e14c81', '#a557bd', '#ef5f88', '#f59547'],
    sky: '#5f95d8', skyLow: '#ffd9b8', fog: '#eeccb6', sun: '#ffe0b0',
    banding: 0.4, bandAngle: -0.7, green: '#57a45c', greenDark: '#2c6f42',
  },
  {
    key: 'meadow',
    flowers: ['#e42f5f', '#ffc93a', '#f2ece0', '#f7719c', '#8b4fd6', '#f58e33', '#f5aac5', '#cf2a4c'],
    sky: '#4f9fdb', skyLow: '#ddf0ff', fog: '#cbe6f6', sun: '#fff2d0',
    banding: 0.85, bandAngle: 2.0, green: '#63bb63', greenDark: '#337a46',
  },
];

const _c = new THREE.Color();
const _b = new THREE.Color();

/** Cached THREE.Color objects per palette - bandColor runs 260k times per rebuild. */
const cache = new WeakMap<Palette, THREE.Color[]>();
function colorsOf(p: Palette): THREE.Color[] {
  let c = cache.get(p);
  if (!c) { c = p.flowers.map((h) => new THREE.Color(h)); cache.set(p, c); }
  return c;
}

/**
 * Which flower colour belongs at this spot on the field.
 * The instanced flowers and the ground carpet texture both call this, which is
 * what makes the carpet and the actual flowers agree all the way to the horizon.
 */
export function bandValue(x: number, z: number, p: Palette, seed: number): number {
  // Feature sizes are ~20 m: big enough to read as planted blocks from the air,
  // small enough that several colours are always in frame at ground level.
  const blob = fbm2(x * 0.048 + 40, z * 0.048 + 40, 3, seed);
  const ca = Math.cos(p.bandAngle), sa = Math.sin(p.bandAngle);
  const along = x * ca + z * sa;
  const stripe = 0.5 + 0.5 * Math.sin(along * 0.26 + blob * 4.2 + seed * 0.7);
  const fine = fbm2(x * 0.16 - 12, z * 0.16 - 12, 2, seed + 31);
  return Math.min(0.9999, Math.max(0, blob * (1 - p.banding) + stripe * p.banding + (fine - 0.5) * 0.12));
}

export function bandColor(x: number, z: number, p: Palette, seed: number, out = _c): THREE.Color {
  const cols = colorsOf(p);
  const v = bandValue(x, z, p, seed);
  const n = cols.length;
  const f = v * n;
  const i = Math.min(n - 1, Math.floor(f));
  const j = Math.min(n - 1, i + 1);
  const t = f - i;
  // hard-ish edges keep the blocks readable, but never a pixel-crisp seam
  const k = t < 0.86 ? 0 : (t - 0.86) / 0.14;
  out.copy(cols[i]);
  if (k > 0) out.lerp(_b.copy(cols[j]), k);
  return out;
}

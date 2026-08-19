import * as THREE from 'three';

/**
 * Every world measurement in one place. Units are metres.
 *
 * The dimensions are driven by the hardest constraint in the whole project: a
 * 19.5:9 iPhone held upright gives roughly +/-15 degrees of horizontal view.
 * Anything the child must see at the same time as the planting row has to fit
 * inside about a metre of width, so the plot is small and deep rather than wide.
 */

/** The planting row. Four bulbs is enough to feel like "I did all of this". */
export const HOLES: { x: number; z: number }[] = [
  // z is kept just inside the cut-away trench, so nothing of the bed is ever
  // left standing in front of a bulb, a root or a shoot.
  { x: -0.45, z: 0.040 },
  { x: -0.15, z: 0.072 },
  { x: 0.15, z: 0.040 },
  { x: 0.45, z: 0.072 },
];

export const BED = {
  halfX: 0.82,
  halfZ: 0.66,
  top: 0.050,
  /** how far in from the edge the bed slopes back down to the field */
  skirt: 0.30,
};

export const HOLE = {
  radius: 0.105,
  depth: 0.205,
  /** how close a finger has to get before the bulb is pulled in - very generous */
  snap: 0.46,
  /** release anywhere inside this and it still plants; nothing ever fails */
  forgive: 1.30,
};

export const BULB = {
  height: 0.165,
  radius: 0.055,
};

/** Where the basket sits, blended between portrait and landscape framings. */
/*
 * The basket, portrait and landscape.
 *
 * Landscape only shifts it sideways rather than out to the side of the bed:
 * an iPad in landscape is 1.43:1, which is nothing like an iPhone's 2.16:1, and
 * anything far off-axis simply falls outside the narrower frame.
 */
export const BASKET_P = new THREE.Vector3(0.0, 0, 1.06);
export const BASKET_L = new THREE.Vector3(-0.66, 0, 1.06);
export const BASKET_R = 0.21;

/** Irrigation channel: runs left to right just beyond the planting row. */
export const CHANNEL = {
  z: -1.16,
  y: 0.0,
  fromX: -0.50,
  toX: 0.95,
  width: 0.30,
  depth: 0.105,
};

export const GATE = { x: -0.50, z: -1.16 };

/** The cut-away face the cross-section shot looks at. */
export const SECTION = {
  z: -0.075,
  halfX: 2.4,
  bottom: -1.60,
  top: 0.06,
};

/** Root / sprout extents in the cross-section. */
export const GROWTH = {
  rootBottom: -0.92,
  sproutTop: 0.34,
};

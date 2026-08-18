// Single import point for the style lock. All visual constants flow from
// docs/STYLE_LOCK.json — see docs/DESIGN_CONSTITUTION.md before changing any value.
import LOCK from '../docs/STYLE_LOCK.json';

export const STYLE = LOCK;

export const PALETTE = LOCK.palette;
export const TIMING = LOCK.timing;
export const CAM = LOCK.camera;
export const LIGHTS = LOCK.lights;
export const HAIR = LOCK.hairMaterial;
export const GEM = LOCK.gemMaterial;
export const PARTICLES = LOCK.particles;

export const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

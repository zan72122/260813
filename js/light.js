// One light for the whole game.
//
// The baked material tiles (assets/baked/*.webp) had this exact direction
// solved into them at build time. Every hand-drawn highlight, rim and contact
// shadow reads from here too, so the photographed surfaces and the drawn
// shapes never disagree about where the sun is. That agreement is most of
// what makes a flat 2D scene stop looking like clip art.

/** Direction *towards* the light. Screen space: +x right, +y DOWN, +z out. */
export const LIGHT = { x: -0.42, y: -0.52, z: 0.74 };

/** The light's direction projected on screen and normalised. */
const pl = Math.hypot(LIGHT.x, LIGHT.y);
export const LIT = { x: LIGHT.x / pl, y: LIGHT.y / pl };

/** Where shadows fall — directly opposite. */
export const SHADE = { x: -LIT.x, y: -LIT.y };

/**
 * Cylinder shading terms for a round bar of radius r lit by LIGHT, given the
 * bar's screen-space normal direction (perpendicular to its axis).
 * Returns how far to shift each band from the centre line, as a fraction of r.
 */
export const CYL = {
  litShift: 0.30,     // centre of the lit band
  specShift: 0.42,    // the glint sits closer to the edge
  shadeShift: 0.30,   // the shaded side
};

/** Soft ambient floor so nothing in shadow reads as black. */
export const AMBIENT = 0.46;

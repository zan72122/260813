/** Everything on the line is laid out along +X. The camera never leaves this rail. */
export const L = {
  cells: 8, // biscuits per batch
  cell: 1.0, // one biscuit's slot along the band
  biscuitW: 0.86,
  biscuitH: 0.86,
  thickness: 0.34,
  heroBevel: 0.045, // small chamfer: the seam reads as a score line, not a gap
  bakedThickness: 0.42,

  beltY: 0, // top of the conveyor
  beltZ: 0,
  beltHalfW: 0.72,

  rollX: -13.4, // dough supply roll
  printX: -6.2, // printing drum
  printR: 0.78,
  cutX: 1.8, // cutting drum (exactly one band length past the printer)
  cutR: 0.6,
  ovenX0: 11.0,
  ovenX1: 16.4,
  bakeLine: 13.4,
  bakeSpan: 2.0,
  bakePush: 13.2, // how far the batch must travel for the last biscuit to brown

  holeX: -0.27, // injection hole, offset from the biscuit centre
  chocoFullR: 0.78, // fill radius that reaches the far corner from the hole
  heroX: 22.5, // where one biscuit is lifted for the macro shots
  heroY: 2.7, // held high enough that the under-shot never looks through the belt

  trayX: 34,
  trayZ: 0,

  stripLen: 8, // 8 cells of 1.0
  stripStartHead: -6.2, // head of the band starts under the printing drum
};

/** The band's head position for a given amount of rolling. */
export const headX = (advance) => L.stripStartHead + advance;

/** Where biscuit `i` (0 = first one cut, nearest the oven) sits after cutting. */
export function biscuitX(i, cutAdvance) {
  const cutAt = i + 1; // the band must advance this far for biscuit i to be cut
  const travelled = Math.max(0, cutAdvance - cutAt);
  return L.cutX + 0.5 + travelled;
}

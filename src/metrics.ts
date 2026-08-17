// All the shared dimensions of the tiramisu set, in world units.
// The container sits at the origin; its inner floor is at y = FLOOR_Y.

export const INNER_X = 2.3
export const INNER_Z = 1.65
export const WALL = 0.06
export const FLOOR_Y = 0.06
export const RIM_Y = 1.1

export const BISCUIT_LEN = 1.5
export const BISCUIT_W = 0.52
export const BISCUIT_H = 0.26
export const CREAM_H = 0.14

export const SLOTS = [-0.87, -0.29, 0.29, 0.87]

/** y of the bottom of the biscuit layer `layer` (0 or 1) */
export const biscuitBaseY = (layer: number) => FLOOR_Y + layer * (BISCUIT_H + CREAM_H)
export const biscuitTopY = (layer: number) => biscuitBaseY(layer) + BISCUIT_H
export const creamTopY = (layer: number) => biscuitTopY(layer) + CREAM_H

export const CONTENT_TOP = creamTopY(1) // 0.86

// The pre-cut slice: corner region x in [CUT_X, innerWall], z in [CUT_Z, innerWall]
export const CUT_X = 0.58
export const CUT_Z = 0.0

export const TRAY_POS = { x: -2.7, z: 0.55 }
export const TRAY_R = 1.0
export const COFFEE_Y = 0.24

export const FRIDGE_POS = { x: 3.7, z: -1.6 }

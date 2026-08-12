/**
 * Shared world-space layout constants, per docs/CAMERA_STORYBOARD.md
 * "空間レイアウト（ワールド座標の約束）". Pure data; no Three.js imports so
 * camera code can share it without pulling in scene-graph deps.
 */
export const STAGE_Y = 0;
export const UNDERSTAGE_TOP_Y = 0;
export const UNDERSTAGE_BOTTOM_Y = -3.2;
export const BACKDROP_Z = -6;

/** Wing pair depth slots (near -> far into the stage). */
export const WING_Z = [-1.0, -2.2, -3.6] as const;
/** Wing pair home X (offstage side), matches "x=±2.2〜±3.5". */
export const WING_HOME_X = [2.2, 2.85, 3.5] as const;
/** Extra travel distance a wing slides to fully exit into the wings. */
export const WING_EXIT_TRAVEL = 2.4;

export const FOREGROUND_Z = [-1.0, -1.5, -2.0] as const;
export const FOREGROUND_HOME_Y = [0.35, 0.3, 0.4] as const;
/** How far a foreground prop sinks below / rises from the stage floor. */
export const FOREGROUND_HIDE_DEPTH = -1.8;

export const BORDER_HOME_Y = 3.1;
export const BORDER_HIDE_Y = 5.4;
export const BACKDROP_HOME_Y = 1.4;
export const BACKDROP_HIDE_Y = -3.2;

/** Proscenium arch / auditorium framing, audience side (z+). */
export const PROSCENIUM_Z = 1.0;
export const PROSCENIUM_HALF_WIDTH = 3.9;
export const PROSCENIUM_HEIGHT = 4.4;
export const AUDITORIUM_SEAT_Z = [2.4, 3.6] as const;

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
/** Compound prop groups (see StageWorld's buildForegroundProp) sit on the floor at group-Y=0;
 * each sub-mesh's own local Y offset gives the prop its height, so all three home to the same base. */
export const FOREGROUND_HOME_Y = [0, 0, 0] as const;
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

/**
 * Solid stage floor (occludes the understage from every audience-side pose so the cutaway
 * only reads as an opening during descend/mechanism phases -- see TheaterScene's
 * UNDERSTAGE_VISIBLE_PHASES gate). Spans a little past the widest wing pair and from just
 * inside the proscenium to just short of the backdrop.
 */
export const STAGE_FLOOR_WIDTH = 8.6;
export const STAGE_FLOOR_NEAR_Z = 1.5;
export const STAGE_FLOOR_FAR_Z = -5.6;
export const STAGE_FLOOR_THICKNESS = 0.16;

import * as THREE from 'three';
import type { Vec2 } from '../game/types.ts';

/** World-unit conversion for the normalized [-1,1] coordinates used by the game logic layer. */
export const WORLD_SCALE = 1.55;

export const ROOM_HALF_WIDTH = 1.85;
export const ROOM_HALF_DEPTH = 1.5;
export const WALL_HEIGHT = 1.85;
export const FLOOR_Y = 0;

export function vec2ToWorld(v: Vec2, y = 0, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v.x * WORLD_SCALE, y, v.z * WORLD_SCALE);
}

export function worldToVec2(v: THREE.Vector3): Vec2 {
  return { x: v.x / WORLD_SCALE, z: v.z / WORLD_SCALE };
}

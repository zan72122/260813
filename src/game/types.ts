/**
 * Shared domain types for the game logic layer. Zero three.js imports here —
 * this file (and everything in src/game/) must stay renderer-agnostic so it
 * can be unit tested in plain Node/Vitest.
 */

export const PHASES = [
  'TITLE',
  'PLAY_CLEANUP',
  'LUNCH_SETUP',
  'LUNCH_CLEANUP',
  'NAP_SETUP',
  'WAKE_RESTORE',
  'REPLAY',
  'FREE_PLAY',
] as const;

export type Phase = (typeof PHASES)[number];

export const TOY_SYMBOLS = ['star', 'rainbow', 'flower'] as const;
export type ToySymbol = (typeof TOY_SYMBOLS)[number];

export const TOY_MATERIALS = ['wood', 'fabric', 'plastic'] as const;
export type ToyMaterial = (typeof TOY_MATERIALS)[number];

export const WEATHER_KINDS = ['sun', 'lightRain', 'clouds'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const SHELF_THEMES = ['blocks', 'plants', 'books'] as const;
export type ShelfTheme = (typeof SHELF_THEMES)[number];

export interface Vec2 {
  x: number;
  z: number;
}

export interface ToyDef {
  id: string;
  symbol: ToySymbol;
  material: ToyMaterial;
  /** Normalized floor position in [-1, 1] x [-1, 1] room-local space. */
  start: Vec2;
  /** Small per-toy rotation for visual variety, radians. */
  rotationY: number;
}

export interface BasketDef {
  id: string;
  symbol: ToySymbol;
  position: Vec2;
  /** Visual radius in world units; capture radius = this * CAPTURE_RADIUS_MULTIPLIER. */
  radius: number;
}

export interface ChildDef {
  id: string;
  skinTone: number; // hue index into palette, not literal color, kept in scene layer
  hairStyle: number;
  hairColor: number;
  clothesColor: number;
  badgeSymbol: ToySymbol;
  seatIndex: number;
}

export interface MatDef {
  id: string;
  colorway: number; // index into curated colorway list (scene layer resolves to actual colors)
  markerIndex: number;
}

export interface SeedConfig {
  seed: number;
  toys: ToyDef[];
  baskets: BasketDef[];
  children: ChildDef[];
  mats: MatDef[];
  morningLightAngle: number; // radians
  weather: WeatherKind;
  shelfTheme: ShelfTheme;
}

export const CHILD_BADGE_POOL: readonly ToySymbol[] = ['star', 'rainbow', 'flower', 'star'];

export const TOTAL_TOYS = 7;
export const TOTAL_CHAIRS = 4;
export const TOTAL_TRAYS = 4;
export const TOTAL_MATS = 4;
export const TOTAL_CHILDREN = 4;

/** Capture radius multiplier applied to a basket/marker's visual radius. */
export const CAPTURE_RADIUS_MULTIPLIER = 2.2;

export const VIGNETTE_DURATION_MS = 8000;

export const HINT_WIGGLE_IDLE_MS = 3000;
export const HINT_GHOST_IDLE_MS = 7000;
export const HINT_GHOST_LOOP_MS = 6000;

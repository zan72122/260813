import { clamp } from './math';

/**
 * The grating direction field the child paints with their finger.
 *
 * A groove direction is an *axis*, not an arrow: stroking right and stroking
 * left cut the same ruling. Storing it as a plain vector makes a back-and-forth
 * scribble average to zero and the grating vanish. So a direction is stored as
 * its *doubled angle* - (cos2θ, sin2θ) - which maps θ and θ+180° to the same
 * value, and therefore blends correctly.
 *
 * The length of a blended director falls out for free as the local
 * *coherence*: 1 where strokes agree, 0 where they cross. That is what turns
 * careful strokes into crisp rainbow bands and frantic scribbling into silver
 * glitter, with no extra bookkeeping.
 */
export interface Director {
  /** cos(2θ) */
  c: number;
  /** sin(2θ) */
  s: number;
}

/** No preferred direction: what an unpainted part of the card holds. */
export const NEUTRAL_DIRECTOR: Director = { c: 0, s: 0 };

/** Grating pitch, in bands per card width. */
export const PITCH_MIN = 7;
export const PITCH_MAX = 18;

/** Stroke speed, in card-widths per second, that maps to the coarsest ruling. */
export const SPEED_FOR_COARSEST = 1.6;

export function directorFromDelta(dx: number, dy: number): Director {
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return { c: 0, s: 0 };
  return { c: (dx * dx - dy * dy) / l2, s: (2 * dx * dy) / l2 };
}

export function directorFromAngle(theta: number): Director {
  return { c: Math.cos(2 * theta), s: Math.sin(2 * theta) };
}

/**
 * The grating vector for a stroke: grooves run *along* the finger, and the
 * colour varies across them, so this is the stroke axis turned 90°. In doubled
 * angle terms a quarter turn is just a negation.
 */
export function gratingDirectorFromStroke(dx: number, dy: number): Director {
  const d = directorFromDelta(dx, dy);
  return { c: -d.c, s: -d.s };
}

/** Recover one of the two equivalent unit vectors along the axis. */
export function axisFromDirector(d: Director): { x: number; y: number } {
  const theta = 0.5 * Math.atan2(d.s, d.c);
  return { x: Math.cos(theta), y: Math.sin(theta) };
}

/** 0 = strokes cancel out (scribble), 1 = strokes all agree. */
export function coherence(d: Director): number {
  return Math.min(1, Math.hypot(d.c, d.s));
}

export function blendDirectors(a: Director, b: Director, t: number): Director {
  return { c: a.c + (b.c - a.c) * t, s: a.s + (b.s - a.s) * t };
}

/** Pack a -1..1 value into a texture byte. */
export function encodeSigned(v: number): number {
  return clamp(Math.round((v * 0.5 + 0.5) * 255), 0, 255);
}

export function decodeSigned(byte: number): number {
  return (byte / 255) * 2 - 1;
}

/** Pack a 0..1 value into a texture byte. */
export function encodeUnit(v: number): number {
  return clamp(Math.round(v * 255), 0, 255);
}

/**
 * A slow, careful stroke cuts a fine ruling; a fast sweep cuts a coarse one.
 * Returns 0..1, which the shader maps onto PITCH_MIN..PITCH_MAX.
 */
export function pitchFromSpeed(speed: number): number {
  return clamp(1 - speed / SPEED_FOR_COARSEST, 0, 1);
}

/** The rgb bytes written into the field texture for one stroke segment. */
export function fieldColor(d: Director, pitch01: number): [number, number, number] {
  return [encodeSigned(d.c), encodeSigned(d.s), encodeUnit(pitch01)];
}

/** The byte triple an unpainted field holds: no direction, middling pitch. */
export const NEUTRAL_FIELD_COLOR: [number, number, number] = [
  encodeSigned(0),
  encodeSigned(0),
  encodeUnit(0.5),
];

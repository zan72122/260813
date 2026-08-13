import { clamp } from '../core/math';
import type { StampPlacement } from '../art/relief';

/**
 * A finished card, stored as the *materials* rather than as an image: which
 * base card, which press head, where it was stamped, and the path the child
 * rolled. Replaying those calls reproduces the card exactly, which keeps the
 * album tiny and proves the recording is complete.
 */
export const RECORD_VERSION = 1;

export const ALBUM_KEY = 'himitsu-hologram:album:v1';
export const MAX_CARDS = 12;

/** Points closer together than this (in card uv) are not worth recording. */
export const MIN_POINT_STEP = 0.012;

/** Hard cap so one very long roll cannot fill up storage. */
export const MAX_POINTS = 900;

export interface CardRecord {
  v: number;
  card: number;
  motif: number;
  /** Flat [u, v, ...] as 0..255 bytes. */
  stamps: number[];
  /** One entry per finger-down, each flat [u, v, pitch, ...] as 0..255 bytes. */
  strokes: number[][];
  /** Epoch ms, used only for ordering. */
  t: number;
}

export function quantize(x: number): number {
  return clamp(Math.round(x * 255), 0, 255);
}

export function dequantize(b: number): number {
  return clamp(b, 0, 255) / 255;
}

export function newRecord(card: number, motif: number, at = 0): CardRecord {
  return { v: RECORD_VERSION, card, motif, stamps: [], strokes: [], t: at };
}

export function addStamp(rec: CardRecord, u: number, v: number): void {
  rec.stamps.push(quantize(u), quantize(v));
}

export function stampsOf(rec: CardRecord): StampPlacement[] {
  const out: StampPlacement[] = [];
  for (let i = 0; i + 1 < rec.stamps.length; i += 2) {
    out.push({ u: dequantize(rec.stamps[i]), v: dequantize(rec.stamps[i + 1]) });
  }
  return out;
}

export function pointCount(rec: CardRecord): number {
  return rec.strokes.reduce((n, s) => n + s.length / 3, 0);
}

export function beginStroke(rec: CardRecord): void {
  rec.strokes.push([]);
}

/**
 * Append a point to the stroke in progress. Returns false when the point was
 * dropped for being too close to the previous one, or because the record is
 * already at its cap.
 */
export function addPoint(rec: CardRecord, u: number, v: number, pitch01: number): boolean {
  const stroke = rec.strokes[rec.strokes.length - 1];
  if (!stroke) return false;
  if (pointCount(rec) >= MAX_POINTS) return false;

  const n = stroke.length;
  if (n >= 3) {
    const du = u - dequantize(stroke[n - 3]);
    const dv = v - dequantize(stroke[n - 2]);
    if (Math.hypot(du, dv) < MIN_POINT_STEP) return false;
  }
  stroke.push(quantize(u), quantize(v), quantize(pitch01));
  return true;
}

/** Walk a recorded stroke as (u, v, pitch) triples. */
export function strokePoints(stroke: number[]): { u: number; v: number; pitch: number }[] {
  const out: { u: number; v: number; pitch: number }[] = [];
  for (let i = 0; i + 2 < stroke.length; i += 3) {
    out.push({
      u: dequantize(stroke[i]),
      v: dequantize(stroke[i + 1]),
      pitch: dequantize(stroke[i + 2]),
    });
  }
  return out;
}

/** True when the value came from us and can be replayed safely. */
export function isValidRecord(x: unknown): x is CardRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as Partial<CardRecord>;
  if (r.v !== RECORD_VERSION) return false;
  if (typeof r.card !== 'number' || typeof r.motif !== 'number') return false;
  if (!Array.isArray(r.stamps) || r.stamps.some((n) => typeof n !== 'number')) return false;
  if (!Array.isArray(r.strokes)) return false;
  for (const s of r.strokes) {
    if (!Array.isArray(s) || s.some((n) => typeof n !== 'number')) return false;
  }
  return true;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Safari throws on localStorage access in some privacy modes.
    return null;
  }
}

/** Newest first. Never throws: a corrupt album is simply an empty one. */
export function loadAlbum(store: StorageLike | null = defaultStorage()): CardRecord[] {
  if (!store) return [];
  try {
    const raw = store.getItem(ALBUM_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecord).slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}

/** Puts the card at the front and drops the oldest past MAX_CARDS. */
export function saveToAlbum(
  rec: CardRecord,
  store: StorageLike | null = defaultStorage(),
): CardRecord[] {
  const next = [rec, ...loadAlbum(store)].slice(0, MAX_CARDS);
  if (!store) return next;
  try {
    store.setItem(ALBUM_KEY, JSON.stringify(next));
  } catch {
    // Out of quota or storage disabled: the card still plays, it just will not
    // be there next time. Losing it is never worth interrupting a 4-year-old.
  }
  return next;
}

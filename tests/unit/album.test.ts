import { describe, expect, it } from 'vitest';
import {
  ALBUM_KEY,
  MAX_CARDS,
  MAX_POINTS,
  MIN_POINT_STEP,
  RECORD_VERSION,
  addPoint,
  addStamp,
  beginStroke,
  isValidRecord,
  loadAlbum,
  newRecord,
  pointCount,
  saveToAlbum,
  stampsOf,
  strokePoints,
} from '../../src/game/album';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    raw: map,
  };
}

function recordWithStroke(points: [number, number][], card = 0, motif = 0) {
  const rec = newRecord(card, motif, 1);
  beginStroke(rec);
  for (const [u, v] of points) addPoint(rec, u, v, 0.5);
  return rec;
}

describe('stamps', () => {
  it('round-trips positions to within a byte', () => {
    const rec = newRecord(1, 2);
    addStamp(rec, 0.25, 0.8);
    addStamp(rec, 0.5, 0.1);
    const out = stampsOf(rec);
    expect(out).toHaveLength(2);
    expect(out[0].u).toBeCloseTo(0.25, 2);
    expect(out[0].v).toBeCloseTo(0.8, 2);
    expect(out[1].u).toBeCloseTo(0.5, 2);
  });
});

describe('stroke recording', () => {
  it('keeps points that are far enough apart', () => {
    const rec = recordWithStroke([
      [0.1, 0.1],
      [0.5, 0.5],
      [0.9, 0.9],
    ]);
    expect(pointCount(rec)).toBe(3);
  });

  it('drops points too close to the previous one', () => {
    const rec = newRecord(0, 0);
    beginStroke(rec);
    expect(addPoint(rec, 0.5, 0.5, 0.5)).toBe(true);
    expect(addPoint(rec, 0.5 + MIN_POINT_STEP * 0.2, 0.5, 0.5)).toBe(false);
    expect(addPoint(rec, 0.5 + MIN_POINT_STEP * 2, 0.5, 0.5)).toBe(true);
    expect(pointCount(rec)).toBe(2);
  });

  it('refuses points before a stroke has been started', () => {
    const rec = newRecord(0, 0);
    expect(addPoint(rec, 0.5, 0.5, 0.5)).toBe(false);
  });

  it('stops recording at the cap instead of growing without bound', () => {
    const rec = newRecord(0, 0);
    beginStroke(rec);
    for (let i = 0; i < MAX_POINTS + 200; i++) {
      addPoint(rec, (i % 40) / 40, Math.floor(i / 40) / 40, 0.5);
    }
    expect(pointCount(rec)).toBeLessThanOrEqual(MAX_POINTS);
  });

  it('reads back the points it stored, pitch included', () => {
    const rec = newRecord(0, 0);
    beginStroke(rec);
    addPoint(rec, 0.2, 0.3, 0.75);
    const [p] = strokePoints(rec.strokes[0]);
    expect(p.u).toBeCloseTo(0.2, 2);
    expect(p.v).toBeCloseTo(0.3, 2);
    expect(p.pitch).toBeCloseTo(0.75, 2);
  });

  it('is lossless enough that a replay follows the same path', () => {
    const path: [number, number][] = Array.from({ length: 20 }, (_, i) => [
      0.05 + i * 0.045,
      0.5 + Math.sin(i * 0.6) * 0.3,
    ]);
    const rec = recordWithStroke(path);
    const back = strokePoints(rec.strokes[0]);
    back.forEach((p, i) => {
      expect(Math.hypot(p.u - path[i][0], p.v - path[i][1])).toBeLessThan(0.01);
    });
  });
});

describe('album storage', () => {
  it('starts empty', () => {
    expect(loadAlbum(fakeStorage())).toEqual([]);
  });

  it('saves and reloads a card', () => {
    const store = fakeStorage();
    const rec = recordWithStroke([
      [0.2, 0.2],
      [0.8, 0.8],
    ]);
    saveToAlbum(rec, store);
    const back = loadAlbum(store);
    expect(back).toHaveLength(1);
    expect(back[0].card).toBe(rec.card);
    expect(strokePoints(back[0].strokes[0])).toHaveLength(2);
  });

  it('puts the newest card first', () => {
    const store = fakeStorage();
    saveToAlbum(newRecord(0, 0, 1), store);
    saveToAlbum(newRecord(2, 1, 2), store);
    const back = loadAlbum(store);
    expect(back[0].card).toBe(2);
    expect(back[1].card).toBe(0);
  });

  it('keeps only the most recent MAX_CARDS', () => {
    const store = fakeStorage();
    for (let i = 0; i < MAX_CARDS + 6; i++) saveToAlbum(newRecord(i % 3, 0, i), store);
    const back = loadAlbum(store);
    expect(back).toHaveLength(MAX_CARDS);
    expect(back[0].t).toBe(MAX_CARDS + 5);
  });

  it('treats a corrupt album as an empty one rather than throwing', () => {
    const store = fakeStorage();
    store.setItem(ALBUM_KEY, '{not json');
    expect(loadAlbum(store)).toEqual([]);
    store.setItem(ALBUM_KEY, '{"nope":1}');
    expect(loadAlbum(store)).toEqual([]);
  });

  it('drops records written by a different version', () => {
    const store = fakeStorage();
    const stale = { ...newRecord(0, 0, 1), v: RECORD_VERSION + 1 };
    store.setItem(ALBUM_KEY, JSON.stringify([stale, newRecord(1, 1, 2)]));
    const back = loadAlbum(store);
    expect(back).toHaveLength(1);
    expect(back[0].card).toBe(1);
  });

  it('survives having no storage at all', () => {
    expect(loadAlbum(null)).toEqual([]);
    expect(saveToAlbum(newRecord(0, 0, 1), null)).toHaveLength(1);
  });

  it('does not lose the card when storage refuses to write', () => {
    const wedged = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveToAlbum(newRecord(0, 0, 1), wedged)).not.toThrow();
  });
});

describe('isValidRecord', () => {
  it('accepts what we write', () => {
    expect(isValidRecord(recordWithStroke([[0.5, 0.5]]))).toBe(true);
  });

  it('rejects junk', () => {
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord(42)).toBe(false);
    expect(isValidRecord({ v: RECORD_VERSION })).toBe(false);
    expect(isValidRecord({ ...newRecord(0, 0), stamps: ['x'] })).toBe(false);
    expect(isValidRecord({ ...newRecord(0, 0), strokes: [['x']] })).toBe(false);
  });
});

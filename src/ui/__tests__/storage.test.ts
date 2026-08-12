import { describe, expect, it } from 'vitest';
import { readStoredMuted, safeGetItem, safeSetItem, writeStoredMuted } from '../storage';
import type { StorageLike } from '../storage';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
}

describe('safeGetItem / safeSetItem', () => {
  it('round-trips through a working storage', () => {
    const storage = memoryStorage();
    expect(safeSetItem('k', 'v', storage)).toBe(true);
    expect(safeGetItem('k', storage)).toBe('v');
  });

  it('never throws when storage.getItem/setItem throw', () => {
    const storage = throwingStorage();
    expect(() => safeGetItem('k', storage)).not.toThrow();
    expect(() => safeSetItem('k', 'v', storage)).not.toThrow();
    expect(safeGetItem('k', storage)).toBeNull();
    expect(safeSetItem('k', 'v', storage)).toBe(false);
  });

  it('returns null/false when storage is unavailable (null)', () => {
    expect(safeGetItem('k', null)).toBeNull();
    expect(safeSetItem('k', 'v', null)).toBe(false);
  });
});

describe('readStoredMuted / writeStoredMuted', () => {
  it('is null before anything is written', () => {
    const storage = memoryStorage();
    expect(readStoredMuted(storage)).toBeNull();
  });

  it('persists true/false across write then read', () => {
    const storage = memoryStorage();
    writeStoredMuted(true, storage);
    expect(readStoredMuted(storage)).toBe(true);
    writeStoredMuted(false, storage);
    expect(readStoredMuted(storage)).toBe(false);
  });

  it('degrades to null on a throwing storage instead of crashing', () => {
    const storage = throwingStorage();
    expect(() => writeStoredMuted(true, storage)).not.toThrow();
    expect(readStoredMuted(storage)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import {
  loadSoundPreference,
  saveSoundPreference,
  type StorageLike,
} from '../../../src/ui/soundPreference.ts';

function createMockStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('sound preference persistence', () => {
  it('returns the fallback when nothing has been persisted yet', () => {
    const storage = createMockStorage();
    expect(loadSoundPreference(storage, true)).toBe(true);
    expect(loadSoundPreference(storage, false)).toBe(false);
  });

  it('round-trips true and false through save -> load', () => {
    const storage = createMockStorage();
    saveSoundPreference(storage, false);
    expect(loadSoundPreference(storage, true)).toBe(false);

    saveSoundPreference(storage, true);
    expect(loadSoundPreference(storage, false)).toBe(true);
  });

  it('does not use the fallback once a value has been persisted, even if it disagrees', () => {
    const storage = createMockStorage();
    saveSoundPreference(storage, false);
    expect(loadSoundPreference(storage, true)).toBe(false);
  });

  it('falls back gracefully when storage.getItem throws (private-browsing Safari)', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadSoundPreference(storage, true)).toBe(true);
    expect(() => saveSoundPreference(storage, false)).not.toThrow();
  });
});

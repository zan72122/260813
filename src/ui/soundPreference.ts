/**
 * Sound on/off persistence (PRODUCT_SPEC "Sound on/off toggle (persisted)").
 * Storage is injected as a minimal `StorageLike` so this is unit-testable
 * against a plain in-memory mock instead of the real `localStorage`, and so
 * it degrades gracefully (falls back to the default) if storage access
 * throws — private-browsing Safari can throw on `setItem`/`getItem`.
 */

const STORAGE_KEY = 'eiffel:soundOn';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reads the persisted sound preference; `fallback` on first run or on error. */
export function loadSoundPreference(storage: StorageLike, fallback = true): boolean {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    return raw === '1';
  } catch {
    return fallback;
  }
}

/** Persists the sound preference; silently ignored if storage throws. */
export function saveSoundPreference(storage: StorageLike, enabled: boolean): void {
  try {
    storage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Private-browsing / quota errors: the toggle still works this session.
  }
}

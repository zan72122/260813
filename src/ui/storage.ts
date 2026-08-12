// src/ui/storage.ts — tiny try/catch guarded localStorage wrapper. Storage
// can throw (private browsing, quota, disabled) so every call site must be
// defensive; kept here as pure, injectable functions for unit testing
// without a real browser localStorage.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function safeGetItem(key: string, storage: StorageLike | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(
  key: string,
  value: string,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

const MUTE_KEY = 'eiffel-steam-crane:muted';

/** Returns the persisted mute preference, or null if never set / unreadable. */
export function readStoredMuted(storage?: StorageLike | null): boolean | null {
  const raw = safeGetItem(MUTE_KEY, storage ?? defaultStorage());
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function writeStoredMuted(muted: boolean, storage?: StorageLike | null): void {
  safeSetItem(MUTE_KEY, muted ? '1' : '0', storage ?? defaultStorage());
}

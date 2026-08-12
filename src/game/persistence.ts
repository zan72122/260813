/**
 * localStorage-backed settings, guarded against unavailable/throwing storage
 * (private browsing, disabled storage). Only settings + last seed are ever
 * stored — never anything about the child (see PRODUCT_SPEC "Persistence").
 */

const KEYS = {
  muted: 'hh:muted',
  reducedMotion: 'hh:reducedMotion',
  lastSeed: 'hh:lastSeed',
} as const;

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode / disabled) — game stays playable, just not persisted.
  }
}

export function loadMuted(): boolean {
  return safeGet(KEYS.muted) === '1';
}

export function saveMuted(muted: boolean): void {
  safeSet(KEYS.muted, muted ? '1' : '0');
}

export function loadReducedMotion(): boolean {
  return safeGet(KEYS.reducedMotion) === '1';
}

export function saveReducedMotion(value: boolean): void {
  safeSet(KEYS.reducedMotion, value ? '1' : '0');
}

export function loadLastSeed(): number | null {
  const raw = safeGet(KEYS.lastSeed);
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function saveLastSeed(seed: number): void {
  safeSet(KEYS.lastSeed, String(seed));
}

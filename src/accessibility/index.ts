/**
 * owner C (mobile-qa) — src/accessibility/**.
 * Reduce Motion detection (already used by App.ts on boot) plus mute/quality
 * settings persistence (docs/MASTER_SPEC.md "Reduce Motion対応、mute、低品質モード").
 */
import type { QualityTier } from '../core';

const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function detectReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCE_MOTION_QUERY).matches;
}

/** Subscribes to OS-level Reduce Motion changes. Returns an unsubscribe function. */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCE_MOTION_QUERY);
  const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

// ---- mute / quality persistence ----

const STORAGE_KEY = 'stage-under-secret:settings:v1';
const VALID_QUALITY_TIERS: readonly QualityTier[] = ['low', 'medium', 'high'];

export interface PersistedSettings {
  muted: boolean;
  quality: QualityTier;
}

/** Guards every localStorage access: private-browsing Safari can throw on access, not just read/write. */
function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isQualityTier(value: unknown): value is QualityTier {
  return typeof value === 'string' && (VALID_QUALITY_TIERS as readonly string[]).includes(value);
}

/** Reads persisted settings written by persistMuted/persistQuality. Missing/corrupt data yields {}. */
export function loadPersistedSettings(): Partial<PersistedSettings> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const candidate = parsed as Partial<Record<keyof PersistedSettings, unknown>>;
    const result: Partial<PersistedSettings> = {};
    if (typeof candidate.muted === 'boolean') result.muted = candidate.muted;
    if (isQualityTier(candidate.quality)) result.quality = candidate.quality;
    return result;
  } catch {
    return {};
  }
}

function patchPersistedSettings(patch: Partial<PersistedSettings>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const current = loadPersistedSettings();
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Ignore quota/privacy-mode write failures — persistence is best-effort.
  }
}

export function persistMuted(muted: boolean): void {
  patchPersistedSettings({ muted });
}

export function persistQuality(quality: QualityTier): void {
  patchPersistedSettings({ quality });
}

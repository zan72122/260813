import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectReducedMotion, loadPersistedSettings, persistMuted, persistQuality } from '../../src/accessibility';

/** Minimal in-memory Storage stand-in (vitest's node environment has no localStorage). */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe('detectReducedMotion (no window in this test environment)', () => {
  it('defaults to false when window/matchMedia are unavailable', () => {
    expect(detectReducedMotion()).toBe(false);
  });
});

describe('mute/quality persistence (localStorage, restore-on-boot)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns {} when nothing has been persisted yet', () => {
    expect(loadPersistedSettings()).toEqual({});
  });

  it('round-trips a persisted mute flag', () => {
    persistMuted(true);
    expect(loadPersistedSettings()).toEqual({ muted: true });
    persistMuted(false);
    expect(loadPersistedSettings()).toEqual({ muted: false });
  });

  it('round-trips a persisted quality tier without clobbering mute', () => {
    persistMuted(true);
    persistQuality('low');
    expect(loadPersistedSettings()).toEqual({ muted: true, quality: 'low' });
  });

  it('ignores corrupt JSON instead of throwing', () => {
    localStorage.setItem('stage-under-secret:settings:v1', '{not json');
    expect(loadPersistedSettings()).toEqual({});
  });

  it('ignores an invalid quality tier value', () => {
    localStorage.setItem('stage-under-secret:settings:v1', JSON.stringify({ quality: 'ultra' }));
    expect(loadPersistedSettings()).toEqual({});
  });

  it('is a no-op (not a throw) when localStorage is unavailable', () => {
    vi.unstubAllGlobals();
    expect(() => persistMuted(true)).not.toThrow();
    expect(loadPersistedSettings()).toEqual({});
  });
});

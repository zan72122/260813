/**
 * Resolves the run seed for `createGame`. Priority order (PRODUCT_SPEC
 * "deterministic mode(?seed=N)"):
 *   1. An explicit `seed` option always wins (used by tests, replays of a
 *      known run, or any caller that already decided the seed).
 *   2. A `?seed=` URL query parameter, read once, only when a browser
 *      `window.location` is actually present.
 *   3. A fresh random seed, drawn once per session.
 *
 * Never throws — any failure reading `window.location` (unusual embedding,
 * restrictive sandbox, etc.) is swallowed and falls through to the next
 * priority tier, and this module never touches `window` at all when it is
 * undefined (e.g. under the Vitest `node` test environment), so it is safe
 * to call from unit tests without a DOM.
 */
export function resolveSeed(explicitSeed?: number): number {
  if (explicitSeed !== undefined && Number.isFinite(explicitSeed)) {
    return explicitSeed >>> 0;
  }
  const fromUrl = readSeedFromUrl();
  if (fromUrl !== undefined) return fromUrl;
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function readSeedFromUrl(): number | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    const raw = new URLSearchParams(window.location.search).get('seed');
    if (raw === null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n >>> 0 : undefined;
  } catch {
    return undefined;
  }
}

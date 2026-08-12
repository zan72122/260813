/**
 * STUB — owner C (mobile-qa) owns src/accessibility/**.
 * Reduce Motion detection + (later) settings persistence live here.
 * Kept tiny and functional enough for app bootstrap to consume.
 */

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

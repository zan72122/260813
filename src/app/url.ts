/**
 * URL query param reading shared by app bootstrap. Mirrors the same
 * "?fixedStep=1" detection `src/render/index.ts` does internally (it reads
 * `location.search` itself at RenderSystem construction time, with no way
 * for the integrator to override it) — this module exists so `src/app`
 * makes the identical decision from the identical source, rather than
 * risking the two disagreeing.
 */
export function readFixedStepParam(): boolean {
  if (typeof location === 'undefined') return false;
  try {
    return new URLSearchParams(location.search).get('fixedStep') === '1';
  } catch {
    return false;
  }
}

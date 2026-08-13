/**
 * WebGL2 capability probe. Run once, first, before constructing anything
 * else — ARCHITECTURE_CONTRACT.md's renderer is built on Three.js's WebGL2
 * path (src/render/index.ts), and PRODUCT_SPEC requires a friendly
 * pictographic error fallback (src/ui's `showErrorFallback`) rather than an
 * uncaught exception when it is unavailable.
 *
 * Uses a throwaway `<canvas>` rather than the real scene canvas: a canvas's
 * rendering context is fixed for its lifetime once `getContext()` succeeds,
 * so probing on the real canvas first could constrain (or, depending on
 * browser behavior, conflict with) the options `THREE.WebGLRenderer` itself
 * passes to its own `getContext('webgl2', {...})` call. A separate,
 * never-attached probe canvas sidesteps that entirely.
 */
export function supportsWebGL2(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    return gl != null;
  } catch {
    return false;
  }
}

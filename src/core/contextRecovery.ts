/**
 * WebGL context lost/restored plumbing. ARCHITECTURE_CONTRACT.md § Engine
 * loop: "context lost→`preventDefault`→restored時に全材質・RTを再構築".
 *
 * This module only wires the two DOM events onto a canvas-like
 * EventTarget and guarantees `preventDefault()` is called on loss (which is
 * what allows the browser to fire `webglcontextrestored` at all — omitting
 * it makes context loss permanent). The actual GPU-resource rebuild is the
 * renderer factory's job (src/render/index.ts), since only it knows what
 * resources exist; this module is deliberately resource-agnostic so it can
 * be unit-tested with a plain EventTarget standing in for the canvas.
 */
export interface ContextRecoveryHandlers {
  /** Fired synchronously after preventDefault() on 'webglcontextlost'. */
  onLost?: () => void;
  /** Fired on 'webglcontextrestored'. */
  onRestored?: () => void;
}

/** Minimal shape of the target this wires against — satisfied by HTMLCanvasElement, and by a plain EventTarget in tests. */
export type ContextEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Wires context-lost/restored handlers. Returns an unsubscribe function (part of the renderer's dispose()). */
export function wireContextRecovery(target: ContextEventTarget, handlers: ContextRecoveryHandlers): () => void {
  const onLost = (e: Event): void => {
    e.preventDefault();
    handlers.onLost?.();
  };
  const onRestored = (): void => {
    handlers.onRestored?.();
  };

  target.addEventListener('webglcontextlost', onLost, false);
  target.addEventListener('webglcontextrestored', onRestored, false);

  return () => {
    target.removeEventListener('webglcontextlost', onLost);
    target.removeEventListener('webglcontextrestored', onRestored);
  };
}

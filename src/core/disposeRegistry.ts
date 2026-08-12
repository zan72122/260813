/**
 * Central GPU-resource bookkeeping so every geometry/material/texture the
 * renderer subtree allocates gets `dispose()`d exactly once, including on
 * rebuild-after-context-restore paths. PERFORMANCE_BUDGET "Dispose
 * discipline": replay loops must not grow GPU memory.
 *
 * Deliberately pure/three-agnostic beyond the minimal disposable shape, so
 * it is unit-testable in a node environment (no WebGL) per the renderer
 * owner's `tests/unit/render/**` deliverable.
 */

/** The minimal shape shared by THREE.BufferGeometry / Material / Texture. */
export interface Disposable {
  dispose(): void;
}

/**
 * Tracks disposables and frees them all on `disposeAll()`. Re-registering
 * the same instance is a no-op (a `Set` under the hood), so builders that
 * re-run on context-restore can register freely without double-tracking.
 */
export class DisposeRegistry {
  private readonly items = new Set<Disposable>();

  /** Track `item` for later disposal; returns `item` for inline chaining. */
  track<T extends Disposable>(item: T): T {
    this.items.add(item);
    return item;
  }

  /** Track every item in an iterable in one call. */
  trackAll<T extends Disposable>(items: Iterable<T>): void {
    for (const item of items) this.track(item);
  }

  /** Stop tracking `item` without disposing it (rare: ownership transfer). */
  release(item: Disposable): void {
    this.items.delete(item);
  }

  /** Number of currently-tracked disposables (for leak tests). */
  get size(): number {
    return this.items.size;
  }

  /** Dispose everything tracked and clear the registry. */
  disposeAll(): void {
    for (const item of this.items) {
      item.dispose();
    }
    this.items.clear();
  }
}

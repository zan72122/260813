/**
 * Trailing-edge debounce utility. Pure, DOM-free (only uses
 * setTimeout/clearTimeout, available in every JS runtime including Node) —
 * used by resize.ts to coalesce bursts of `resize`/`orientationchange`
 * events, but kept generic and independently unit-testable.
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Cancels a pending trailing call, if any. */
  cancel(): void;
  /** True while a trailing call is pending. */
  readonly pending: boolean;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let handle: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: A) => {
    if (handle !== null) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, waitMs);
  }) as Debounced<A>;

  Object.defineProperty(debounced, 'pending', {
    get(): boolean {
      return handle !== null;
    },
  });
  debounced.cancel = () => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };

  return debounced;
}

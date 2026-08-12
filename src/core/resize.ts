/**
 * Resize/orientation watcher. Debounces `resize` and `orientationchange`
 * bursts (mobile Safari fires several of each in quick succession during a
 * rotation) into a single `onResize` call, per ARCHITECTURE_CONTRACT.md §
 * Engine loop ("resize/orientation handling with debounce").
 */
import { debounce } from './debounce';

export interface ResizeWatcherOptions {
  onResize: () => void;
  /** Debounce delay, ms. Default 150. */
  debounceMs?: number;
  /** Event target, injectable for tests. Default globalThis.window. */
  target?: {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  };
}

export interface ResizeWatcher {
  dispose(): void;
}

/** Wires debounced resize/orientationchange listeners. Call dispose() to tear down (part of the renderer's full dispose()). */
export function createResizeWatcher(opts: ResizeWatcherOptions): ResizeWatcher {
  const target = opts.target ?? window;
  const debounced = debounce(opts.onResize, opts.debounceMs ?? 150);

  target.addEventListener('resize', debounced);
  target.addEventListener('orientationchange', debounced);

  return {
    dispose(): void {
      debounced.cancel();
      target.removeEventListener('resize', debounced);
      target.removeEventListener('orientationchange', debounced);
    },
  };
}

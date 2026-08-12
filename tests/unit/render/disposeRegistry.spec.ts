import { describe, expect, it } from 'vitest';

import { DisposeRegistry, type Disposable } from '../../../src/core/disposeRegistry.ts';

function fakeDisposable(): Disposable & { disposed: boolean } {
  const obj = {
    disposed: false,
    dispose(): void {
      obj.disposed = true;
    },
  };
  return obj;
}

describe('DisposeRegistry (PERFORMANCE_BUDGET "Dispose discipline")', () => {
  it('tracks items and reports size', () => {
    const registry = new DisposeRegistry();
    expect(registry.size).toBe(0);
    registry.track(fakeDisposable());
    registry.track(fakeDisposable());
    expect(registry.size).toBe(2);
  });

  it('track() returns the same instance for inline chaining', () => {
    const registry = new DisposeRegistry();
    const item = fakeDisposable();
    expect(registry.track(item)).toBe(item);
  });

  it('disposeAll() disposes every tracked item exactly once and clears the registry', () => {
    const registry = new DisposeRegistry();
    const items = Array.from({ length: 5 }, () => fakeDisposable());
    registry.trackAll(items);
    expect(registry.size).toBe(5);
    registry.disposeAll();
    for (const item of items) expect(item.disposed).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('re-registering the same instance does not double-track it', () => {
    const registry = new DisposeRegistry();
    const item = fakeDisposable();
    registry.track(item);
    registry.track(item);
    expect(registry.size).toBe(1);
  });

  it('release() stops tracking without disposing', () => {
    const registry = new DisposeRegistry();
    const item = fakeDisposable();
    registry.track(item);
    registry.release(item);
    expect(registry.size).toBe(0);
    registry.disposeAll();
    expect(item.disposed).toBe(false);
  });

  it('disposeAll() is safe to call repeatedly (rebuild-safe: build -> dispose -> build -> dispose)', () => {
    const registry = new DisposeRegistry();
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const items = Array.from({ length: 8 }, () => fakeDisposable());
      registry.trackAll(items);
      registry.disposeAll();
      for (const item of items) expect(item.disposed).toBe(true);
    }
    expect(registry.size).toBe(0);
  });

  it('a rebuild after context-restore never grows the registry (replay-loop leak guard)', () => {
    const registry = new DisposeRegistry();
    const sizesAfterEachCycle: number[] = [];
    for (let cycle = 0; cycle < 20; cycle += 1) {
      registry.disposeAll();
      registry.trackAll(Array.from({ length: 12 }, () => fakeDisposable()));
      sizesAfterEachCycle.push(registry.size);
    }
    expect(new Set(sizesAfterEachCycle).size).toBe(1); // constant size every cycle, no growth
  });
});

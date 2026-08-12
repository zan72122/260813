/**
 * core/resize.ts and core/contextRecovery.ts, exercised with plain Node
 * globals (fake timers for debounce; the built-in EventTarget/Event for
 * context recovery) — no jsdom, no real canvas.
 */
import { describe, expect, it, vi } from 'vitest';
import { debounce } from '../../src/core/debounce';
import { createResizeWatcher } from '../../src/core/resize';
import { wireContextRecovery } from '../../src/core/contextRecovery';
import { createLiveSignals } from '../../src/render/liveSignals';
import { TypedEventBus } from '../../src/contracts/events';

describe('debounce', () => {
  it('coalesces a burst of calls into exactly one trailing call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d();
    d();
    expect(fn).not.toHaveBeenCalled();
    expect(d.pending).toBe(true);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.pending).toBe(false);
    vi.useRealTimers();
  });

  it('cancel() prevents the pending trailing call', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 50);
    d();
    d.cancel();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('passes through the latest call\'s arguments', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounce(fn, 10);
    d(1);
    d(2);
    d(3);
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });
});

describe('createResizeWatcher', () => {
  it('debounces resize + orientationchange into onResize, via an injected target', () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    const onResize = vi.fn();
    const watcher = createResizeWatcher({ onResize, debounceMs: 20, target });

    listeners.get('resize')?.();
    listeners.get('orientationchange')?.();
    expect(onResize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(onResize).toHaveBeenCalledTimes(1);

    watcher.dispose();
    expect(listeners.has('resize')).toBe(false);
    vi.useRealTimers();
  });
});

describe('wireContextRecovery', () => {
  it('calls preventDefault() and onLost on webglcontextlost (required for the browser to ever fire contextrestored)', () => {
    const target = new EventTarget();
    let lostCalled = false;
    wireContextRecovery(target, { onLost: () => (lostCalled = true) });
    const event = new Event('webglcontextlost', { cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(lostCalled).toBe(true);
  });

  it('calls onRestored on webglcontextrestored', () => {
    const target = new EventTarget();
    let restoredCalled = false;
    wireContextRecovery(target, { onRestored: () => (restoredCalled = true) });
    target.dispatchEvent(new Event('webglcontextrestored'));
    expect(restoredCalled).toBe(true);
  });

  it('the returned unsubscribe function stops further callbacks', () => {
    const target = new EventTarget();
    let count = 0;
    const unwire = wireContextRecovery(target, { onLost: () => count++ });
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    unwire();
    target.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(count).toBe(1);
  });
});

describe('createLiveSignals', () => {
  it('tracks the latest gateOpen/sandFlowRate per leg from bus events, defaulting to 0', () => {
    const bus = new TypedEventBus();
    const signals = createLiveSignals(bus);
    expect(signals.gateOpen).toEqual([0, 0, 0, 0]);
    expect(signals.sandFlowRate).toEqual([0, 0, 0, 0]);

    bus.emit({ type: 'gateOpened', leg: 2, open: 0.75 });
    bus.emit({ type: 'sandFlow', leg: 2, rate: 3.2 });
    expect(signals.gateOpen[2]).toBe(0.75);
    expect(signals.sandFlowRate[2]).toBe(3.2);
    expect(signals.gateOpen[0]).toBe(0); // other legs unaffected

    signals.dispose();
  });

  it('sandDepleted zeroes that leg\'s flow rate', () => {
    const bus = new TypedEventBus();
    const signals = createLiveSignals(bus);
    bus.emit({ type: 'sandFlow', leg: 1, rate: 5 });
    expect(signals.sandFlowRate[1]).toBe(5);
    bus.emit({ type: 'sandDepleted', leg: 1 });
    expect(signals.sandFlowRate[1]).toBe(0);
  });

  it('replayRequested resets all 4 legs of both signals to 0', () => {
    const bus = new TypedEventBus();
    const signals = createLiveSignals(bus);
    bus.emit({ type: 'gateOpened', leg: 0, open: 1 });
    bus.emit({ type: 'sandFlow', leg: 3, rate: 6 });
    bus.emit({ type: 'replayRequested' });
    expect(signals.gateOpen).toEqual([0, 0, 0, 0]);
    expect(signals.sandFlowRate).toEqual([0, 0, 0, 0]);
  });

  it('dispose() stops further updates from reaching the signals', () => {
    const bus = new TypedEventBus();
    const signals = createLiveSignals(bus);
    signals.dispose();
    bus.emit({ type: 'gateOpened', leg: 0, open: 0.9 });
    expect(signals.gateOpen[0]).toBe(0);
  });
});

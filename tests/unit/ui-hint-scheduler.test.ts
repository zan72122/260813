import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HintScheduler } from '../../src/ui/hintScheduler';
import type { HandleInfo } from '../../src/contracts/handles';
import type { HintDemoKind } from '../../src/ui/svg';

const HANDLE: HandleInfo = {
  id: 'sandGate',
  x: 100,
  y: 200,
  radius: 60,
  axis: 'vertical',
  range: 120,
  active: true,
};

describe('HintScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCallbacks(): {
    onPulseStart: ReturnType<typeof vi.fn<(handle: HandleInfo) => void>>;
    onDemoStart: ReturnType<typeof vi.fn<(handle: HandleInfo, kind: HintDemoKind) => void>>;
    onClear: ReturnType<typeof vi.fn<() => void>>;
  } {
    return {
      onPulseStart: vi.fn((_h: HandleInfo) => undefined),
      onDemoStart: vi.fn((_h: HandleInfo, _k: HintDemoKind) => undefined),
      onClear: vi.fn(() => undefined),
    };
  }

  it('fires the pulse hint after 3s idle while a handle is active', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'gateDrag',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(2900);
    expect(cb.onPulseStart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200); // crosses 3000ms
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);
    expect(cb.onPulseStart).toHaveBeenCalledWith(HANDLE);
    expect(scheduler.currentStage()).toBe('pulse');

    scheduler.dispose();
  });

  it('escalates to the demo hint after 5s idle, superseding the pulse', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'pumpStrokes',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(3100);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1900); // total 5000ms
    expect(cb.onDemoStart).toHaveBeenCalledTimes(1);
    expect(cb.onDemoStart).toHaveBeenCalledWith(HANDLE, 'pumpStrokes');
    expect(scheduler.currentStage()).toBe('demo');

    // Demo stage does not re-fire pulse or demo again on further idle.
    vi.advanceTimersByTime(5000);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);
    expect(cb.onDemoStart).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('clears instantly on registerInput (pointerdown) and resets the idle clock', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'gateDrag',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(3100);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);

    scheduler.registerInput();
    expect(cb.onClear).toHaveBeenCalledTimes(1);
    expect(scheduler.currentStage()).toBe('none');

    // Idle clock restarted — no new pulse until another 3s pass.
    vi.advanceTimersByTime(2900);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  it('registerInput on an already-idle-none stage does not call onClear again', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'gateDrag',
      now: () => Date.now(),
      ...cb,
    });

    scheduler.registerInput();
    expect(cb.onClear).not.toHaveBeenCalled();
    scheduler.dispose();
  });

  it('resetForPhase restarts timers for the new phase (no stale hint carries over)', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'wedgeSlide',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(4000);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);

    scheduler.resetForPhase();
    expect(cb.onClear).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2900);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(2);

    scheduler.dispose();
  });

  it('pause() freezes the idle clock; resume() discounts the paused duration', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'hammerTap',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(1000);
    scheduler.pause();
    vi.advanceTimersByTime(10_000); // long pause — must not trigger any hint
    expect(cb.onPulseStart).not.toHaveBeenCalled();

    scheduler.resume();
    // Only 1000ms of the original idle window had elapsed pre-pause, so it
    // takes another ~2000ms post-resume to reach the 3000ms threshold.
    vi.advanceTimersByTime(1900);
    expect(cb.onPulseStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(cb.onPulseStart).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('never fires while there is no active handle', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => undefined,
      demoKindForHandle: () => 'gateDrag',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(20_000);
    expect(cb.onPulseStart).not.toHaveBeenCalled();
    expect(cb.onDemoStart).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it('never fires for a handle that is present but inactive', () => {
    const cb = makeCallbacks();
    const inactive: HandleInfo = { ...HANDLE, active: false };
    const scheduler = new HintScheduler({
      getActiveHandle: () => inactive,
      demoKindForHandle: () => 'gateDrag',
      now: () => Date.now(),
      ...cb,
    });

    vi.advanceTimersByTime(20_000);
    expect(cb.onPulseStart).not.toHaveBeenCalled();

    scheduler.dispose();
  });

  it('dispose() stops the internal poll — no further callbacks fire', () => {
    const cb = makeCallbacks();
    const scheduler = new HintScheduler({
      getActiveHandle: () => HANDLE,
      demoKindForHandle: () => 'gateDrag',
      now: () => Date.now(),
      ...cb,
    });

    scheduler.dispose();
    vi.advanceTimersByTime(20_000);
    expect(cb.onPulseStart).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { DefaultHandleRegistry } from '../../src/contracts/handles';
import type { HandleInfo } from '../../src/contracts/handles';
import type { Intent } from '../../src/contracts/intents';
import type { GameState } from '../../src/contracts/types';
import { attachInput, replayInjector } from '../../src/input';
import type { EventTargetLike, IntentSink } from '../../src/input';
import { applyMagneticEase, clamp01, effectiveRadius, projectAlongAxis, withinGrabRadius } from '../../src/input/geometry';

/**
 * A minimal synchronous EventTarget-like fake — jsdom is not installed in
 * this worktree (a devDependency only vite/vitest list as an *optional*
 * peer, not an actual installed package; see package-lock.json), so real
 * PointerEvent/jsdom construction is unavailable under the frozen
 * `environment: 'node'` vitest config. This fake exercises the exact same
 * production `attachInput` code path (real addEventListener/
 * removeEventListener call sites, real listener functions) with plain
 * pointer-event-shaped objects instead of constructed DOM Event instances —
 * attachInput only ever reads `.pointerId/.clientX/.clientY` and optionally
 * calls `.preventDefault()`, so this is a faithful stand-in.
 */
class FakeTarget implements EventTargetLike {
  private readonly listeners = new Map<string, Set<(ev: Event) => void>>();
  capturedPointerIds: number[] = [];

  addEventListener(type: string, listener: (ev: Event) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (ev: Event) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointerIds.push(pointerId);
  }

  releasePointerCapture(): void {
    // no-op — nothing under test inspects release calls directly.
  }

  dispatch(type: string, ev: FakePointerEvent): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(ev as unknown as Event);
  }
}

interface FakePointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault(): void;
  /** Optional; unused by attachInput.ts's palm-rejection logic (see its `shouldTransferToNewPointer` doc comment for why isPrimary is deliberately not part of that decision) — kept here only so F5 tests below can shape realistic pointer-order scenarios. */
  isPrimary?: boolean;
  /** Optional pointer contact size (CSS px) — omitted by every pre-existing test, exactly like most real pointer types (see attachInput.ts's `isLargeContact`). Only the F5 palm-rejection tests below set these. */
  width?: number;
  height?: number;
}

function makeEvent(
  pointerId: number,
  x: number,
  y: number,
  overrides: Partial<Pick<FakePointerEvent, 'isPrimary' | 'width' | 'height'>> = {},
): FakePointerEvent {
  return { pointerId, clientX: x, clientY: y, preventDefault: () => undefined, ...overrides };
}

function recordingSink(): { sink: IntentSink; log: Intent[] } {
  const log: Intent[] = [];
  return { sink: { applyIntent: (i) => log.push(i) }, log };
}

function handle(overrides: Partial<HandleInfo> & Pick<HandleInfo, 'id'>): HandleInfo {
  return {
    x: 100,
    y: 100,
    radius: 48,
    axis: 'vertical',
    range: 200,
    active: true,
    ...overrides,
  };
}

describe('geometry helpers (pure)', () => {
  it('clamp01 clamps and rejects non-finite input', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('effectiveRadius is never smaller than 96 even for a small declared handle radius', () => {
    expect(effectiveRadius(handle({ id: 'hammer', radius: 48 }))).toBe(96);
    expect(effectiveRadius(handle({ id: 'hammer', radius: 150 }))).toBe(150);
  });

  it('withinGrabRadius uses the generous effective radius, not the raw declared one', () => {
    const h = handle({ id: 'hammer', x: 0, y: 0, radius: 48 });
    expect(withinGrabRadius(h, 90, 0)).toBe(true); // 90 < 96 effective, even though > 48 declared
    expect(withinGrabRadius(h, 97, 0)).toBe(false);
  });

  it('projectAlongAxis isolates vertical/horizontal and is direction-agnostic magnitude for free', () => {
    expect(projectAlongAxis('vertical', 50, -30)).toBe(-30);
    expect(projectAlongAxis('horizontal', 50, -30)).toBe(50);
    expect(projectAlongAxis('free', 3, 4)).toBe(5);
  });

  it('applyMagneticEase is identity below the magnetic zone, monotonic, and snaps to 1 at/above the snap point', () => {
    expect(applyMagneticEase(0.3)).toBe(0.3);
    expect(applyMagneticEase(0.79)).toBeCloseTo(0.79, 5);
    expect(applyMagneticEase(0.95)).toBe(1);
    expect(applyMagneticEase(1)).toBe(1);
    const mid = applyMagneticEase(0.87);
    expect(mid).toBeGreaterThan(0.8);
    expect(mid).toBeLessThan(1);
    // Monotonic across the whole range.
    let prev = -Infinity;
    for (let r = 0; r <= 1; r += 0.05) {
      const v = applyMagneticEase(r);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('attachInput — pump handle hysteresis', () => {
  it('one clean down-then-up cycle beyond threshold fires exactly one jackStroke', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'pumpHandle', x: 100, y: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointermove', makeEvent(1, 100, 145)); // down 45px >= 40 threshold -> halfDone
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(0);
    target.dispatch('pointermove', makeEvent(1, 100, 100)); // back up 45px from new baseline -> fires
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(1);
  });

  it('direction-agnostic start: an upward first stroke also completes a cycle', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'pumpHandle', x: 100, y: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointermove', makeEvent(1, 100, 55)); // up 45px first
    target.dispatch('pointermove', makeEvent(1, 100, 100)); // down 45px completes
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(1);
  });

  it('fast scrubbing yields the correct discrete count with no double-fire', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'pumpHandle', x: 100, y: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    const ys = [145, 100, 145, 100, 145, 100, 145, 100]; // 4 full cycles
    for (const y of ys) target.dispatch('pointermove', makeEvent(1, 100, y));
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(4);
  });

  it('small jitter below threshold never fires, even repeated many times', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'pumpHandle', x: 100, y: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    for (let i = 0; i < 30; i++) {
      target.dispatch('pointermove', makeEvent(1, 100, 100 + (i % 2 === 0 ? 15 : -15))); // well under 40px threshold
    }
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(0);
  });

  it('mid-stroke pointerup earns no credit — a half-completed pump is safely discarded', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'pumpHandle', x: 100, y: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointermove', makeEvent(1, 100, 145));
    target.dispatch('pointerup', makeEvent(1, 100, 145));
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(0);

    // A fresh grab afterwards starts clean at 'neutral', not stuck halfDone.
    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointermove', makeEvent(1, 100, 145));
    target.dispatch('pointermove', makeEvent(1, 100, 100));
    expect(log.filter((i) => i.type === 'jackStroke')).toHaveLength(1);
  });
});

describe('attachInput — sand gate corridor mapping', () => {
  it('maps downward displacement to gateSet(0..1) proportional to handle.range', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 150)); // dy=100, half of range 200
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBeCloseTo(0.5, 5);
  });

  it('horizontal wander of any magnitude never affects the mapped open value', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 150)); // dy=100
    target.dispatch('pointermove', makeEvent(1, 400, 150)); // huge dx wander, same dy
    target.dispatch('pointermove', makeEvent(1, -300, 150)); // huge dx the other way
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    for (const g of gateSets) expect(g.open).toBeCloseTo(0.5, 5);
  });

  it('releasing (pointerup) always sends a final gateSet(0), even after an upward-return reduction', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 190)); // dy=140 -> open=0.7
    target.dispatch('pointermove', makeEvent(1, 50, 90)); // dy=40 -> open=0.2 (natural reduction on upward return)
    target.dispatch('pointerup', makeEvent(1, 50, 90));

    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBe(0);
  });

  it('dragging above the grab origin clamps open at 0, never negative', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, -100)); // dy negative (above origin)
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBe(0);
  });
});

describe('attachInput — wedge drag (magnetic ease) and release', () => {
  it('emits wedgeDrag with the eased progress, and wedgeRelease on pointerup', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'wedge', x: 0, y: 0, axis: 'vertical', range: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 0, 0));
    target.dispatch('pointermove', makeEvent(1, 0, 100)); // raw progress 1.0
    const drags = log.filter((i): i is Extract<Intent, { type: 'wedgeDrag' }> => i.type === 'wedgeDrag');
    expect(drags.at(-1)?.progress).toBe(1);

    target.dispatch('pointerup', makeEvent(1, 0, 100));
    expect(log.at(-1)).toEqual({ type: 'wedgeRelease' });
  });

  it('pointercancel mid-drag still sends wedgeRelease — never leaves the wedge stuck', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'wedge', x: 0, y: 0, axis: 'vertical', range: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 0, 0));
    target.dispatch('pointermove', makeEvent(1, 0, 60));
    target.dispatch('pointercancel', makeEvent(1, 0, 60));
    expect(log.at(-1)).toEqual({ type: 'wedgeRelease' });
  });
});

describe('attachInput — hammer tap vs drag', () => {
  it('a clean tap (pointerdown+pointerup near the same spot) fires hammerTap', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointerup', makeEvent(1, 105, 98)); // tiny wobble, within tolerance
    expect(log).toEqual([{ type: 'hammerTap' }]);
  });

  it('dragging far past the tap tolerance before releasing does not fire hammerTap', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointermove', makeEvent(1, 300, 300));
    target.dispatch('pointerup', makeEvent(1, 300, 300));
    expect(log.filter((i) => i.type === 'hammerTap')).toHaveLength(0);
  });

  it('an inactive hammer handle is never grabbed even when the pointer lands on it', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48, active: false }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointerup', makeEvent(1, 100, 100));
    // Falls through to the anywhere-tap path instead — advance, not hammerTap.
    expect(log).toEqual([{ type: 'advance' }]);
  });
});

describe('attachInput — replay handle and replayInjector', () => {
  it('tapping the replayButton handle fires replay', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'replayButton', x: 200, y: 200, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 200, 200));
    target.dispatch('pointerup', makeEvent(1, 200, 200));
    expect(log).toEqual([{ type: 'replay' }]);
  });

  it('replayInjector(sink)() sends the identical {type:"replay"} intent for a DOM button onclick', () => {
    const { sink, log } = recordingSink();
    const onClick = replayInjector(sink);
    onClick();
    expect(log).toEqual([{ type: 'replay' }]);
  });
});

describe('attachInput — anywhere-tap => advance during cinematics', () => {
  it('a tap with no active handles anywhere resolves to advance', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, active: false }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 900, 900));
    target.dispatch('pointerup', makeEvent(1, 900, 900));
    expect(log).toEqual([{ type: 'advance' }]);
  });

  it('a drag past tolerance with no active handle does not fire advance', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 0, 0));
    target.dispatch('pointermove', makeEvent(1, 500, 500));
    target.dispatch('pointerup', makeEvent(1, 500, 500));
    expect(log).toHaveLength(0);
  });
});

describe('attachInput — multi-touch safety', () => {
  it('a second pointerdown while one gesture is active is ignored entirely, and its moves/ups have no effect', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    handles.set(handle({ id: 'hammer', x: 400, y: 400, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50)); // grabs sandGate
    target.dispatch('pointerdown', makeEvent(2, 400, 400)); // extra touch on hammer — ignored
    target.dispatch('pointermove', makeEvent(2, 400, 400));
    target.dispatch('pointerup', makeEvent(2, 400, 400));
    expect(log.filter((i) => i.type === 'hammerTap')).toHaveLength(0);

    // Pointer 1's gesture is unaffected by the ignored second touch.
    target.dispatch('pointermove', makeEvent(1, 50, 150));
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBeCloseTo(0.5, 5);

    target.dispatch('pointerup', makeEvent(1, 50, 150));

    // Now that pointer 1 released, a fresh pointer 2 grab works normally.
    target.dispatch('pointerdown', makeEvent(2, 400, 400));
    target.dispatch('pointerup', makeEvent(2, 400, 400));
    expect(log.filter((i) => i.type === 'hammerTap')).toHaveLength(1);
  });
});

describe('attachInput — pointercancel/leave recovery', () => {
  it('pointercancel on the sand gate releases the grab cleanly and resets to 0', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 150));
    target.dispatch('pointercancel', makeEvent(1, 50, 150));

    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBe(0);

    // Gesture slot is free again — a new grab immediately works.
    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 100));
    const gateSets2 = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets2.at(-1)?.open).toBeGreaterThan(0);
  });

  it('pointerleave behaves the same as pointercancel as a defensive fallback', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'wedge', x: 0, y: 0, axis: 'vertical', range: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 0, 0));
    target.dispatch('pointermove', makeEvent(1, 0, 50));
    target.dispatch('pointerleave', makeEvent(1, 0, 50));
    expect(log.at(-1)).toEqual({ type: 'wedgeRelease' });
  });

  it('a tap gesture (hammer) cancelled mid-flight fires no completion at all', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointercancel', makeEvent(1, 100, 100));
    expect(log).toHaveLength(0);
  });
});

describe('attachInput — getState() pause gating', () => {
  it('ignores new grabs while paused, without crashing when getState is omitted', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48 }));
    const { sink, log } = recordingSink();
    let paused = true;
    attachInput({ root: target, handles, sink, getState: () => ({ paused } as GameState) });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointerup', makeEvent(1, 100, 100));
    expect(log).toHaveLength(0);

    paused = false;
    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointerup', makeEvent(1, 100, 100));
    expect(log).toEqual([{ type: 'hammerTap' }]);
  });
});

describe('attachInput — dispose', () => {
  it('removes all listeners; dispatched events afterwards have no effect', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48 }));
    const { sink, log } = recordingSink();
    const inputHandle = attachInput({ root: target, handles, sink });

    inputHandle.dispose();
    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    target.dispatch('pointerup', makeEvent(1, 100, 100));
    expect(log).toHaveLength(0);
  });

});

describe('attachInput — F4: window resize/orientationchange mid-gesture', () => {
  it('a resize mid-drag on the sand gate ends the gesture exactly like pointercancel (gateSet(0), never punished)', () => {
    const target = new FakeTarget();
    const viewport = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink, viewport });

    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 150)); // dy=100 -> open=0.5
    viewport.dispatch('resize', makeEvent(1, 0, 0));

    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBe(0);

    // The gesture slot is free again — a fresh grab immediately works, so
    // the player is never left stuck after a rotation.
    target.dispatch('pointerdown', makeEvent(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 100));
    const gateSets2 = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets2.at(-1)?.open).toBeGreaterThan(0);
  });

  it('an orientationchange mid-drag on the wedge releases it (wedgeRelease), never leaving it stuck mid-progress', () => {
    const target = new FakeTarget();
    const viewport = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'wedge', x: 0, y: 0, axis: 'vertical', range: 100 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink, viewport });

    target.dispatch('pointerdown', makeEvent(1, 0, 0));
    target.dispatch('pointermove', makeEvent(1, 0, 60));
    viewport.dispatch('orientationchange', makeEvent(1, 0, 0));

    expect(log.at(-1)).toEqual({ type: 'wedgeRelease' });
  });

  it('a resize with no active gesture is a harmless no-op', () => {
    const target = new FakeTarget();
    const viewport = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink, viewport });

    viewport.dispatch('resize', makeEvent(1, 0, 0));
    expect(log).toHaveLength(0);
  });

  it('a resize mid-tap (hammer) fires no completion, matching pointercancel behavior for taps', () => {
    const target = new FakeTarget();
    const viewport = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'hammer', x: 100, y: 100, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink, viewport });

    target.dispatch('pointerdown', makeEvent(1, 100, 100));
    viewport.dispatch('resize', makeEvent(1, 0, 0));
    target.dispatch('pointerup', makeEvent(1, 100, 100)); // stale pointerId, gesture already cleared -> no-op

    expect(log).toHaveLength(0);
  });
});

describe('attachInput — F5: palm rejection (second-pointer transfer)', () => {
  function palmDown(pointerId: number, x: number, y: number): FakePointerEvent {
    // Large contact (>30px) reads as a resting palm.
    return makeEvent(pointerId, x, y, { width: 45, height: 45 });
  }

  it('a quick second pointerdown transfers the gesture away from a large, stationary first contact', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    // Pointer 1: a resting palm — large contact, lands first, never moves.
    target.dispatch('pointerdown', palmDown(1, 50, 50));
    // Pointer 2: the real fingertip, arriving moments later.
    target.dispatch('pointerdown', makeEvent(2, 50, 50));

    // The old gesture (pointer 1) was released cleanly first.
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBe(0);

    // Pointer 2 now owns the slot — its moves drive the gate.
    target.dispatch('pointermove', makeEvent(2, 50, 150)); // dy=100 -> open=0.5
    const gateSets2 = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets2.at(-1)?.open).toBeCloseTo(0.5, 5);

    // Pointer 1's stale events (already released) have no further effect.
    target.dispatch('pointermove', makeEvent(1, 50, 190));
    const gateSets3 = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets3.at(-1)?.open).toBeCloseTo(0.5, 5);
  });

  it('does NOT transfer when the first contact never reports a large width/height (ordinary finger, or any environment that omits it) — exact pre-existing multi-touch-safety behavior', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    handles.set(handle({ id: 'hammer', x: 400, y: 400, radius: 48 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', makeEvent(1, 50, 50)); // no width/height -> never reads as a palm
    target.dispatch('pointerdown', makeEvent(2, 400, 400, { isPrimary: true }));
    target.dispatch('pointerup', makeEvent(2, 400, 400, { isPrimary: true }));

    expect(log.filter((i) => i.type === 'hammerTap')).toHaveLength(0); // second pointer ignored, as before

    target.dispatch('pointermove', makeEvent(1, 50, 150));
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBeCloseTo(0.5, 5); // pointer 1 still owns the gesture
  });

  it('does NOT transfer once the large first contact has already moved past the stationary tolerance (a real drag, not a resting palm)', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', palmDown(1, 50, 50));
    target.dispatch('pointermove', makeEvent(1, 50, 80)); // moved 30px — well past the few-px stationary tolerance
    target.dispatch('pointerdown', makeEvent(2, 50, 50, { isPrimary: true }));

    // Still pointer 1's gesture — no release-to-0 was ever emitted for a transfer.
    target.dispatch('pointermove', makeEvent(1, 50, 100));
    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.every((g) => g.open > 0)).toBe(true);
  });

  it('transfers even when the second pointer is isPrimary:false — a real touchscreen assigns isPrimary by arrival ORDER, so in the palm-first scenario this exists to fix, the palm (first) is the one left isPrimary:true and the real finger (second) is isPrimary:false; gating on isPrimary would make the whole feature dead code in exactly that case', () => {
    const target = new FakeTarget();
    const handles = new DefaultHandleRegistry();
    handles.set(handle({ id: 'sandGate', x: 50, y: 50, axis: 'vertical', range: 200 }));
    const { sink, log } = recordingSink();
    attachInput({ root: target, handles, sink });

    target.dispatch('pointerdown', palmDown(1, 50, 50)); // the palm: large, stationary, arrived first -> isPrimary:true in a real browser
    target.dispatch('pointerdown', makeEvent(2, 50, 50, { isPrimary: false })); // the real finger: arrived second -> isPrimary:false

    const gateSets = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets.at(-1)?.open).toBe(0); // pointer 1 (palm) was released cleanly

    target.dispatch('pointermove', makeEvent(2, 50, 150)); // dy=100 -> open=0.5, driven by pointer 2 now
    const gateSets2 = log.filter((i): i is Extract<Intent, { type: 'gateSet' }> => i.type === 'gateSet');
    expect(gateSets2.at(-1)?.open).toBeCloseTo(0.5, 5);
  });
});

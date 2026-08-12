import { describe, expect, it } from 'vitest';
import { down, makeHarness, tick } from './harness';

describe('idle / assist timers', () => {
  it('emits assist:breathe at 3s idle (scaled) and assist:point at 5s idle, targeting the phase anchor', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' }); // targetAnchor() -> 'beam'
    tick(h, 800); // 3000ms * 0.25 = 750ms scaled threshold
    expect(h.events.some((e) => e.name === 'assist:breathe')).toBe(true);
    const breathe = h.events.find((e) => e.name === 'assist:breathe');
    expect((breathe?.payload as { anchor: string }).anchor).toBe('beam');
    expect(h.events.some((e) => e.name === 'assist:point')).toBe(false);

    tick(h, 500); // total ~1300ms, past 5000*0.25=1250ms scaled threshold
    expect(h.events.some((e) => e.name === 'assist:point')).toBe(true);
  });

  it('each threshold only fires once per idle streak, not every frame', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' });
    tick(h, 3000);
    const breatheCount = h.events.filter((e) => e.name === 'assist:breathe').length;
    expect(breatheCount).toBe(1);
  });

  it('resets idle tracking on any input, even a wrong/harmless one', () => {
    const h = makeHarness(1, { startPhase: 'hookDown' });
    tick(h, 600);
    down(h, 0, 0); // any input resets idleMs
    expect(h.store.get().idleMs).toBe(0);
    tick(h, 600);
    // Still under the 750ms scaled threshold since the clock reset.
    expect(h.events.some((e) => e.name === 'assist:breathe')).toBe(false);
  });

  it('passive phases (e.g. reveal) never emit assist cues', () => {
    const h = makeHarness(1, { startPhase: 'reveal' });
    tick(h, 3000);
    expect(h.events.some((e) => e.name === 'assist:breathe' || e.name === 'assist:point')).toBe(false);
  });
});

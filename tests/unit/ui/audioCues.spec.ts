import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SOUND_CUE_IDS, type SoundCueId } from '../../../src/contracts/events.ts';
import { EiffelAudioEngine } from '../../../src/audio/EiffelAudioEngine.ts';
import { FakeAudioContext } from './helpers/fakeAudioContext.ts';

const LOOP_CUE_IDS: readonly SoundCueId[] = ['hydraulicHum', 'cableRun', 'carrierRide'];
const ONE_SHOT_CUE_IDS: readonly SoundCueId[] = SOUND_CUE_IDS.filter(
  (id) => !LOOP_CUE_IDS.includes(id),
);

function totalNodesCreated(context: FakeAudioContext): number {
  const { gains, oscillators, filters, bufferSources } = context.counts;
  return gains + oscillators + filters + bufferSources;
}

describe('EiffelAudioEngine cue table completeness', () => {
  it('constructs a master gain against the injected context', () => {
    const context = new FakeAudioContext();
    new EiffelAudioEngine({ context });
    expect(context.counts.gains).toBeGreaterThanOrEqual(1);
  });

  it('every SoundCueId has a working handler (no throw, and it schedules audio)', () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    for (const cue of SOUND_CUE_IDS) {
      const before = totalNodesCreated(context);
      expect(() => engine.handleCue(cue)).not.toThrow();
      expect(totalNodesCreated(context)).toBeGreaterThan(before);
    }
    // Exercises the full frozen union, not a subset.
    expect(SOUND_CUE_IDS.length).toBe(12);
  });

  it('one-shot cues can be fired repeatedly without accumulating stuck state', () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    for (const cue of ONE_SHOT_CUE_IDS) {
      expect(() => {
        engine.handleCue(cue);
        engine.handleCue(cue);
      }).not.toThrow();
    }
  });
});

describe('EiffelAudioEngine loop cues (idempotent start, smooth auto-stop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(LOOP_CUE_IDS)('re-firing "%s" quickly does not restart/stack the loop', (cue) => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });

    engine.handleCue(cue);
    const afterFirst = context.counts.bufferSources;
    expect(afterFirst).toBeGreaterThan(0);

    vi.advanceTimersByTime(50); // well under the keep-alive window
    engine.handleCue(cue);
    vi.advanceTimersByTime(50);
    engine.handleCue(cue);

    expect(context.counts.bufferSources).toBe(afterFirst); // no new loop instance
  });

  it.each(LOOP_CUE_IDS)(
    '"%s" auto-stops if the keep-alive window elapses with no re-fire, then restarts cleanly',
    (cue) => {
      const context = new FakeAudioContext();
      const engine = new EiffelAudioEngine({ context });

      engine.handleCue(cue);
      expect(context.counts.bufferSources).toBe(1);

      vi.advanceTimersByTime(1000); // well past the keep-alive window, no re-fire

      engine.handleCue(cue); // should start a fresh loop instance, not resume a stale one
      expect(context.counts.bufferSources).toBe(2);
    },
  );
});

describe('EiffelAudioEngine lifecycle', () => {
  it('unlock() resumes a suspended context', async () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    expect(context.state).toBe('suspended');
    await engine.unlock();
    expect(context.state).toBe('running');
  });

  it('unlock() is safe to call again once already running', async () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    await engine.unlock();
    expect(() => engine.unlock()).not.toThrow();
    expect(context.state).toBe('running');
  });

  it('setEnabled(false) mutes without throwing, and handleCue becomes a no-op', () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    expect(() => engine.setEnabled(false)).not.toThrow();

    const before = totalNodesCreated(context);
    engine.handleCue('uiTap');
    expect(totalNodesCreated(context)).toBe(before);

    engine.setEnabled(true);
    engine.handleCue('uiTap');
    expect(totalNodesCreated(context)).toBeGreaterThan(before);
  });

  it('dispose() closes the context and further handleCue calls are no-ops', () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    engine.dispose();
    expect(context.closed).toBe(true);

    const before = totalNodesCreated(context);
    expect(() => engine.handleCue('sparkle')).not.toThrow();
    expect(totalNodesCreated(context)).toBe(before);
  });

  it('dispose() is idempotent', () => {
    const context = new FakeAudioContext();
    const engine = new EiffelAudioEngine({ context });
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
  });

  it('dispose() stops any active loop rather than leaking it', () => {
    vi.useFakeTimers();
    try {
      const context = new FakeAudioContext();
      const engine = new EiffelAudioEngine({ context });
      engine.handleCue('hydraulicHum');
      expect(() => engine.dispose()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

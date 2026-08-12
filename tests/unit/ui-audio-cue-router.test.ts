import { describe, expect, it } from 'vitest';
import { routeEvent } from '../../src/audio/cueRouter';
import { ASSIST_RADIUS, SAND_MAX_RATE } from '../../src/contracts/constants';
import type { GameEvent } from '../../src/contracts/events';

describe('routeEvent (pure event -> audio cue routing)', () => {
  it('gateOpened -> gateCreak with intensity = open', () => {
    expect(routeEvent({ type: 'gateOpened', leg: 1, open: 0.5 })).toEqual({
      kind: 'gateCreak',
      leg: 1,
      intensity: 0.5,
    });
  });

  it('sandFlow with rate>0 -> sandFlow with intensity normalized by SAND_MAX_RATE', () => {
    const half = SAND_MAX_RATE / 2;
    expect(routeEvent({ type: 'sandFlow', leg: 0, rate: half })).toEqual({
      kind: 'sandFlow',
      leg: 0,
      intensity: 0.5,
    });
  });

  it('sandFlow with rate=0 -> sandStop', () => {
    expect(routeEvent({ type: 'sandFlow', leg: 2, rate: 0 })).toEqual({
      kind: 'sandStop',
      leg: 2,
      intensity: 0,
    });
  });

  it('sandDepleted -> sandStop', () => {
    expect(routeEvent({ type: 'sandDepleted', leg: 3 })).toEqual({
      kind: 'sandStop',
      leg: 3,
      intensity: 0,
    });
  });

  it('jackPumped -> jackPump', () => {
    expect(routeEvent({ type: 'jackPumped', leg: 0, stroke: 1.2 })).toEqual({
      kind: 'jackPump',
      leg: 0,
    });
  });

  it('nearTarget -> nearTargetSwell, intensity rising as error shrinks', () => {
    expect(routeEvent({ type: 'nearTarget', leg: 0, error: ASSIST_RADIUS })).toEqual({
      kind: 'nearTargetSwell',
      leg: 0,
      intensity: 0,
    });
    expect(routeEvent({ type: 'nearTarget', leg: 0, error: 0 })).toEqual({
      kind: 'nearTargetSwell',
      leg: 0,
      intensity: 1,
    });
    const mid = routeEvent({ type: 'nearTarget', leg: 0, error: ASSIST_RADIUS / 2 });
    expect(mid?.intensity).toBeCloseTo(0.5, 5);
  });

  it('nearTarget error beyond ASSIST_RADIUS clamps intensity to 0 (never negative)', () => {
    expect(routeEvent({ type: 'nearTarget', leg: 0, error: ASSIST_RADIUS * 3 })?.intensity).toBe(0);
  });

  it('snapped -> snap (weighty KA-KON, not the sandFlow/jackPump loop cues)', () => {
    expect(routeEvent({ type: 'snapped', leg: 1 })).toEqual({ kind: 'snap', leg: 1 });
  });

  it('wedgeSeated -> wedgeSlide', () => {
    expect(routeEvent({ type: 'wedgeSeated', leg: 1 })).toEqual({ kind: 'wedgeSlide', leg: 1 });
  });

  it('hammered -> hammerImpact', () => {
    expect(routeEvent({ type: 'hammered', leg: 1 })).toEqual({ kind: 'hammerImpact', leg: 1 });
  });

  it('revealBeat -> revealBeat, carrying the same index through unchanged', () => {
    for (const index of [0, 1, 2, 3] as const) {
      expect(routeEvent({ type: 'revealBeat', index })).toEqual({ kind: 'revealBeat', index });
    }
  });

  it('settled -> settleChord', () => {
    expect(routeEvent({ type: 'settled' })).toEqual({ kind: 'settleChord' });
  });

  it('soundToggled maps on/off to unmute/mute', () => {
    expect(routeEvent({ type: 'soundToggled', on: true })).toEqual({ kind: 'unmute' });
    expect(routeEvent({ type: 'soundToggled', on: false })).toEqual({ kind: 'mute' });
  });

  it('pauseChanged maps paused/resumed to suspendAmbient/resumeAmbient', () => {
    expect(routeEvent({ type: 'pauseChanged', paused: true })).toEqual({ kind: 'suspendAmbient' });
    expect(routeEvent({ type: 'pauseChanged', paused: false })).toEqual({ kind: 'resumeAmbient' });
  });

  it('camera/UI-only events with no audio consequence route to null', () => {
    const noAudioEvents: GameEvent[] = [
      { type: 'phaseChanged', phase: 'establish' },
      { type: 'legPhaseChanged', leg: 0, legPhase: 'sand' },
      { type: 'magnifierShown', leg: 0, shown: true },
      { type: 'legLocked', leg: 0 },
      { type: 'allLegsLocked' },
      { type: 'replayRequested' },
      { type: 'cameraCue', cue: { kind: 'establish' } },
    ];
    for (const e of noAudioEvents) {
      expect(routeEvent(e)).toBeNull();
    }
  });

  it('is pure: identical input always yields a deep-equal (freshly-allocated) output', () => {
    const event: GameEvent = { type: 'gateOpened', leg: 0, open: 0.7 };
    const a = routeEvent(event);
    const b = routeEvent(event);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

/**
 * Pure event → audio-cue routing. `routeEvent` is the single source of
 * truth mapping a `GameEvent` (contracts/events.ts) onto a `CueDescriptor`
 * the synthesis engine (engine.ts) knows how to realize. Kept 100% pure
 * (no AudioContext, no I/O, no module-level mutable state) specifically so
 * it is unit-testable without ever constructing real WebAudio nodes — see
 * tests/unit/ui-audio-cue-router.test.ts.
 */

import type { GameEvent } from '../contracts/events';
import type { LegId } from '../contracts/types';
import { ASSIST_RADIUS, SAND_MAX_RATE } from '../contracts/constants';

export type CueKind =
  | 'sandFlow'
  | 'sandStop'
  | 'gateCreak'
  | 'jackPump'
  | 'nearTargetSwell'
  | 'snap'
  | 'wedgeSlide'
  | 'hammerImpact'
  | 'revealBeat'
  | 'settleChord'
  | 'mute'
  | 'unmute'
  | 'suspendAmbient'
  | 'resumeAmbient'
  | 'stopAllContinuous';

export interface CueDescriptor {
  kind: CueKind;
  leg?: LegId;
  /** 0..1 normalized intensity/brightness, meaning depends on `kind`. */
  intensity?: number;
  /** Beat index for `revealBeat` (0..3). */
  index?: 0 | 1 | 2 | 3;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Maps one GameEvent to the CueDescriptor the audio engine should realize,
 * or `null` for events with no direct audio consequence (camera/UI-only
 * events). Pure function: identical input always yields an identical
 * (deep-equal) output.
 */
export function routeEvent(event: GameEvent): CueDescriptor | null {
  switch (event.type) {
    case 'gateOpened':
      return { kind: 'gateCreak', leg: event.leg, intensity: clamp01(event.open) };

    case 'sandFlow':
      return event.rate > 0
        ? { kind: 'sandFlow', leg: event.leg, intensity: clamp01(event.rate / SAND_MAX_RATE) }
        : { kind: 'sandStop', leg: event.leg, intensity: 0 };

    case 'sandDepleted':
      return { kind: 'sandStop', leg: event.leg, intensity: 0 };

    case 'jackPumped':
      return { kind: 'jackPump', leg: event.leg };

    case 'nearTarget':
      return {
        kind: 'nearTargetSwell',
        leg: event.leg,
        intensity: clamp01(1 - event.error / ASSIST_RADIUS),
      };

    case 'snapped':
      return { kind: 'snap', leg: event.leg };

    case 'wedgeSeated':
      return { kind: 'wedgeSlide', leg: event.leg };

    case 'hammered':
      return { kind: 'hammerImpact', leg: event.leg };

    case 'revealBeat':
      return { kind: 'revealBeat', index: event.index };

    case 'settled':
      return { kind: 'settleChord' };

    case 'soundToggled':
      return { kind: event.on ? 'unmute' : 'mute' };

    case 'pauseChanged':
      return { kind: event.paused ? 'suspendAmbient' : 'resumeAmbient' };

    // F3 (review round 1): a replay must silence any continuous voice left
    // running from the run it just reset (a leg's sand loop, a leg's
    // near-target resonance swell) — otherwise a replay mid-sand-phase (or
    // mid-alignment) leaves that loop audibly playing forever, decoupled
    // from any GameState it can still be attributed to. `replayRequested`
    // is the direct signal; `phaseChanged` to `establish` is the
    // belt-and-braces net for the one other way a run can land back at a
    // fresh `establish` (nothing else does today, but this is cheap
    // insurance against a future path doing so without going through
    // `replayRequested`). Every other `phaseChanged` value has no direct
    // audio consequence of its own, same as before.
    case 'replayRequested':
      return { kind: 'stopAllContinuous' };

    case 'phaseChanged':
      return event.phase === 'establish' ? { kind: 'stopAllContinuous' } : null;

    // No direct audio consequence — camera/phase/UI bookkeeping only.
    case 'legPhaseChanged':
    case 'magnifierShown':
    case 'legLocked':
    case 'allLegsLocked':
    case 'cameraCue':
      return null;
  }
}

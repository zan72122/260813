/**
 * Audio contract. Per ARCHITECTURE_CONTRACT.md § audio.ts, AudioCue behavior
 * is "イベント購読で完結" — the audio owner subscribes directly to
 * EventBus (events.ts) and needs no bespoke dispatch surface of its own.
 * This file documents the subscription contract those cue handlers must
 * honor so the audio owner (Wave 3) has a single authoritative reference,
 * without introducing a second parallel event system.
 */

import type { GameEventOf } from './events';

/**
 * `sandFlow` carries a continuous rate (0 = silent/stopped); the audio
 * owner is expected to drive a loop's gain/pitch from `rate`, not treat it
 * as a one-shot trigger.
 */
export type SandFlowCue = GameEventOf<'sandFlow'>;

/** `snapped` → low metallic resonance + a single "カコン" transient. */
export type SnappedCue = GameEventOf<'snapped'>;

/**
 * `revealBeat` fires 4 times (index 0..3); the audio owner must converge
 * the pitch of each successive beat toward a single resolved tone by the
 * 4th (PRODUCT_SPEC「四方向の金属音が一つへ収束」).
 */
export type RevealBeatCue = GameEventOf<'revealBeat'>;

/**
 * The full set of GameEvent types the audio owner is expected to subscribe
 * to for a complete cue set. Not exhaustive/enforced at compile time (audio
 * owner may subscribe to more or fewer) — documentation only.
 */
export const AUDIO_RELEVANT_EVENT_TYPES = [
  'gateOpened',
  'sandFlow',
  'sandDepleted',
  'jackPumped',
  'nearTarget',
  'snapped',
  'wedgeSeated',
  'hammered',
  'legLocked',
  'allLegsLocked',
  'revealBeat',
  'settled',
  'soundToggled',
  'pauseChanged',
] as const;

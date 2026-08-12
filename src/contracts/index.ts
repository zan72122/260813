// src/contracts/index.ts
// Barrel export for all shared contracts. See docs/CONTRACTS.md.
// This directory is owned exclusively by the Integrator (docs/OWNERSHIP.md).
// Workers: read-only. To request a change, do not edit — describe the change
// under "Open issues" in your handoff instead.

export type { GamePhase, FountainId } from './phase';
export { ALL_GAME_PHASES, ALL_FOUNTAIN_IDS } from './phase';

export type { ActionIntent } from './intents';

export type { GameEvent } from './events';

export type { EventBus } from './bus';
export { createEventBus } from './bus';

export type { SceneContext, SceneModule } from './scene';

export type { CameraPose, CinematicBeat } from './cinematic';

export type { QualityTier, ViewportProfile } from './quality';

export type { AudioCue, AudioDirector } from './audio';

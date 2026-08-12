// src/contracts/cinematic.ts
// Do not edit outside src/contracts/** (see docs/OWNERSHIP.md).

import type { GamePhase } from './phase';

export interface CameraPose {
  position: [number, number, number];
  lookAt: [number, number, number];
  fov?: number;
}

export interface CinematicBeat {
  id: string;
  phase: GamePhase;
  portrait: CameraPose[]; // keyframe sequence for portrait orientation
  landscape: CameraPose[]; // keyframe sequence for landscape orientation
  durationSec: number | 'hold';
  easing: 'linear' | 'ease-in-out' | 'ease-out';
}

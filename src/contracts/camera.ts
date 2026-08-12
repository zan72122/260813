/**
 * Camera cue contract — game/gameplay layer describes intent, render/camera
 * director owns interpreting each cue into an actual camera move. See
 * ARCHITECTURE_CONTRACT.md § camera.ts and the "因果カットの禁止則": during
 * sand/jack phases the director must keep cause (gate/pump) and effect
 * (sand flow/piston/leg motion) in the same frame.
 */

import type { LegId } from './types';

export type CameraCue =
  | { kind: 'establish' }
  | { kind: 'activeLeg'; leg: LegId }
  | { kind: 'sandboxCutaway'; leg: LegId }
  | { kind: 'jackCloseup'; leg: LegId }
  | { kind: 'alignment'; leg: LegId }
  | { kind: 'wedge'; leg: LegId }
  | { kind: 'orbitToNext'; from: LegId; to: LegId }
  | { kind: 'topReveal' }
  | { kind: 'pullback' };

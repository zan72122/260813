/**
 * CONTRACTS — shared type contracts (src/core/**, Integrator-owned).
 * Mirrors docs/CONTRACTS.md. Naming may be adjusted; meaning may not.
 * Do not import this module's types from docs/**; docs are read-only source of truth.
 */
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { EventBus } from './EventBus';
import type { AudioEngine, MaterialLibrary, VfxSystem as VfxSystemService } from './interfaces';

// ---- phases ----
export type GamePhase =
  | 'boot'
  | 'title'
  | 'establish'
  | 'cue'
  | 'descend'
  | 'unlock'
  | 'pull1'
  | 'reveal1'
  | 'cue2'
  | 'pull2'
  | 'reveal2'
  | 'finale'
  | 'choice'
  | 'freePlay';

// ---- progress ----
/** 0..1. Single source of truth for the transform. All rig state derives from this via pure functions. */
export type StageTransformProgress = number; // clamp [0,1]

export type SceneId = 'salon' | 'forest' | 'rustic';

export interface TransformPair {
  from: SceneId;
  to: SceneId;
}

// ---- input ----
export type ActionIntent =
  | { kind: 'tap'; x: number; y: number } // normalized 0..1
  | { kind: 'ropeGrab'; y: number }
  | { kind: 'ropeDrag'; deltaProgress: number } // pre-corrected. down = positive
  | { kind: 'ropeRelease' }
  | { kind: 'lockRelease' }
  | { kind: 'uiToggle'; control: 'mute' | 'quality' | 'exitFree' }
  // Explicit choice-screen selection (Wave 3): UiSystem's picture buttons emit this
  // directly instead of a synthetic 'tap' at the button's on-screen position, so
  // GameDirector no longer needs to infer the choice from normalized-x thirds.
  | { kind: 'choiceSelect'; option: 'replay' | 'other' | 'free' };

// ---- quality / viewport ----
export type QualityTier = 'low' | 'medium' | 'high';

export interface ViewportProfile {
  width: number;
  height: number;
  dpr: number; // capped per QualityTier
  orientation: 'portrait' | 'landscape';
  safeArea: { top: number; bottom: number; left: number; right: number };
}

// ---- audio ----
export type AudioCue =
  | 'knock3'
  | 'lockClick'
  | 'ropeCreak'
  | 'pulleySpin'
  | 'woodClatter'
  | 'flatSlide'
  | 'settleThud'
  | 'releaseSoft'
  | 'birds'
  | 'wind'
  | 'applause'
  | 'footlightsOn'
  | 'ambienceRoom'
  | 'ambienceUnder';

// ---- events (EventBus: on/off/emit, typed) ----
export type GameEvent =
  | { type: 'phaseChanged'; from: GamePhase; to: GamePhase }
  | { type: 'transformProgress'; pair: TransformPair; p: StageTransformProgress; velocity: number }
  | { type: 'transformComplete'; pair: TransformPair } // fired at p=1.0 snap
  | { type: 'transformReset'; pair: TransformPair } // fired at p=0.0 snap
  | { type: 'lockReleased' }
  | { type: 'hintShown'; hint: 'tapFloor' | 'releaseLock' | 'pullRope' | 'choose' }
  | { type: 'beatStarted'; beatId: string }
  | { type: 'beatFinished'; beatId: string }
  | { type: 'qualityChanged'; tier: QualityTier }
  | { type: 'viewportChanged'; profile: ViewportProfile }
  | { type: 'audioCue'; cue: AudioCue; velocity?: number };

// ---- camera ----
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

export interface CinematicBeat {
  id: string;
  durationMs: number;
  from?: CameraPose;
  to: CameraPose;
  easing: 'linear' | 'easeInOut' | 'easeOut';
  /** Reduce Motion duration multiplier. Default 0.5. */
  reducedMotionScale?: number;
}

// ---- state ----
export interface GameStateSnapshot {
  phase: GamePhase;
  pair: TransformPair; // current transform pair
  progress: StageTransformProgress;
  currentScene: SceneId; // last completed scene
  quality: QualityTier;
  viewport: ViewportProfile;
  muted: boolean;
  reducedMotion: boolean;
}

// ---- scenes ----
export interface SceneContext {
  three: { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer };
  bus: EventBus;
  quality: QualityTier;
  viewport: ViewportProfile;
  /** Cross-area services (docs/CONTRACTS_ADDENDUM.md). Consumers depend on these interfaces only. */
  services: { materials: MaterialLibrary; audio: AudioEngine; vfx: VfxSystemService };
}

export interface SceneModule {
  readonly id: SceneId | 'auditorium' | 'understage';
  init(ctx: SceneContext): Promise<void> | void;
  /** Called every frame. Transform-in-progress rig state must be set deterministically from p. */
  update(dt: number, state: Readonly<GameStateSnapshot>): void;
  applyQuality(tier: QualityTier): void;
  dispose(): void; // release all geometry/material/texture/RT/listeners
}

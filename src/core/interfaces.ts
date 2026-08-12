/**
 * CONTRACTS_ADDENDUM — cross-area service interfaces (src/core/**, Integrator-owned).
 * Mirrors docs/CONTRACTS_ADDENDUM.md. Naming may be adjusted; meaning may not.
 * Consumers depend on these interface types only; implementations live in each
 * owner's area (see per-interface doc comment) and are injected via
 * SceneContext.services / app wiring.
 */
import type { Material, Object3D } from 'three';
import type { ActionIntent, AudioCue, QualityTier, SceneId } from './types';

/** Implementation: B -> src/render/MaterialLibrary.ts */
export interface MaterialLibrary {
  /** Painted-flat rig material. element: 'wing0'|'wing1'|'wing2'|'backdrop'|'border'|'foreground' */
  paintedFlat(scene: SceneId, element: string): Material;
  wood(kind: 'beam' | 'drum' | 'floor' | 'furniture' | 'pulley'): Material;
  rope(): Material;
  setRopeScroll(offset: number): void; // UV scroll proportional to rope travel (m)
  metal(): Material;
  goldTrim(): Material;
  auditorium(kind: 'wall' | 'seat' | 'marble' | 'curtain'): Material;
  applyQuality(tier: QualityTier): void;
  dispose(): void;
}

/** Implementation: B -> src/audio/AudioEngine.ts (procedural synthesis only, no external source files) */
export interface AudioEngine {
  unlock(): Promise<void>; // call on first user gesture
  play(cue: AudioCue): void; // one-shot
  setContinuous(cue: AudioCue, velocity: number): void; // continuous cue; velocity 0 = silent
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  dispose(): void;
}

/** Implementation: B -> src/vfx/VfxSystem.ts */
export interface VfxSystem {
  attach(parent: Object3D): void;
  setDust(active: boolean): void; // understage dust
  setGobo(intensity: number): void; // dappled light 0..1
  setFootlights(intensity: number): void;
  setBirds(active: boolean): void;
  update(dt: number): void;
  applyQuality(tier: QualityTier): void;
  dispose(): void;
}

/** Implementation: C -> src/input/InputSystem.ts */
export interface InputSystem {
  attach(el: HTMLElement): void;
  onIntent(cb: (intent: ActionIntent) => void): void;
  /** Switches input interpretation per GamePhase (set by app/game). */
  setMode(mode: 'tap' | 'lock' | 'rope' | 'choice' | 'none'): void;
  dispose(): void;
}

/** Implementation: C -> src/ui/UiSystem.ts (updates via EventBus subscription; uiToggle flows through onIntent) */
export interface UiSystem {
  mount(root: HTMLElement, onIntent: (intent: ActionIntent) => void): void;
  dispose(): void;
}

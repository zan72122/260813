// src/contracts/scene.ts
// Do not edit outside src/contracts/** (see docs/OWNERSHIP.md).

import type * as THREE from 'three';
import type { GamePhase } from './phase';
import type { EventBus } from './bus';
import type { QualityTier, ViewportProfile } from './quality';
import type { AudioDirector } from './audio';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  bus: EventBus;
  quality: QualityTier;
  viewport: ViewportProfile;
  audio: AudioDirector;
}

export interface SceneModule {
  readonly id: string;
  /** Called exactly once, before the first enter(). */
  init(ctx: SceneContext): void;
  enter(phase: GamePhase): void;
  update(dt: number, elapsed: number): void;
  onViewportChange(v: ViewportProfile): void;
  /** Release all owned GPU/CPU resources. Must be safe to call once. */
  dispose(): void;
}

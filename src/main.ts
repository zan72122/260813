// src/main.ts
// App bootstrap + Wave 3 integration point. Owned by Integrator (see
// docs/OWNERSHIP.md). Wires every worker's entry point onto the shared
// SceneContext per docs/CONTRACTS.md "配線規約":
//   Worker A: registerScenes / registerGame / registerCamera (src/scenes,
//     src/game, src/camera) — each self-contained, drives itself via its own
//     internal rAF loop (src/game/internalLoop.ts), never calls
//     renderer.render.
//   Worker B: applyHeroMaterials (src/render) + VFX factories (src/vfx),
//     connected here to SceneAnchors (src/scenes/anchors.ts) and the shared
//     bus's GameEvents (src/app/presentationWiring.ts) + createAudioDirector
//     (src/audio), replacing the Wave 1 silent stub.
//   Worker C: registerInput / registerUI / registerAccessibility (src/input,
//     src/ui, src/accessibility).
// This file owns the ONE renderer.render(scene, camera) call per frame; every
// worker's own internal loop only advances its own state.

import * as THREE from 'three';
import { createEventBus, type SceneContext } from './contracts';
import { createRenderer, resizeRenderer } from './app/renderer';
import { computeViewportProfile, watchViewport } from './app/viewport';
import { createPhaseMachine } from './app/phaseMachine';
import { createGameLoop } from './app/loop';
import { detectQualityTier } from './app/quality';
import { wirePresentation } from './app/presentationWiring';
import { registerScenes } from './scenes';
import { registerGame } from './game';
import { registerCamera } from './camera';
import { applyHeroMaterials } from './render';
import { createAudioDirector } from './audio';
import { registerInput } from './input';
import { registerUI } from './ui';
import { registerAccessibility } from './accessibility';

function bootstrap(): void {
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#scene canvas element not found.');
  }

  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();

  let viewport = computeViewportProfile();
  const camera = new THREE.PerspectiveCamera(45, viewport.width / viewport.height, 0.1, 100);
  // Roughly matches beat-establish's portrait starting pose (src/camera/beats.ts)
  // so the title screen doesn't jump-cut once registerCamera takes over on the
  // first garden-idle frame.
  camera.position.set(5, 8, -4);
  camera.lookAt(0, 0, -2);

  const bus = createEventBus();
  const audio = createAudioDirector();
  const quality = detectQualityTier();

  const ctx: SceneContext = { scene, camera, renderer, bus, quality, viewport, audio };

  const phaseMachine = createPhaseMachine(bus, 'title');

  // Build order matters: scenes first (creates the named meshes hero
  // materials key off of), then hero materials/lighting, then game/camera
  // (game installs window.__versailles, which reads anchors + the camera),
  // then the VFX/audio event wiring, then input/UI/accessibility last so the
  // whole SceneContext is fully live before anything can react to a tap.
  registerScenes(ctx);
  const heroHandle = applyHeroMaterials(scene, quality, renderer);
  // Worker A's own garden-idle sun/ambient (src/scenes/index.ts) are a
  // pre-integration placeholder rig; disable them now that the hero lighting
  // rig (single shadow-casting sun + hemisphere) owns lighting, per
  // MASTER_SPEC "影を落とす光源は1つ".
  const gardenGroup = scene.getObjectByName('garden-scene');
  gardenGroup?.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight || obj instanceof THREE.AmbientLight) {
      obj.visible = false;
    }
  });

  registerGame(ctx);
  registerCamera(ctx);
  const presentation = wirePresentation(ctx, heroHandle);

  registerInput(ctx);
  registerUI(ctx);
  registerAccessibility(ctx);

  // Unlock audio on first user gesture, as required by MASTER_SPEC. Input
  // routing itself (tap/whistle/valve gestures) is entirely src/input's job.
  const unlockOnce = (): void => {
    void audio.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce, { once: true });

  const stopViewportWatch = watchViewport((next) => {
    // GamePhase / openness / all game state must survive resize+orientation
    // change. We only touch the renderer + camera projection here; every
    // worker's own state (director/valve/camera beats/scene) is untouched —
    // src/camera/player.ts itself blends to the new orientation's beat
    // variant over 0.3s rather than snapping.
    viewport = next;
    resizeRenderer(renderer, camera, next.width, next.height, next.dpr);
    ctx.viewport = next;
  });

  const loop = createGameLoop((dt, elapsed) => {
    presentation.update(dt, elapsed);
    renderer.render(scene, camera);
  });
  loop.start();

  window.addEventListener(
    'beforeunload',
    () => {
      loop.stop();
      stopViewportWatch();
      phaseMachine.dispose();
      presentation.dispose();
      heroHandle.dispose();
      renderer.dispose();
    },
    { once: true },
  );
}

bootstrap();

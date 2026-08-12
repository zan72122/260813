// src/main.ts
// App bootstrap: WebGL2 renderer, placeholder scene, resize handling, phase
// machine skeleton, single rAF loop. Owned by Integrator (see docs/OWNERSHIP.md).
// Worker A/B/C plug real scenes/render/input into this via src/contracts/**.

import * as THREE from 'three';
import { createEventBus, type SceneContext } from './contracts';
import { createRenderer, resizeRenderer } from './app/renderer';
import { computeViewportProfile, watchViewport } from './app/viewport';
import { createPlaceholderScene } from './app/placeholderScene';
import { createPhaseMachine } from './app/phaseMachine';
import { createGameLoop } from './app/loop';
import { createSilentAudioDirector } from './app/audioStub';
import { detectQualityTier } from './app/quality';

function bootstrap(): void {
  const canvas = document.getElementById('scene');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#scene canvas element not found.');
  }

  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();

  let viewport = computeViewportProfile();
  const camera = new THREE.PerspectiveCamera(
    50,
    viewport.width / viewport.height,
    0.1,
    100,
  );
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.5, 0);

  const bus = createEventBus();
  const audio = createSilentAudioDirector();
  const quality = detectQualityTier();

  // SceneContext is assembled here for forward compatibility: Worker A's real
  // SceneModule implementations (src/game|scenes|camera) will receive this
  // shape via ctx.init(). Not consumed by anything in Wave 1 itself.
  const sceneContext: SceneContext = {
    scene,
    camera,
    renderer,
    bus,
    quality,
    viewport,
    audio,
  };

  const placeholder = createPlaceholderScene(scene);
  const phaseMachine = createPhaseMachine(bus, 'title');

  // Unlock audio on first user gesture, as required by MASTER_SPEC.
  const unlockOnce = (): void => {
    void audio.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce, { once: true });

  // Prevent double-tap zoom / text selection / scroll on the canvas.
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    bus.emitIntent({ kind: 'tap', x, y });
  });

  const stopViewportWatch = watchViewport((next) => {
    // GamePhase / openness / all game state must survive resize+orientation
    // change. We only touch the renderer + camera projection here; the
    // phaseMachine and placeholder scene are untouched.
    viewport = next;
    resizeRenderer(renderer, camera, next.width, next.height, next.dpr);
    sceneContext.viewport = next;
  });

  const loop = createGameLoop((dt, elapsed) => {
    placeholder.update(dt, elapsed);
    renderer.render(scene, camera);
  });
  loop.start();

  // Expose minimal hooks for debugging / e2e without polluting global scope.
  (window as unknown as { __app?: unknown }).__app = {
    bus,
    phaseMachine,
    loop,
    renderer,
  };

  window.addEventListener('beforeunload', () => {
    loop.stop();
    stopViewportWatch();
    phaseMachine.dispose();
    placeholder.dispose();
    renderer.dispose();
  });
}

bootstrap();

// src/vfx/demo/main.ts
// TEMPORARY self-verification harness (see demo-vfx.html). Mounts a test
// scene exercising: applyHeroMaterials (gold/brass/hedge/stone samples),
// each createWaterJet kind staged 0→1, createPipeFlow, createBasinWater,
// createFinaleRainbow, and createAudioDirector. Integrator may delete this
// file + demo-vfx.html once Worker B's output has been reviewed.

import * as THREE from 'three';
import { applyHeroMaterials } from '../../render';
import { createAudioDirector } from '../../audio';
import { createWaterJet, type WaterJetKind } from '../waterJet';
import { createPipeFlow } from '../pipeFlow';
import { createBasinWater } from '../basinWater';
import { createFinaleRainbow } from '../rainbow';

function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable.');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#bcd4e6');
  gradient.addColorStop(1, '#e8e0d0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function bootstrap(): void {
  const canvas = document.getElementById('demo-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#demo-canvas not found.');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = createSkyTexture();
  scene.fog = new THREE.Fog(0xe8e0d0, 18, 44);

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(-0.4, 3.6, 13.5);
  camera.lookAt(-0.2, 1.2, -1.2);

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // --- ground (stone) ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.MeshStandardMaterial());
  ground.name = 'stone-plaza';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- materials shelf: gold, brass, hedge samples ---
  const sunToken = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 18), new THREE.MeshStandardMaterial());
  sunToken.name = 'statue-sun-token';
  sunToken.position.set(-4.7, 0.62, 1.6);
  sunToken.castShadow = true;
  scene.add(sunToken);

  const valveHead = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 24), new THREE.MeshStandardMaterial());
  valveHead.name = 'valve-head';
  valveHead.position.set(-4.7, 0.42, 0.2);
  valveHead.castShadow = true;
  scene.add(valveHead);

  const wrench = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.2), new THREE.MeshStandardMaterial());
  wrench.name = 'wrench';
  wrench.position.set(-4.1, 0.58, 0.55);
  wrench.rotation.y = 0.5;
  wrench.castShadow = true;
  scene.add(wrench);

  const hedgeBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.05, 1.2), new THREE.MeshStandardMaterial());
  hedgeBlock.name = 'garden-hedge-block';
  hedgeBlock.position.set(-4.7, 0.52, -1.4);
  hedgeBlock.castShadow = true;
  scene.add(hedgeBlock);

  // --- fountain rims (stone) + water jets ---
  const fountainX: Record<WaterJetKind, number> = { fan: -2.6, ring: 0.6, crown: 3.8 };
  const jets = {
    fan: createWaterJet('fan', 'high'),
    ring: createWaterJet('ring', 'high'),
    crown: createWaterJet('crown', 'high'),
  } satisfies Record<WaterJetKind, ReturnType<typeof createWaterJet>>;

  (Object.keys(fountainX) as WaterJetKind[]).forEach((kind) => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 12, 28), new THREE.MeshStandardMaterial());
    rim.name = `fountain-${kind}-rim`;
    rim.rotation.x = Math.PI / 2;
    rim.position.set(fountainX[kind], 0.06, -1.8);
    rim.receiveShadow = true;
    scene.add(rim);

    const jet = jets[kind];
    jet.group.position.set(fountainX[kind], 0.08, -1.8);
    jet.group.scale.setScalar(1.25);
    scene.add(jet.group);
  });

  const basin = createBasinWater(0.85, 32);
  basin.mesh.position.set(fountainX.crown, 0.09, -1.8);
  scene.add(basin.mesh);

  // --- pipe flow (cutaway tube + traveling glow slug) ---
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.6, 0.32, 1.4),
    new THREE.Vector3(-1.0, 0.5, 1.9),
    new THREE.Vector3(0.6, 0.3, 1.4),
    new THREE.Vector3(2.2, 0.5, 1.9),
    new THREE.Vector3(3.8, 0.32, 1.4),
  ]);
  const pipe = createPipeFlow(pipeCurve);
  scene.add(pipe.group);

  // --- finale rainbow (very faint) ---
  const rainbow = createFinaleRainbow(3.0, 100, 0.55);
  rainbow.group.position.set(0.6, 0.4, -2.6);
  scene.add(rainbow.group);

  // --- hero materials + morning lighting rig + PMREM env ---
  const heroHandle = applyHeroMaterials(scene, 'high', renderer);

  // --- audio: exercised for runtime sanity, not screenshot-verifiable ---
  const audio = createAudioDirector();
  audio.play('ambient-morning');
  window.addEventListener(
    'pointerdown',
    () => {
      void audio.unlock();
      audio.play('ui-tap');
      audio.play('whistle');
    },
    { once: true },
  );

  const hud = document.getElementById('hud');

  const clock = new THREE.Clock();
  let wetApplied = false;

  function frame(): void {
    const dt = Math.min(0.05, clock.getDelta());
    const elapsed = clock.elapsedTime;

    const fanT = THREE.MathUtils.clamp((elapsed - 0.4) / 2.2, 0, 1);
    const ringT = THREE.MathUtils.clamp((elapsed - 1.0) / 2.4, 0, 1);
    const crownT = THREE.MathUtils.clamp((elapsed - 1.6) / 2.6, 0, 1);
    jets.fan.setIntensity(fanT);
    jets.ring.setIntensity(ringT);
    jets.crown.setIntensity(crownT);
    jets.fan.update(dt, elapsed);
    jets.ring.update(dt, elapsed);
    jets.crown.update(dt, elapsed);

    audio.setIntensity('fountain-splash-fan', fanT);
    audio.setIntensity('fountain-splash-ring', ringT);
    audio.setIntensity('fountain-splash-crown', crownT);

    if (!wetApplied && fanT > 0.6) {
      heroHandle.setWetness(1);
      wetApplied = true;
    }

    const pipeT = (elapsed % 3.2) / 3.2;
    pipe.setProgress(pipeT);
    pipe.update(dt, elapsed);
    audio.setIntensity('pipe-rush', 0.6);

    const rainbowT = THREE.MathUtils.clamp((elapsed - 3.0) / 2.2, 0, 1);
    rainbow.setIntensity(rainbowT);
    rainbow.update(dt, elapsed);

    basin.update(dt, elapsed);

    if (hud) hud.textContent = `Worker B demo — t=${elapsed.toFixed(1)}s fan=${fanT.toFixed(2)} ring=${ringT.toFixed(2)} crown=${crownT.toFixed(2)}`;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  (window as unknown as { __vfxDemo?: unknown }).__vfxDemo = {
    scene,
    camera,
    renderer,
    jets,
    pipe,
    rainbow,
    basin,
    heroHandle,
    audio,
  };
}

bootstrap();

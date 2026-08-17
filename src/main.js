import * as THREE from '../lib/three.module.js';
import { buildWorld } from './world.js';
import { buildTargets } from './targets.js';
import { buildAnimals } from './animals.js';
import { buildProps } from './props.js';
import { buildLandmarks } from './landmarks.js';
import { NightCycle } from './night.js';
import { Garden } from './garden.js';
import { Sponge } from './sponge.js';
import { FX } from './fx.js';
import { SpiritManager } from './spirits.js';
import { Game } from './game.js';
import { makeRng, isE2E } from './util.js';

const E2E = isE2E();
const rng = makeRng(20260816);

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: !E2E, powerPreference: 'high-performance' });
renderer.setPixelRatio(E2E ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping; // keep kid-colors vivid
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

const world = buildWorld(scene, rng);
const targets = [
  ...buildTargets(scene),
  ...buildAnimals(scene),
  ...buildProps(scene),
  ...buildLandmarks(scene),
];
const night = new NightCycle(scene, world, rng);
const sponge = new Sponge();
scene.add(sponge.group);
const fx = new FX(scene, rng);
const spirits = new SpiritManager(scene, fx, rng, { persist: !E2E });
const garden = new Garden(scene, rng, { persist: !E2E });
garden.setScore(garden.paintCount + spirits.discovered.size, true); // restore saved growth silently

const game = new Game({
  scene, camera, renderer, sponge, world, targets, fx, spirits, garden, night,
});
game.attachInput(renderer.domElement);

function resize() {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  game.setViewport(w / h);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

let last = performance.now();
let running = !E2E;
function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  game.update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
if (E2E) renderer.render(scene, camera); // first paint

// ---------------------------------------------------------------------
// Deterministic hooks for E2E tests (and debugging). With ?e2e=1 the RAF
// loop is paused and tests advance logical time via step().
window.__game = {
  version: 1,
  e2e: E2E,
  get running() { return running; },
  setRunning(v) { running = !!v; last = performance.now(); },
  // Advance simulation by `seconds` in fixed steps, then render once.
  step(seconds = 1 / 60) {
    const h = 1 / 60;
    let t = 0;
    while (t < seconds - 1e-9) {
      const dt = Math.min(h, seconds - t);
      game.update(dt);
      t += dt;
    }
    renderer.render(scene, camera);
  },
  // Simulated one-finger input in world coordinates.
  press(x, z) { game.pointerDown(x, z); },
  move(x, z) { game.pointerMove(x, z); },
  release() { game.pointerUp(); },
  // Debug/test-only: add paint credit to fast-forward garden growth.
  grow(n = 1) { garden.paintCount += n; },
  // Debug/test-only: flip day/night without tapping the medallion.
  toggleNight() { return night.toggle(); },
  state() {
    const avg = sponge.averages();
    const liquid = new THREE.Color();
    sponge.liquidColor(liquid);
    return {
      stage: game.stage,
      dye: { r: avg.r, b: avg.b, y: avg.y },
      concentration: sponge.concentration(),
      mixEvent: sponge.mixEvent,
      liquid: `#${liquid.getHexString()}`,
      sponge: {
        x: sponge.group.position.x,
        y: sponge.group.position.y,
        z: sponge.group.position.z,
      },
      squeezing: game.squeezing,
      activePool: game.activePool ? game.activePool.def.id : null,
      hoverTarget: game.hoverTarget ? game.hoverTarget.id : null,
      targets: targets.map((t) => ({
        id: t.id,
        colored: t.colored,
        painting: t.painting,
        color: `#${t.color.getHexString()}`,
        glow: t.glowLevel || 0,
      })),
      spirits: {
        count: spirits.spirits.length,
        discovered: Object.fromEntries(spirits.discovered),
      },
      garden: {
        level: garden.level,
        paintCount: garden.paintCount,
        butterflies: garden.butterflies.length,
      },
      night: { factor: night.night, isNight: night.isNight },
      glow: sponge.glow,
    };
  },
};

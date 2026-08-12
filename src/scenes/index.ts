// src/scenes/index.ts
// Worker A (gameplay-camera) entry point. Builds the procedural garden —
// hedges/paths, 3 fountains, king procession, whistle, valve mechanism,
// underground pipes — and reacts to GameEvent from the shared bus to animate
// them (wrench rotation from valve-progress, water blob from water-progress,
// nozzle height from fountain-flow, procession walk from phase-changed).
// The Integrator wires this in as `registerScenes(ctx)` — see
// docs/CONTRACTS.md "配線規約". Never touches src/app/** or main.ts.

import * as THREE from 'three';
import { ALL_FOUNTAIN_IDS, type FountainId, type GamePhase, type SceneContext } from '../contracts';
import { GARDEN_IDLE_APPROACH_SEC } from '../game/timing';
import { startInternalLoop } from '../game/internalLoop';
import { getSceneAnchors } from './anchors';
import { buildFountain, type FountainVisual } from './build/fountains';
import { buildGround } from './build/ground';
import { buildKingProcession } from './build/king';
import { buildPipes } from './build/pipes';
import { buildValve } from './build/valve';
import { buildWhistle } from './build/whistle';
import { VALVE_TOTAL_RADIANS } from '../game/timing';

export interface GardenSceneHandle {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

function smoothstep(t: number): number {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function createSkyTexture(): THREE.CanvasTexture | null {
  // Guarded: our colocated unit tests run under vitest's Node environment,
  // which has no `document`/canvas. registerScenes always runs in a real
  // browser, where this always succeeds.
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('2D canvas unavailable for garden sky gradient.');
  const gradient = ctx2d.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#bcd4e6');
  gradient.addColorStop(1, '#e8e0d0');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createGardenScene(ctx: SceneContext): GardenSceneHandle {
  const anchors = getSceneAnchors();
  const group = new THREE.Group();
  group.name = 'garden-scene';

  const previousBackground = ctx.scene.background;
  const previousFog = ctx.scene.fog;
  const skyTexture = createSkyTexture();
  if (skyTexture) ctx.scene.background = skyTexture;
  ctx.scene.fog = new THREE.Fog(0xe8e0d0, 18, 42);

  const sun = new THREE.DirectionalLight(0xfff2df, 1.15);
  sun.position.set(6, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  group.add(sun);
  const ambient = new THREE.AmbientLight(0xbcd4e6, 0.55);
  group.add(ambient);

  const ground = buildGround();
  group.add(ground.group);

  const fountains = new Map<FountainId, FountainVisual>();
  for (const id of ALL_FOUNTAIN_IDS) {
    const visual = buildFountain(anchors.fountains[id]);
    fountains.set(id, visual);
    group.add(visual.group);
  }

  const king = buildKingProcession();
  king.setPose(anchors.processionStart, new THREE.Vector3(0, 0, 1));
  group.add(king.group);

  const whistle = buildWhistle();
  whistle.group.position.copy(anchors.whistlePosition).setY(0);
  group.add(whistle.group);

  const valve = buildValve();
  valve.group.position.copy(anchors.valve.position);
  group.add(valve.group);

  const pipes = buildPipes();
  group.add(pipes.group);

  ctx.scene.add(group);

  let phase: GamePhase = 'title';
  let legStart = anchors.processionStart.clone();
  let legEnd = anchors.processionStart.clone();
  let legElapsed = GARDEN_IDLE_APPROACH_SEC; // start "arrived" until a leg begins
  let valveGlowEnergy = 0;
  let finaleJoy = false;

  function kingStopFor(id: FountainId): THREE.Vector3 {
    return anchors.fountains[id].kingStop;
  }

  const unsubscribe = ctx.bus.onEvent((event) => {
    switch (event.kind) {
      case 'phase-changed': {
        phase = event.phase;
        if (phase === 'garden-idle' && event.fountain) {
          legStart = king.group.position.clone();
          const stop = kingStopFor(event.fountain);
          // 'restart' loops back to the first fountain from further down the
          // path — snap back to the entrance rather than walking backwards.
          if (event.fountain === 'fountain-fan' && legStart.z > stop.z) {
            legStart = anchors.processionStart.clone();
          }
          legEnd = stop;
          legElapsed = 0;
        }
        if (phase === 'whistle-cue') whistle.trigger();
        finaleJoy = phase === 'finale';
        break;
      }
      case 'valve-progress': {
        valve.setWrenchRotation(event.openness * VALVE_TOTAL_RADIANS);
        break;
      }
      case 'water-progress': {
        pipes.setBlobVisible(true);
        pipes.setWaterProgress(event.fountain, event.t);
        break;
      }
      case 'water-arrived': {
        pipes.setBlobVisible(false);
        break;
      }
      case 'fountain-flow': {
        fountains.get(event.fountain)?.setIntensity(event.intensity);
        break;
      }
      case 'hint': {
        if (event.target === 'whistle') whistle.trigger();
        if (event.target === 'valve') valveGlowEnergy = 1;
        break;
      }
      default:
        break;
    }
  });

  function update(dt: number, elapsed: number): void {
    if (phase === 'garden-idle') {
      legElapsed = Math.min(GARDEN_IDLE_APPROACH_SEC, legElapsed + dt);
      const t = smoothstep(legElapsed / GARDEN_IDLE_APPROACH_SEC);
      const pos = legStart.clone().lerp(legEnd, t);
      const forward = legEnd.clone().sub(legStart);
      king.setPose(pos, forward);
    }
    king.update(dt, elapsed, finaleJoy);
    whistle.update(dt, elapsed);
    valveGlowEnergy = Math.max(0, valveGlowEnergy - dt * 0.5);
    valve.update(dt, elapsed, valveGlowEnergy);
  }

  function dispose(): void {
    unsubscribe();
    ground.dispose();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose?.();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      }
    });
    ctx.scene.remove(group);
    skyTexture?.dispose();
    ctx.scene.background = previousBackground;
    ctx.scene.fog = previousFog;
  }

  return { group, update, dispose };
}

/** Registers the garden scene and starts its own per-frame animation loop. */
export function registerScenes(ctx: SceneContext): void {
  const scene = createGardenScene(ctx);
  const loop = startInternalLoop((dt, elapsed) => scene.update(dt, elapsed));

  if (typeof window !== 'undefined') {
    window.addEventListener(
      'beforeunload',
      () => {
        loop.stop();
        scene.dispose();
      },
      { once: true },
    );
  }
}

export { getSceneAnchors, createSceneAnchors, type SceneAnchors, type FountainAnchor, type ValveAnchor } from './anchors';

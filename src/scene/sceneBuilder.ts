/**
 * Top-level scene assembly: wires every tower/props/environment/visual
 * builder into one THREE.Scene plus a rich handle object render/index.ts
 * drives every frame. This is the seam between "geometry" (this file and
 * everything it imports from scene/) and "orchestration" (render/index.ts,
 * which owns the renderer, camera director, magnifier, and event-driven
 * ephemeral state like gate-open/sand-flow signals).
 */
import * as THREE from 'three';
import { LEG_ORDER, type LegId, type GameState } from '../contracts/types';
import type { QualityState } from '../contracts/quality';
import type { HeroMaterials } from '../render/materials';
import type { LiveSignals } from '../render/liveSignals';
import { GIRDER_RING_Y, GROUND_Y, LEG_LATTICE_LEVELS, legBaseXZ } from './layout';
import { buildGround, buildSky } from './environment/ground';
import { buildGirderRing } from './tower/girderRing';
import { buildPinAndRing, type PinAndRing } from './tower/pinAndRing';
import { buildLegRig, updateLegRig, type LegRig } from './legRig';
import { buildLegGroundRig, pistonScaleForExtension, type LegGroundRig } from './props/legGroundRig';
import { buildWedgeAndHammer, wedgeLocalPositionForProgress, type WedgeAndHammer } from './tower/wedgeAndHammer';
import { buildScaffold } from './props/scaffold';
import { scaffoldHeight } from './props/scaffoldMath';
import { buildWorkerInstances, WORKER_TARGET_HEIGHT, type WorkerPlacement } from './props/worker';
import { buildLegSandVisual, updateLegSandVisual, type LegSandVisual } from '../visual/sand/sandVisual';
import { buildDustPuff, type DustPuff } from '../visual/dust';
import { LEG_OFFSET_WORLD_SCALE } from './mapping';

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function workerPlacements(): WorkerPlacement[] {
  const rng = seededRng(0x7042);
  const placements: WorkerPlacement[] = [];
  for (const leg of LEG_ORDER) {
    const base = legBaseXZ(leg);
    for (let i = 0; i < 2; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 3 + rng() * 3;
      placements.push({
        x: base.x + Math.cos(angle) * dist,
        z: base.z + Math.sin(angle) * dist,
        yawRad: rng() * Math.PI * 2,
        scale: 0.9 + rng() * 0.25,
      });
    }
  }
  return placements;
}

export interface SceneHandles {
  scene: THREE.Scene;
  legRigs: Record<LegId, LegRig>;
  groundRigs: Record<LegId, LegGroundRig>;
  pinAndRings: Record<LegId, PinAndRing>;
  wedgeRigs: Record<LegId, WedgeAndHammer>;
  sandVisuals: Record<LegId, LegSandVisual>;
  girderRing: THREE.InstancedMesh;
  scaffold: THREE.InstancedMesh;
  workers: THREE.InstancedMesh;
  ground: THREE.Mesh;
  sky: THREE.Mesh;
  dustPuff: DustPuff;
  /** Sum of every static (non-InstancedMesh-shared) draw call this scene issues — informational, for renderInfo()/tests. */
  approxDrawCalls: number;
}

/** Builds the entire scene graph. `quality` controls sand grain instance budget at build time (see visual/sand/sandVisual.ts) — a full rebuild (dispose + buildScene again) is expected on a quality-tier downgrade or WebGL context restore. */
export function buildScene(materials: HeroMaterials, quality: QualityState): SceneHandles {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbcd9e8, 60, 210);

  const ground = buildGround(materials.ground);
  scene.add(ground);
  const sky = buildSky(materials.sky);
  scene.add(sky);

  const girderRing = buildGirderRing(materials.girder);
  scene.add(girderRing);

  const legRigs = {} as Record<LegId, LegRig>;
  const groundRigs = {} as Record<LegId, LegGroundRig>;
  const pinAndRings = {} as Record<LegId, PinAndRing>;
  const wedgeRigs = {} as Record<LegId, WedgeAndHammer>;
  const sandVisuals = {} as Record<LegId, LegSandVisual>;

  for (const leg of LEG_ORDER) {
    const legRig = buildLegRig(leg, materials);
    scene.add(legRig.group);
    legRigs[leg] = legRig;

    // The fixed target ring (never moves) — built separately from the leg's own pin/ring pair so the ring can be added to the scene directly instead of the moving legRig group.
    const fixedRingPair = buildPinAndRing(leg, materials.pin, materials.targetRing);
    scene.add(fixedRingPair.ring);
    pinAndRings[leg] = fixedRingPair;

    const groundRig = buildLegGroundRig(leg, materials);
    scene.add(groundRig.group);
    groundRigs[leg] = groundRig;

    const wedgeRig = buildWedgeAndHammer(leg, materials);
    scene.add(wedgeRig.group);
    wedgeRigs[leg] = wedgeRig;

    const sandVisual = buildLegSandVisual(leg, materials, groundRig.sandboxInterior, quality.particleMax);
    groundRig.sandAnchor.add(sandVisual.group);
    sandVisuals[leg] = sandVisual;
  }

  const scaffold = buildScaffold(materials.wood, scaffoldHeight(GIRDER_RING_Y));
  scene.add(scaffold);

  const workers = buildWorkerInstances(materials.worker, workerPlacements());
  scene.add(workers);

  const dustPuff = buildDustPuff(0xcbb98c);
  scene.add(dustPuff.group);

  return {
    scene,
    legRigs,
    groundRigs,
    pinAndRings,
    wedgeRigs,
    sandVisuals,
    girderRing,
    scaffold,
    workers,
    ground,
    sky,
    dustPuff,
    approxDrawCalls: 2 /* ground+sky */ + 1 /* girder */ + LEG_ORDER.length * (2 /* legRig bars+rivets */ + 1 /* pin */ + 1 /* ring */ + 6 /* sandbox parts */ + 3 /* jack parts */ + 2 /* wedge+slot */ + 2 /* hammer */ + 4 /* sand visual */) + 1 /* scaffold */ + 1 /* workers */,
  };
}

/** Per-frame update driven purely by GameState + QualityState (the leg's mechanical state — offset, jack extension, wedge progress, sand level). Gate/stream visuals additionally need `liveSignals` (gateOpen/sandFlow rate are momentary input signals, not part of GameState — see render/liveSignals.ts). */
export function updateScene(handles: SceneHandles, state: GameState, quality: QualityState, signals: LiveSignals): void {
  for (const leg of LEG_ORDER) {
    const legState = state.legs[leg];
    updateLegRig(handles.legRigs[leg], legState.legOffsetY);

    const groundRig = handles.groundRigs[leg];
    groundRig.piston.scale.y = pistonScaleForExtension(legState.jackExtension, LEG_OFFSET_WORLD_SCALE);
    groundRig.gatePivot.rotation.z = -signals.gateOpen[leg] * (Math.PI / 3);

    const wedgeRig = handles.wedgeRigs[leg];
    wedgeRig.wedge.position.copy(wedgeLocalPositionForProgress(wedgeRig, legState.wedgeProgress));

    updateLegSandVisual(handles.sandVisuals[leg], legState.sandLevel, quality.particleMax, signals.sandFlowRate[leg]);
  }
}

export { LEG_LATTICE_LEVELS, GROUND_Y, WORKER_TARGET_HEIGHT };

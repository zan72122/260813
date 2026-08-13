/**
 * The renderer/mechanics owner's `SceneWorld` implementation
 * (`src/contracts/subsystems.ts`). Owns the WebGLRenderer, THREE.Scene,
 * CameraDirector and every mesh rig, and is the single place that turns a
 * `GameSnapshot` into a rendered frame. Builder functions are re-runnable
 * (context-lost/restored rebuilds everything from scratch, GameStore
 * untouched, per ARCHITECTURE_CONTRACT "Rendering contracts").
 */

import * as THREE from 'three';

import { BLEND_START_S, TRACK_LENGTH } from '../contracts/constants.ts';
import type { CameraCueId } from '../contracts/camera.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import type { SceneWorld } from '../contracts/subsystems.ts';
import { trackPoint } from '../game/track.ts';

import { DisposeRegistry } from '../core/disposeRegistry.ts';
import { FrameClock } from '../core/clock.ts';
import { QualityManager, type QualityTierSettings } from '../core/qualityManager.ts';
import { computeViewport } from '../core/resize.ts';

import { createRenderer, type RendererHandle } from '../render/rendererFactory.ts';
import { createMaterialLibrary } from '../render/materials.ts';
import { LightingRig } from '../render/lighting.ts';
import { applyProceduralEnvironment } from '../render/environment.ts';

import { buildBackdrop, type BackdropResult } from './backdrop.ts';
import { buildCable, type CableRig } from './cable.ts';
import { buildCarrierCabin, CABIN_INTERIOR_HEIGHT, type CarrierCabinResult } from './carrierCabin.ts';
import { MACHINE_ROOM_BOUNDS, buildEarthCutaway } from './cutawayEarth.ts';
import { buildInterior, type InteriorRig } from './interior.ts';
import { buildMachineRoom, type MachineRoomResult } from './machineRoom.ts';
import { buildTower, type TowerResult } from './tower.ts';

import { CameraDirector, type CameraContext } from '../visual/cameraDirector.ts';
import { EffectsRig } from '../visual/effects.ts';

/** States where machine-room steam wisps should be emitting (product spec "something already moves"). */
const STEAM_ACTIVE_STATES = new Set<GameSnapshot['state']>(['attract', 'machineRoom', 'cableFollow', 'replayMenu']);

const MACHINE_ROOM_CENTER = new THREE.Vector3(
  (MACHINE_ROOM_BOUNDS.xMin + MACHINE_ROOM_BOUNDS.xMax) / 2,
  (MACHINE_ROOM_BOUNDS.yTop + MACHINE_ROOM_BOUNDS.yBottom) / 2,
  0,
);
const STEAM_EMIT_POINT = new THREE.Vector3(
  (MACHINE_ROOM_BOUNDS.xMin + MACHINE_ROOM_BOUNDS.xMax) / 2,
  MACHINE_ROOM_BOUNDS.yTop - 0.4,
  1.5,
);

export class EiffelSceneWorld implements SceneWorld {
  private canvas: HTMLCanvasElement | null = null;
  private rendererHandle: RendererHandle | null = null;
  private scene: THREE.Scene | null = null;
  private cameraDirector: CameraDirector | null = null;
  private lighting: LightingRig | null = null;
  private effects: EffectsRig | null = null;
  private registry = new DisposeRegistry();
  private qualityManager = new QualityManager({
    onTierChange: (_tier, settings) => {
      this.applyTierSettings(settings);
    },
  });
  private clock = new FrameClock();

  private tower: TowerResult | null = null;
  private machineRoom: MachineRoomResult | null = null;
  private cable: CableRig | null = null;
  private carrierCabin: CarrierCabinResult | null = null;
  private interior: InteriorRig | null = null;
  private backdrop: BackdropResult | null = null;

  private lastWidth = 1;
  private lastHeight = 1;
  private lastDrawCalls = 0;
  private lastTriangles = 0;
  private contextLost = false;
  private previousState: GameSnapshot['state'] | null = null;
  private onFirstFrame: (() => void) | undefined;
  private firstFrameFired = false;

  private readonly cabinWorldPositionScratch = new THREE.Vector3();
  private readonly contextStationBottom = new THREE.Vector3(0, 0, 0);

  /**
   * Convenience beyond the frozen `SceneWorld` interface, mirroring the
   * Wave-2 `StubSceneWorld` shape so the Wave-4 integrator's existing
   * "flip sceneReady after the first rendered frame" wiring keeps working
   * unchanged when it swaps the stub for this class.
   */
  setOnFirstFrame(callback: () => void): void {
    this.onFirstFrame = callback;
  }

  /** @internal dev-only inspection hook, used by dev/scene.html iteration only. */
  debugGetScene(): THREE.Scene | null {
    return this.scene;
  }

  /** @internal dev-only inspection hook, used by dev/scene.html iteration only. */
  debugGetCamera(): THREE.PerspectiveCamera | null {
    return this.cameraDirector?.camera ?? null;
  }

  /** @internal dev-only inspection hook: raycast straight ahead from the camera. */
  debugRaycastForward(): { distance: number; name: string; parentChain: string; point: number[] }[] {
    const camera = this.cameraDirector?.camera;
    if (!camera || !this.scene) return [];
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const raycaster = new THREE.Raycaster(camera.position.clone(), forward, 0.01, 200);
    return raycaster
      .intersectObjects(this.scene.children, true)
      .slice(0, 5)
      .map((hit) => {
        const chain: string[] = [];
        let o: THREE.Object3D | null = hit.object;
        while (o) {
          chain.push(o.name || o.type);
          o = o.parent;
        }
        return {
          distance: hit.distance,
          name: hit.object.name || hit.object.type,
          parentChain: chain.join(' < '),
          point: hit.point.toArray(),
        };
      });
  }

  init(container: HTMLElement): void {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    container.appendChild(canvas);
    this.canvas = canvas;

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.onContextRestored();
    });

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.lastWidth = width;
    this.lastHeight = height;

    this.rendererHandle = createRenderer({ canvas, initialDpr: window.devicePixelRatio || 1 });
    this.cameraDirector = new CameraDirector(width, height);
    this.buildScene();
    this.rendererHandle.setSize(width, height);
  }

  /** Build (or rebuild, after context restore) every GPU resource and mesh rig from scratch. */
  private buildScene(): void {
    this.registry.disposeAll();
    const scene = new THREE.Scene();
    this.scene = scene;

    const materials = createMaterialLibrary(this.registry);

    if (this.rendererHandle) {
      applyProceduralEnvironment(this.rendererHandle.renderer, scene, this.registry);
    }

    const lighting = new LightingRig(scene);
    this.lighting = lighting;

    const backdrop = buildBackdrop(materials, this.registry);
    scene.add(backdrop.group);
    this.backdrop = backdrop;

    const tower = buildTower(materials, this.registry);
    scene.add(tower.group);
    this.tower = tower;

    scene.add(buildEarthCutaway(MACHINE_ROOM_BOUNDS, materials, this.registry));

    const machineRoom = buildMachineRoom(materials, this.registry);
    scene.add(machineRoom.group);
    this.machineRoom = machineRoom;

    const cable = buildCable(materials, this.registry);
    scene.add(cable.mesh);
    this.cable = cable;

    const carrierCabin = buildCarrierCabin(materials, this.registry);
    scene.add(carrierCabin.carrierGroup);
    this.carrierCabin = carrierCabin;

    const interior = buildInterior(materials, this.registry);
    carrierCabin.cabinGroup.add(interior.group);
    interior.group.position.set(0, 0.02, 0);
    this.interior = interior;

    const effects = new EffectsRig(this.registry);
    scene.add(effects.group);
    effects.setSteamEmitter(STEAM_EMIT_POINT);
    this.effects = effects;

    this.clock.reset();
  }

  updateFromSnapshot(snapshot: GameSnapshot, _alpha: number): void {
    if (
      this.contextLost ||
      !this.rendererHandle ||
      !this.scene ||
      !this.cameraDirector ||
      !this.machineRoom ||
      !this.cable ||
      !this.carrierCabin ||
      !this.interior ||
      !this.effects
    ) {
      return;
    }

    const dt = this.clock.tick(performance.now());
    const frameStartMs = performance.now();

    if (!snapshot.paused) {
      this.carrierCabin.update(snapshot);
      this.machineRoom.update(snapshot);

      this.carrierCabin.cabinGroup.updateWorldMatrix(true, false);
      this.carrierCabin.cabinGroup.getWorldPosition(this.cabinWorldPositionScratch);
      this.cabinWorldPositionScratch.y += CABIN_INTERIOR_HEIGHT * 0.35;

      this.cable.update({
        carriagePosition: this.machineRoom.carriage.position,
        pulleyCenter: this.machineRoom.pulleyCenter,
        pulleyRadiusVisual: this.machineRoom.pulleyRadiusVisual,
        exitPoint: this.machineRoom.exitPoint,
        arcLength: snapshot.arcLength,
        cableTravel: snapshot.cableTravel,
      });

      this.interior.update(dt, snapshot);

      this.effects.setSteamEmitter(STEAM_ACTIVE_STATES.has(snapshot.state) ? STEAM_EMIT_POINT : null);
      if (this.previousState === 'transition' && snapshot.state === 'ascendUpper') {
        this.effects.burstSparkle(this.carrierCabin.cabinGroup.getWorldPosition(new THREE.Vector3()));
      }
      this.previousState = snapshot.state;
      this.effects.update(dt);
    }

    const context = this.buildCameraContext(snapshot);
    this.cameraDirector.update(dt, snapshot, context);

    this.rendererHandle.render(this.scene, this.cameraDirector.camera);
    this.lastDrawCalls = this.rendererHandle.getDrawCalls();
    this.lastTriangles = this.rendererHandle.getTriangles();

    const frameMs = performance.now() - frameStartMs;
    this.qualityManager.reportFrame(frameMs);

    if (!this.firstFrameFired) {
      this.firstFrameFired = true;
      this.onFirstFrame?.();
    }
  }

  private buildCameraContext(snapshot: GameSnapshot): CameraContext {
    const machineRoom = this.machineRoom!;
    const carrierCabin = this.carrierCabin!;
    const [firstX, firstY] = trackPoint(BLEND_START_S);
    const secondFloor = this.tower?.platforms.secondFloorPosition ?? trackPoint(TRACK_LENGTH);
    const viewport = computeViewport(this.lastWidth, this.lastHeight);

    return {
      carrierPosition: carrierCabin.carrierGroup.position,
      carrierAngleRad: (snapshot.carrierAngleDeg * Math.PI) / 180,
      cabinWorldPosition: this.cabinWorldPositionScratch,
      pulleyCenter: machineRoom.pulleyCenter,
      leverBase: machineRoom.leverBase,
      machineRoomCenter: MACHINE_ROOM_CENTER,
      firstFloorPosition: new THREE.Vector3(firstX, firstY, 0),
      secondFloorPosition: new THREE.Vector3(secondFloor[0], secondFloor[1], secondFloor[2]),
      stationBottom: this.contextStationBottom,
      orientation: viewport.orientation,
    };
  }

  setCameraCue(cue: CameraCueId): void {
    this.cameraDirector?.requestCue(cue);
  }

  resize(width: number, height: number): void {
    this.lastWidth = width;
    this.lastHeight = height;
    this.rendererHandle?.setSize(width, height);
    this.cameraDirector?.resize(width, height);
  }

  getDrawCalls(): number {
    return this.lastDrawCalls;
  }

  /** Triangles rendered in the most recent frame (budget-check convenience beyond the frozen interface). */
  getTriangles(): number {
    return this.lastTriangles;
  }

  isCameraSettled(): boolean {
    return this.cameraDirector?.isSettled() ?? true;
  }

  /** QA-only bonus, forwards `CameraDirector.cueProgress` — see that getter's doc. */
  getCameraCueProgress(): number {
    return this.cameraDirector?.cueProgress ?? 0;
  }

  private applyTierSettings(settings: QualityTierSettings): void {
    this.rendererHandle?.setDpr(settings.dpr);
    this.rendererHandle?.setShadowsEnabled(settings.shadowsEnabled);
    this.lighting?.setShadowsEnabled(settings.shadowsEnabled);
    this.effects?.setBudget(settings.particleBudget);
    if (this.effects && settings.particleBudget <= 0) this.effects.setEnabled(false);
    else this.effects?.setEnabled(true);

    const detailScale = settings.instanceDetail === 'full' ? 1 : settings.instanceDetail === 'reduced' ? 0.55 : 0.25;
    if (this.tower) {
      this.tower.rivetMesh.count = Math.max(0, Math.round(this.tower.fullRivetCount * detailScale));
    }
    if (this.backdrop) {
      this.backdrop.skylineMesh.count = Math.max(
        1,
        Math.round(this.backdrop.fullSkylineCount * Math.max(detailScale, 0.4)),
      );
    }
  }

  dispose(): void {
    this.registry.disposeAll();
    this.lighting?.dispose();
    this.rendererHandle?.dispose();
    this.canvas?.remove();
    this.canvas = null;
    this.rendererHandle = null;
    this.scene = null;
    this.lighting = null;
    this.effects = null;
    this.tower = null;
    this.machineRoom = null;
    this.cable = null;
    this.carrierCabin = null;
    this.interior = null;
    this.backdrop = null;
  }

  onContextLost(): void {
    this.contextLost = true;
  }

  onContextRestored(): void {
    this.contextLost = false;
    this.buildScene();
    if (this.rendererHandle) {
      this.rendererHandle.setSize(this.lastWidth, this.lastHeight);
    }
  }
}

// WorldApi実装。放飼場environment全体を構築し、update(dt)を配布する。
// openGate/elephantSeek/elephantEnter/elephantIdleAtはS3/S3bが差し込むフック登録制
// (registerHooks)。未登録時は短いフォールバック(openGateのみ実演出あり、他はwarn+即resolve)。
import * as THREE from "three";
import type { FoodKind, Quality, SpotKind, TimeOfDay, Vec3, WorldApi } from "../core/types";
import { getSpot } from "../game/spots";
import { createWindSystem, type WindSystem } from "./effects/leaves";
import { createBackdrop } from "./environment/backdrop";
import { createBanyan } from "./environment/banyan";
import { createCart } from "./environment/cart";
import { disposeObject3D } from "./environment/dispose";
import { createFoodMesh } from "./environment/foods";
import { createGate } from "./environment/gate";
import { createKeeper } from "./environment/keeper";
import { createLighting, type LightingRig } from "./environment/lighting";
import { createPipe } from "./environment/pipe";
import { createSandPit } from "./environment/sandPit";
import { createStoneWall } from "./environment/stoneWall";
import { createTallTree } from "./environment/tallTree";
import { createTerrain } from "./environment/terrain";

export interface WorldHooks {
  openGate?: () => Promise<void>;
  elephantSeek?: (spotId: SpotKind, food: FoodKind) => Promise<void>;
  elephantEnter?: () => Promise<void>;
  elephantIdleAt?: (pos: Vec3 | null) => void;
}

export interface World extends WorldApi {
  readonly scene: THREE.Scene;
  /** S3/S3b(ゾウ実装)がゾウ関連の演出を差し込むためのフック登録。部分上書き可(Object.assign)。 */
  registerHooks(hooks: Partial<WorldHooks>): void;
}

interface RunningAnim {
  t: number;
  duration: number;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

function easeOutCubic(t: number): number {
  const p = 1 - t;
  return 1 - p * p * p;
}

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 997;
}

export function createWorld(opts?: { quality?: Quality; timeOfDay?: TimeOfDay; reducedMotion?: boolean }): World {
  const scene = new THREE.Scene();

  let quality: Quality = opts?.quality ?? "medium";
  const timeOfDay: TimeOfDay = opts?.timeOfDay ?? "morning";
  let reducedMotion = opts?.reducedMotion ?? false;

  const lighting: LightingRig = createLighting(scene, timeOfDay, quality);
  scene.add(lighting.group);

  const backdrop = createBackdrop();
  scene.add(backdrop.group);

  const terrain = createTerrain();
  scene.add(terrain);

  const stoneWall = createStoneWall();
  scene.add(stoneWall.group);

  const banyan = createBanyan();
  scene.add(banyan.group);

  const pipeRig = createPipe();
  scene.add(pipeRig.group);

  const sandPit = createSandPit();
  scene.add(sandPit.group);

  const tallTree = createTallTree();
  scene.add(tallTree.group);

  const gate = createGate();
  scene.add(gate.group);

  const cart = createCart();
  scene.add(cart);

  const keeper = createKeeper();
  scene.add(keeper.group);

  const wind: WindSystem = createWindSystem();
  wind.register(banyan.leafCluster, { amplitude: 0.03, speed: 0.8 });
  for (const cluster of tallTree.leafClusters) wind.register(cluster, { amplitude: 0.035, speed: 0.95 });
  wind.setReducedMotion(reducedMotion);

  const spotAnchors: Record<SpotKind, THREE.Object3D> = {
    "stone-gap": stoneWall.group,
    sand: sandPit.group,
    pipe: pipeRig.group,
    "banyan-root": banyan.group,
    "high-branch": tallTree.feeder
  };

  const placedFoods = new Map<SpotKind, THREE.Object3D>();

  let hooks: WorldHooks = {};
  function registerHooks(next: Partial<WorldHooks>): void {
    hooks = { ...hooks, ...next };
  }

  const runningAnims: RunningAnim[] = [];
  function animateValue(duration: number, onUpdate: (t: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      if (duration <= 0) {
        onUpdate(1);
        resolve();
        return;
      }
      runningAnims.push({ t: 0, duration, onUpdate, resolve });
    });
  }

  let highlight: {
    spotId: SpotKind;
    anchor: THREE.Object3D;
    basePos: THREE.Vector3;
    light: THREE.PointLight;
  } | null = null;

  let elapsed = 0;

  function update(dt: number): void {
    elapsed += dt;
    wind.update(dt);
    keeper.idle(reducedMotion ? 0 : dt);

    for (let i = runningAnims.length - 1; i >= 0; i--) {
      const anim = runningAnims[i];
      if (!anim) continue;
      anim.t = Math.min(1, anim.t + dt / anim.duration);
      anim.onUpdate(easeOutCubic(anim.t));
      if (anim.t >= 1) {
        runningAnims.splice(i, 1);
        anim.resolve();
      }
    }

    if (highlight) {
      const light = highlight.light;
      if (reducedMotion) {
        highlight.anchor.position.copy(highlight.basePos);
        light.intensity = 1.4;
      } else {
        highlight.anchor.position.set(
          highlight.basePos.x + Math.sin(elapsed * 16) * 0.014,
          highlight.basePos.y + Math.sin(elapsed * 22 + 1) * 0.008,
          highlight.basePos.z + Math.cos(elapsed * 18) * 0.012
        );
        light.intensity = 1.3 + Math.sin(elapsed * 6) * 0.35;
      }
    }
  }

  function setQuality(q: Quality): void {
    quality = q;
    lighting.setQuality(q);
  }

  function setTimeOfDay(t: TimeOfDay): void {
    lighting.setTimeOfDay(t);
  }

  function setReducedMotion(on: boolean): void {
    reducedMotion = on;
    wind.setReducedMotion(on);
  }

  function placeFood(spotId: SpotKind, food: FoodKind): void {
    const existing = placedFoods.get(spotId);
    if (existing) {
      disposeObject3D(existing);
      placedFoods.delete(spotId);
    }
    const spot = getSpot(spotId);
    const group = createFoodMesh(food, hashSeed(spotId + food));
    group.position.set(spot.position.x, spot.position.y, spot.position.z);
    scene.add(group);
    placedFoods.set(spotId, group);
  }

  function clearFoods(): void {
    for (const obj of placedFoods.values()) disposeObject3D(obj);
    placedFoods.clear();
  }

  async function openGate(): Promise<void> {
    if (hooks.openGate) {
      await hooks.openGate();
      return;
    }
    console.warn("[world] openGate: no hook registered (S3 not wired yet), using fallback door-slide animation");
    const startX = gate.gateDoor.position.x;
    const endX = startX + gate.doorOpenX;
    await animateValue(reducedMotion ? 0.15 : 0.9, (t) => {
      gate.gateDoor.position.x = THREE.MathUtils.lerp(startX, endX, t);
    });
  }

  async function elephantSeek(spotId: SpotKind, food: FoodKind): Promise<void> {
    if (hooks.elephantSeek) {
      await hooks.elephantSeek(spotId, food);
      return;
    }
    console.warn(`[world] elephantSeek(${spotId}, ${food}): no hook registered (S3 not wired yet), resolving immediately`);
  }

  async function elephantEnter(): Promise<void> {
    if (hooks.elephantEnter) {
      await hooks.elephantEnter();
      return;
    }
    console.warn("[world] elephantEnter: no hook registered (S3 not wired yet), resolving immediately");
  }

  function elephantIdleAt(pos: Vec3 | null): void {
    if (hooks.elephantIdleAt) {
      hooks.elephantIdleAt(pos);
      return;
    }
    console.warn("[world] elephantIdleAt: no hook registered (S3 not wired yet)");
  }

  function highlightSpot(spotId: SpotKind | null): void {
    if (highlight) {
      highlight.anchor.position.copy(highlight.basePos);
      scene.remove(highlight.light);
      highlight.light.dispose();
      highlight = null;
    }
    if (!spotId) return;
    const spot = getSpot(spotId);
    const anchor = spotAnchors[spotId];
    const light = new THREE.PointLight(0xfff3b0, 1.4, 4.5, 2);
    light.position.set(spot.position.x, spot.position.y + 0.7, spot.position.z);
    scene.add(light);
    highlight = { spotId, anchor, basePos: anchor.position.clone(), light };
  }

  function dispose(): void {
    clearFoods();
    if (highlight) {
      highlight.anchor.position.copy(highlight.basePos);
      scene.remove(highlight.light);
      highlight.light.dispose();
      highlight = null;
    }
    wind.clear();
    sandPit.disposeGeometries();
    disposeObject3D(backdrop.group);
    disposeObject3D(terrain);
    disposeObject3D(stoneWall.group);
    disposeObject3D(banyan.group);
    disposeObject3D(pipeRig.group);
    disposeObject3D(sandPit.group);
    disposeObject3D(tallTree.group);
    disposeObject3D(gate.group);
    disposeObject3D(cart);
    disposeObject3D(keeper.group);
    lighting.dispose();
    scene.background = null;
    scene.fog = null;
  }

  return {
    scene,
    update,
    setQuality,
    setTimeOfDay,
    setReducedMotion,
    placeFood,
    clearFoods,
    openGate,
    elephantSeek,
    elephantEnter,
    elephantIdleAt,
    highlightSpot,
    dispose,
    registerHooks
  };
}

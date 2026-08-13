// CameraApi実装。プリセット遷移(ease)、portrait/landscape別フレーミング、reduced-motion短縮。
import * as THREE from "three";
import { SPOTS } from "../game/spots";
import type { CameraApi } from "../core/types";

export interface CameraPresetVariant {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}
export type VariantSource = CameraPresetVariant | (() => CameraPresetVariant);
export interface CameraPresetDef {
  landscape: VariantSource;
  portrait: VariantSource;
}

export interface CameraRig extends CameraApi {
  readonly camera: THREE.PerspectiveCamera;
  /** 後工程(S3/S3b)がプリセットを追加/上書きするための登録API。未登録名でgoTo()した場合はwarn+即resolve。 */
  registerPreset(name: string, def: CameraPresetDef): void;
  /** "follow"プリセットが追従する対象。Object3Dならworld座標を毎フレーム追跡。 */
  setFollowTarget(target: THREE.Object3D | THREE.Vector3 | null): void;
  setReducedMotion(on: boolean): void;
}

const NORMAL_DURATION = 1.1;
const REDUCED_DURATION = 0.18;

function resolveVariant(src: VariantSource): CameraPresetVariant {
  return typeof src === "function" ? src() : src;
}

function easeOutCubic(t: number): number {
  const p = 1 - t;
  return 1 - p * p * p;
}

function lookShot(
  anchor: THREE.Vector3,
  approach: THREE.Vector3,
  opts: { distance: number; height: number; fovLandscape: number; fovPortrait: number }
): CameraPresetDef {
  const dir = anchor.clone().sub(approach);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const landscape: CameraPresetVariant = {
    position: anchor.clone().addScaledVector(dir, opts.distance).add(new THREE.Vector3(0, opts.height, 0)),
    target: anchor.clone().add(new THREE.Vector3(0, 0.15, 0)),
    fov: opts.fovLandscape
  };
  const portrait: CameraPresetVariant = {
    position: anchor
      .clone()
      .addScaledVector(dir, opts.distance * 0.72)
      .add(new THREE.Vector3(0, opts.height * 1.7, 0)),
    target: anchor.clone().add(new THREE.Vector3(0, 0.05, 0)),
    fov: opts.fovPortrait
  };
  return { landscape, portrait };
}

function v3(p: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}

export function createCameraRig(initial?: { orientation?: "portrait" | "landscape" }): CameraRig {
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 200);

  let orientation: "portrait" | "landscape" = initial?.orientation ?? "landscape";
  let reducedMotion = false;
  let followTarget: THREE.Object3D | THREE.Vector3 | null = null;

  const presets = new Map<string, CameraPresetDef>();

  presets.set("overview", {
    landscape: { position: new THREE.Vector3(0, 15, 21), target: new THREE.Vector3(0, 0.5, -1), fov: 46 },
    portrait: { position: new THREE.Vector3(0, 18, 15), target: new THREE.Vector3(0, 0.8, -1), fov: 62 }
  });
  presets.set("album", {
    landscape: { position: new THREE.Vector3(3, 17, 23), target: new THREE.Vector3(0, 0.6, -1), fov: 44 },
    portrait: { position: new THREE.Vector3(0, 20, 16), target: new THREE.Vector3(0, 1, -1), fov: 60 }
  });
  presets.set("keeper", {
    landscape: { position: new THREE.Vector3(2.4, 1.7, 10.2), target: new THREE.Vector3(0, 1, 7.6), fov: 42 },
    portrait: { position: new THREE.Vector3(1.4, 1.9, 9.4), target: new THREE.Vector3(0, 1.1, 7.7), fov: 56 }
  });
  presets.set("gate", {
    landscape: { position: new THREE.Vector3(0, 2.1, -6.5), target: new THREE.Vector3(0, 1.6, -12.6), fov: 42 },
    portrait: { position: new THREE.Vector3(0, 2.6, -7.8), target: new THREE.Vector3(0, 1.8, -12.6), fov: 58 }
  });

  function followPoint(): THREE.Vector3 {
    if (!followTarget) return new THREE.Vector3(0, 1, 2);
    if (followTarget instanceof THREE.Vector3) return followTarget.clone();
    return followTarget.getWorldPosition(new THREE.Vector3());
  }
  presets.set("follow", {
    landscape: () => {
      const p = followPoint();
      return { position: p.clone().add(new THREE.Vector3(3.4, 2.8, 6.6)), target: p.clone().add(new THREE.Vector3(0, 0.9, 0)), fov: 42 };
    },
    portrait: () => {
      const p = followPoint();
      return { position: p.clone().add(new THREE.Vector3(1.6, 3.6, 4.4)), target: p.clone().add(new THREE.Vector3(0, 1.1, 0)), fov: 58 };
    }
  });

  for (const spot of SPOTS) {
    const anchor = v3(spot.position);
    const approach = v3(spot.approach);
    presets.set(
      `spot:${spot.id}`,
      lookShot(anchor, approach, { distance: 3.2, height: 1.9, fovLandscape: 38, fovPortrait: 56 })
    );
    presets.set(
      `behavior:${spot.elephantBehavior}`,
      lookShot(anchor, approach, { distance: 1.9, height: 1.15, fovLandscape: 40, fovPortrait: 58 })
    );
  }

  const currentTarget = new THREE.Vector3(0, 0.5, -1);
  {
    const v = resolveVariant(presets.get("overview")!.landscape);
    camera.position.copy(v.position);
    currentTarget.copy(v.target);
    camera.fov = v.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(currentTarget);
  }

  let activeDef: CameraPresetDef | null = presets.get("overview")!;
  let transition: {
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromFov: number;
    duration: number;
    t: number;
    resolve: () => void;
  } | null = null;

  function currentVariant(): CameraPresetVariant {
    if (!activeDef) return { position: camera.position.clone(), target: currentTarget.clone(), fov: camera.fov };
    const src = orientation === "portrait" ? activeDef.portrait : activeDef.landscape;
    return resolveVariant(src);
  }

  function goTo(preset: string, opts?: { instant?: boolean }): Promise<void> {
    const def = presets.get(preset);
    if (!def) {
      console.warn(`[cameras] unknown preset "${preset}", ignoring`);
      return Promise.resolve();
    }
    activeDef = def;
    const variant = orientation === "portrait" ? resolveVariant(def.portrait) : resolveVariant(def.landscape);
    const duration = opts?.instant ? 0 : reducedMotion ? REDUCED_DURATION : NORMAL_DURATION;
    if (duration <= 0) {
      camera.position.copy(variant.position);
      currentTarget.copy(variant.target);
      camera.fov = variant.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(currentTarget);
      transition = null;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      transition = {
        fromPos: camera.position.clone(),
        fromTarget: currentTarget.clone(),
        fromFov: camera.fov,
        duration,
        t: 0,
        resolve
      };
    });
  }

  function setOrientation(o: "portrait" | "landscape"): void {
    orientation = o;
  }

  function update(dt: number): void {
    const live = currentVariant();
    if (transition) {
      transition.t = Math.min(1, transition.t + dt / transition.duration);
      const e = easeOutCubic(transition.t);
      camera.position.lerpVectors(transition.fromPos, live.position, e);
      currentTarget.lerpVectors(transition.fromTarget, live.target, e);
      camera.fov = THREE.MathUtils.lerp(transition.fromFov, live.fov, e);
      if (transition.t >= 1) {
        const resolve = transition.resolve;
        transition = null;
        resolve();
      }
    } else if (activeDef) {
      const k = Math.min(1, dt * 3.2);
      camera.position.lerp(live.position, k);
      currentTarget.lerp(live.target, k);
      camera.fov = THREE.MathUtils.lerp(camera.fov, live.fov, k);
    }
    camera.updateProjectionMatrix();
    camera.lookAt(currentTarget);
  }

  function registerPreset(name: string, def: CameraPresetDef): void {
    presets.set(name, def);
  }

  function setFollowTarget(target: THREE.Object3D | THREE.Vector3 | null): void {
    followTarget = target;
  }

  function setReducedMotion(on: boolean): void {
    reducedMotion = on;
  }

  return { camera, goTo, setOrientation, update, registerPreset, setFollowTarget, setReducedMotion };
}

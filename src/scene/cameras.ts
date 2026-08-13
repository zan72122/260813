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

/** 水平(XZ)ベクトルをY軸回りにrad回転する。behaviorShot()が「approach→anchorの正面方向」から
 * 狙った角度だけ回して(横から/斜めから等の)専用アングルを組み立てるのに使う。 */
function rotateY(v: THREE.Vector3, rad: number): THREE.Vector3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}

/** S3b: 5固有行動の専用接写を組み立てる。lookShot()と同じ「approach→anchor」の水平方向を基準に、
 * rotateDeg分だけ回した向きから anchor を distance/height で狙う(=常にanchorから一定距離を保つので、
 * approach(ゾウの立ち位置)付近にカメラがめり込むlookShotとは違う失敗をしない)。 */
function behaviorShot(
  spot: { position: { x: number; y: number; z: number }; approach: { x: number; y: number; z: number } },
  opts: {
    rotateDeg: number;
    distance: number;
    height: number; // anchor.yからの相対高さ(負可: break-branchの見上げ用)
    targetOffset?: THREE.Vector3;
    portraitScale?: number;
    portraitHeightMul?: number;
    fovLandscape: number;
    fovPortrait: number;
  }
): CameraPresetDef {
  const anchor = v3(spot.position);
  const approach = v3(spot.approach);
  const baseDir = new THREE.Vector3(anchor.x - approach.x, 0, anchor.z - approach.z);
  if (baseDir.lengthSq() < 1e-6) baseDir.set(0, 0, 1);
  baseDir.normalize();
  const dir = rotateY(baseDir, THREE.MathUtils.degToRad(opts.rotateDeg));
  const targetOffset = opts.targetOffset ?? new THREE.Vector3(0, 0.15, 0);
  const target = anchor.clone().add(targetOffset);
  const landscape: CameraPresetVariant = {
    position: anchor.clone().addScaledVector(dir, opts.distance).add(new THREE.Vector3(0, opts.height, 0)),
    target,
    fov: opts.fovLandscape
  };
  const portraitDistance = opts.distance * (opts.portraitScale ?? 0.82);
  const portraitHeight = opts.height * (opts.portraitHeightMul ?? 1.3);
  const portrait: CameraPresetVariant = {
    position: anchor.clone().addScaledVector(dir, portraitDistance).add(new THREE.Vector3(0, portraitHeight, 0)),
    target,
    fov: opts.fovPortrait
  };
  return { landscape, portrait };
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
    // 汎用の接写(spot:*より寄っただけ)を仮登録。5行動固有の狙った角度は直後にS3bが上書きする。
    presets.set(
      `behavior:${spot.elephantBehavior}`,
      lookShot(anchor, approach, { distance: 1.9, height: 1.15, fovLandscape: 40, fovPortrait: 58 })
    );
  }

  // --- S3b: 5固有行動それぞれの姿勢が最もよく見える専用接写("behavior:<id>"を上書き登録)。
  // 汎用lookShot()(常に正面/引いた画)ではどの行動も同じ構図に見えてしまうため、各行動ごとに
  // 狙った軸(横から/低い斜め/断面が見える横/手前斜め/見上げ)で個別に組む。behaviorShot()は常にanchor
  // からdistance分だけ離れた位置にカメラを置くので(approach=ゾウの立ち位置の近くにめり込まない)。 ---
  function spotOf(id: (typeof SPOTS)[number]["id"]): (typeof SPOTS)[number] {
    const found = SPOTS.find((s) => s.id === id);
    if (!found) throw new Error(`[cameras] behavior preset override: unknown spot "${id}"`);
    return found;
  }

  // probe-gap(石垣): 隙間の横から。壁はワールドX方向に長い1枚の平面に近いため、
  // approach→anchorの回転ではなく世界X方向への大きなオフセットで「壁の脇から見渡す」角度を作る
  // (回転方式だと壁面とほぼ平行に見てしまい、接写がブロックの質感で埋まってしまうため専用計算)。
  {
    // approach-anchor間が近い(ゾウが鼻を伸ばして届く距離)ため、ゾウの胴体(全長~2.6)がanchor
    // 付近まで張り出しうる。カメラは大きめに離し、狙点もanchor寄り(ゾウの顔にめり込まない)にする。
    const spot = spotOf("stone-gap");
    const anchor = v3(spot.position);
    const approach = v3(spot.approach);
    const target = anchor.clone().lerp(approach, 0.28).add(new THREE.Vector3(0, 0.05, 0));
    const side = new THREE.Vector3(1, 0, 0); // +X: マップ中央寄り(-X側は放飼場の外縁に近い)
    const landscapePos = anchor.clone().addScaledVector(side, 5.8).add(new THREE.Vector3(0, 1.9, 1.6));
    const portraitPos = anchor.clone().addScaledVector(side, 4.6).add(new THREE.Vector3(0, 2.5, 1.3));
    presets.set("behavior:probe-gap", {
      landscape: { position: landscapePos, target, fov: 40 },
      portrait: { position: portraitPos, target, fov: 56 }
    });
  }
  // dig-sand(砂場): やや低い斜め(65°)から、掘れていく砂面が広く見える角度。
  presets.set(
    "behavior:dig-sand",
    behaviorShot(spotOf("sand"), {
      rotateDeg: 65,
      distance: 3.1,
      height: 0.95,
      targetOffset: new THREE.Vector3(0, 0.15, 0),
      fovLandscape: 42,
      fovPortrait: 58
    })
  );
  // reach-pipe(土管): 横から(85°)、開口部越しに内部(xray)が見える角度。
  presets.set(
    "behavior:reach-pipe",
    behaviorShot(spotOf("pipe"), {
      rotateDeg: 85,
      distance: 2.8,
      height: 1.0,
      targetOffset: new THREE.Vector3(0, 0.25, 0),
      fovLandscape: 40,
      fovPortrait: 58
    })
  );
  // peel-banana(ガジュマル根元): 斜め手前から。ゾウが鼻を伸ばして幹に届く演出のため、実際の見た目上の
  // 占有域(頭+伸びた鼻)はbbox実測で対角~5.6ユニットにも達する(体長2.6+鼻の伸び+ears等)。
  // distanceを1.9〜3.8程度に取っていた初期案は軒並みこの占有域に食い込み、頭やゾウの一部が
  // 画面いっぱいに映ってしまっていた(実機スクリーンショットで確認して発覚)。distanceを
  // 5.2まで大きく取ることでゾウ全体+ガジュマル+バナナ茎を画面に収める。
  presets.set(
    "behavior:peel-banana",
    behaviorShot(spotOf("banyan-root"), {
      rotateDeg: 55,
      distance: 7.0,
      height: 2.4,
      targetOffset: new THREE.Vector3(0, 0.2, 0.1),
      fovLandscape: 44,
      fovPortrait: 60
    })
  );
  // break-branch(高木): 見上げ。anchor(spot位置=枝の高さ付近)より低い位置(height負)から見上げる。
  presets.set(
    "behavior:break-branch",
    behaviorShot(spotOf("high-branch"), {
      rotateDeg: 15,
      distance: 3.2,
      height: -2.3,
      targetOffset: new THREE.Vector3(0, -0.3, 0),
      portraitHeightMul: 1.05, // 縦画面でも十分低い位置を保つ(height*1.3だと持ち上がりすぎるため)
      fovLandscape: 44,
      fovPortrait: 60
    })
  );

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

  const rig: CameraRig = { camera, goTo, setOrientation, update, registerPreset, setFollowTarget, setReducedMotion };

  // QA向けの一時的な橋渡し: main.ts(編集禁止)がworld.tsへCameraRigを配線するまでの間、
  // world.tsのelephantSeek(S3b)がbehavior:<id>への実カメラカットを行えるようにwindow経由で公開する
  // (world.ts側のsetCameraRig()で明示接続されればそちらが優先される)。?qa=1時のみ。
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("qa") === "1") {
    (window as unknown as { __cameraRigDebug?: CameraRig }).__cameraRigDebug = rig;
  }

  return rig;
}

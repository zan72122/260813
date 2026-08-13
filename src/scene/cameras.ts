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

  // probe-gap(石垣): S3c修正。壁はワールドX方向に長い1枚の面(法線は±Z、+Z側=approach側が
  // ゾウの立つ側)。ゾウ(approach x=-6.4)は壁の東端(x=-6.2、WALL_WIDTH/gapColStartから算出)の
  // すぐ外側に立ち、隙間(anchor x=-8)へ向けて西南西を向いて鼻を差し込む(向き=approach→anchor≈
  // (-0.89,-0.45))。S3bの旧プリセットはanchorから世界+X(壁の東端の先=ゾウの背後)へ大きく離れた
  // 位置だったため、ゾウの正面(西南西)から見て背後にカメラが回り込み「真後ろ」を映していた
  // (dev-s3b-probe.pngで発覚)。修正: approachを基準に、ゾウの正面やや右(北西)・壁の東端より
  // さらに外側(z=approach.z+1.5、壁のz≈-6から1.5以上離れているため「壁とゾウの間」の
  // 狭い帯(z∈(-6,-5.2))に入らない)にカメラを置き、隙間+鼻+顔を同時に3/4前側面で狙う。
  // 高さは鼻の高さ(1.2-1.6)に合わせて低めに変更(旧1.9-2.5は高すぎ、壁越しの俯瞰になっていた)。
  {
    const spot = spotOf("stone-gap");
    const anchor = v3(spot.position); // (-8,0.9,-6) 隙間(壁はここを中心に世界X方向へ延びる)
    const approach = v3(spot.approach); // (-6.4,0,-5.2) ゾウの立ち位置(壁東端のすぐ外)
    const forward = anchor.clone().sub(approach).setY(0).normalize(); // ゾウが隙間へ向く方向
    const side = new THREE.Vector3(forward.z, 0, -forward.x); // 側方(90°)ベクトル
    // 隙間+顔を両方収めるため、狙点はanchorとapproachの中間よりやや隙間寄り(0.35)。
    const target = anchor.clone().lerp(approach, 0.35).add(new THREE.Vector3(0, 0.35, 0));
    // side方向(側方)を主軸に、forward方向へわずかに引く(=壁から離れる)ことで、壁の面(隙間含む)
    // を斜め横~35°相当の角度で見つつ、「壁とゾウの間」の狭い帯へカメラが入り込むのを避ける。
    const buildPos = (lateral: number, back: number, height: number): THREE.Vector3 =>
      approach.clone().addScaledVector(side, lateral).addScaledVector(forward, -back).add(new THREE.Vector3(0, height, 0));
    presets.set("behavior:probe-gap", {
      landscape: { position: buildPos(6.0, 3.0, 1.7), target, fov: 42 },
      portrait: { position: buildPos(4.8, 2.4, 1.9), target, fov: 58 }
    });
  }
  // dig-sand(砂場): S3c修正。approach(0,0,2.6)→anchor(0,0.05,4)はほぼ世界+Z(北向き)なので、
  // 旧rotateDeg65°+height0.95+distance3.1は「ほぼ真横・低く・近い」構図になり、ゾウの脚しか
  // 映らなかった(dev-s3b-dig.pngで発覚)。斜め前30-40°(要件どおり35°)・高さ~2.0の見下ろし気味に
  // 変更したが、targetOffsetが旧来のまま(y=0.15、ほぼ地面)だったため、カメラは高くなっても
  // 「地面(掘り跡)を見下ろす」軸のままで、その軸の手前にある前脚が画面いっぱいに映り続けていた
  // (実機デバッグでelephant.getPosition().y≈1.18=胴体基準の高さと判明、地面より遥かに高い)。
  // 狙点を胴体寄りの高さ(0.8)へ引き上げ、頭+鼻+前脚+掘り跡が縦方向にバランスよく収まるようにした。
  presets.set(
    "behavior:dig-sand",
    behaviorShot(spotOf("sand"), {
      rotateDeg: 35,
      distance: 3.6,
      height: 2.0,
      targetOffset: new THREE.Vector3(0, 0.8, 0),
      fovLandscape: 42,
      fovPortrait: 58
    })
  );
  // reach-pipe(土管): 横から(85°、土管の軸=approach→anchor≈世界+Xにほぼ垂直)、開口部越しに
  // 内部(xray)が見える角度。S3b時点で「概ね良」評価だったため角度はほぼ維持し、高さのみ要件の
  // 「~1.2」に合わせて微調整(旧1.0 → 1.2、土管口と鼻の高さがより揃うようにする)。
  presets.set(
    "behavior:reach-pipe",
    behaviorShot(spotOf("pipe"), {
      rotateDeg: 85,
      distance: 2.8,
      height: 1.2,
      targetOffset: new THREE.Vector3(0, 0.25, 0),
      fovLandscape: 40,
      fovPortrait: 58
    })
  );
  // peel-banana(ガジュマル根元): S3c修正。banyan.tsのgapPosition(根の窪み)はspot.positionそのもの
  // =幹の中心軸上にあるため、behaviorShot()(anchor=幹中心からdistance/rotateDegだけ離れた位置に
  // カメラを置く)ではどの角度で回っても「幹の中心を見る」構図になりやすく、ゾウ(approachに立ち
  // 窪みへ鼻を伸ばす)の顔とカメラの間に幹の太い胴が割り込んでしまっていた(dev-s3b-banana.pngで
  // 発覚、「ガジュマルの幹がゾウの顔とバナナ茎を隠している」)。窪みは幹の"手前側"(approach側を
  // 向いた面)にあるため、カメラはanchor基準ではなくapproach(ゾウの立ち位置)を基準に、
  // ゾウの正面やや横(側方ベクトル)+わずかに後ろへ引いた位置に置き、幹を横から見る形にして
  // 幹の胴が視線を遮らないようにする。
  {
    const spot = spotOf("banyan-root");
    const anchor = v3(spot.position); // (-6,0.3,3) 幹の中心/根の窪み
    const approach = v3(spot.approach); // (-4.6,0,2.2) ゾウの立ち位置
    const forward = anchor.clone().sub(approach).setY(0).normalize(); // ゾウが窪みへ向く方向
    const side = new THREE.Vector3(forward.z, 0, -forward.x); // 左右(側方)ベクトル
    const buildPos = (lateral: number, back: number, height: number): THREE.Vector3 =>
      approach.clone().addScaledVector(side, lateral).addScaledVector(forward, back).add(new THREE.Vector3(0, height, 0));
    // 狙点は窪み(anchor)からわずかに上、剥がす作業の高さ(地面付近)。カメラは幹(anchor中心、
    // 半径最大0.85の縦の塊)からの水平距離を5単位前後確保しつつ、ゾウ(approach)からは4単位未満に
    // 近づけることで、ゾウの方が幹より画面上で優先して大きく映るようにする(幹が完全に見切れて
    // いても問題ない=要件は「幹がゾウを隠さない」ことであり、幹自体を写す必要はない)。
    const target = anchor.clone().add(new THREE.Vector3(0, 0.5, 0.1));
    presets.set("behavior:peel-banana", {
      landscape: { position: buildPos(4.2, -3.6, 2.0), target, fov: 44 },
      portrait: { position: buildPos(3.4, -2.9, 2.3), target, fov: 60 }
    });
  }
  // break-branch(高木): S3c修正。旧rotateDeg15°はapproach→anchor(=ゾウ→木)の正面軸にほぼ沿った
  // ままで、しかも幹の付け根(anchor)からdistance3.2かつ低い位置(height-2.3→絶対高さ1.3)だった
  // ため、木の真下から幹を見上げる形になり幹がゾウの頭を完全に隠していた(dev-s3b-branch.pngで
  // 発覚)。high-branchのanchor(8,3.6,-7)は放飼場の隅寄りで、正面軸をそのまま延長する角度だと
  // カメラが地形外(RADIUS_X14/RADIUS_Z12の楕円外)へ出てしまうため、rotateDegを140°まで大きく回し
  // 「ゾウが木を背にして向き合う側(approachの外側、地形中心寄り)」からの3/4俯瞰気味アングルに
  // 変更。距離7(要件6-9単位)、高さは絶対値~2.3(要件~2.5に近い)にして見上げ角を確保しつつ、
  // 幹(細い1本、ゾウとの間に約2単位の間隔)が視線を横切らない方位角にした。
  presets.set(
    "behavior:break-branch",
    behaviorShot(spotOf("high-branch"), {
      rotateDeg: 140,
      distance: 7.0,
      height: -1.3,
      targetOffset: new THREE.Vector3(0, -1.5, 0.2),
      portraitScale: 0.86,
      portraitHeightMul: 1.1,
      fovLandscape: 42,
      fovPortrait: 58
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

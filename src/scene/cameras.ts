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
  /** R1-03向け: プリセット遷移(goTo)のtween進行中かどうか。screenshotReady()の実装に使う。 */
  isTransitioning(): boolean;
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

  // probe-gap(石垣): S7修正(#9)。複数の構図を試した(距離短縮のみ→鼻が映らず、ゾウのheadingを
  // peel-bananaと同じ手法でカメラ側へ振る→被写体が近すぎて逆に鼻が画角外へ、側方プロファイル+
  // 距離拡大)。最終的に、ゾウのheadingは対象へ完全正対のまま(他の行動と同じ既定)にして、カメラを
  // 「backへの引き」を最小限にした側方(side主体)・中距離へ配置する構図を採用した。目・耳・壁・
  // 隙間の位置関係は明瞭に見えるようになったが(修正前は壁越しに後頭部のみが遠景で見える構図だった)、
  // 鼻そのものが隙間へ入り込む瞬間の視認性は静止画では依然弱く、これはS7時点での既知の制限として
  // ops/reports/S7.mdに明記した(壁の隙間列の手前に隣接ブロックが並ぶため、通常の側面角度からは
  // 隙間内部が見えにくい構造上の制約。追加のカメラ再設計はS7のスコープを超えるため見送り)。
  {
    const spot = spotOf("stone-gap");
    const anchor = v3(spot.position); // (-8,0.9,-6) 隙間(壁はここを中心に世界X方向へ延びる)
    const approach = v3(spot.approach); // (-6.4,0,-5.2) ゾウの立ち位置(壁東端のすぐ外)
    const forward = anchor.clone().sub(approach).setY(0).normalize(); // ゾウが隙間へ向く方向
    const side = new THREE.Vector3(forward.z, 0, -forward.x); // 側方(90°)ベクトル
    // 隙間+顔を両方収めるため、狙点はanchorとapproachの中間よりやや隙間寄り(0.35)。
    const target = anchor.clone().lerp(approach, 0.35).add(new THREE.Vector3(0, 0.35, 0));
    const buildPos = (lateral: number, back: number, height: number): THREE.Vector3 =>
      approach.clone().addScaledVector(side, lateral).addScaledVector(forward, -back).add(new THREE.Vector3(0, height, 0));
    presets.set("behavior:probe-gap", {
      landscape: { position: buildPos(6.1, 0.55, 1.5), target, fov: 42 },
      portrait: { position: buildPos(4.7, 0.45, 1.6), target, fov: 58 }
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
  // 内部(xray)が見える角度。角度は維持。
  // R2-03修正(S7): distance2.8は接写しすぎで土管の丸み・全体像が画面外に出てしまい
  // (05-reach-pipe.pngで確認、暗い影の帯のみで「土管」と判別しづらい)、他の行動と静止画で似た
  // 構図に見えていた。撮影に使うiphone-portrait(aspect~0.46)はvertical fov指定に対し実際の
  // 水平画角がかなり狭くなるため、distance3.8程度の微調整では体感的な変化が乏しいことを実写で
  // 確認した。土管全体(LENGTH2.6+OUTER_R0.62*2)+ゾウの鼻先が画面内に収まるまで思い切って引く
  // (2.8→5.6)。角度・高さは変更しない(他の行動カメラには触れない、との指示どおり)。
  presets.set(
    "behavior:reach-pipe",
    behaviorShot(spotOf("pipe"), {
      rotateDeg: 85,
      distance: 5.6,
      height: 1.2,
      targetOffset: new THREE.Vector3(0, 0.25, 0),
      fovLandscape: 40,
      fovPortrait: 58
    })
  );
  // peel-banana(ガジュマル根元): S7修正(#8、選付+カメラの組み合わせ)。banyan.tsのgapPosition
  // (根の窪み)はspot.positionそのもの=幹の中心軸(半径最大0.85の実体シリンダー)の内側にあるため、
  // カメラの角度をどう振っても「幹の中心そのもの」を狙う限りゾウの正面や鼻先は幹の陰に回り込み
  // やすい(dev-s3b-banana.png/S3c修正でも改善しきれず、FAILURE_LEDGER記載どおりカメラ単独調整は
  // 2回失敗)。S7では2つを同時に変える: (1) world.tsのrunSpotBehavior()がbanyan-rootのみ、体の
  // 向きを「幹へ完全正対」ではなく「このカメラの方向(side優位)」へ大きく振る(#8のcomputeApproach
  // Heading参照、鼻先は独立IKで幹側anchorへ届くため不自然にならない)。(2) ここではその新しい体の
  // 向きに合わせ、カメラを幹の裏へ回り込ませず(back成分をほぼ0近くまで縮小)、ほぼ真横〜やや正面
  // 寄りの位置へ。狙点(target)も幹中心そのものではなく、幹とゾウの中間(lerp 0.5)へ寄せることで、
  // 画面の主役をゾウの顔・鼻・バナナ茎側に確保する(幹自体が画面の一部に写らなくても問題ない)。
  {
    const spot = spotOf("banyan-root");
    const anchor = v3(spot.position); // (-6,0.3,3) 幹の中心/根の窪み
    const approach = v3(spot.approach); // (-4.6,0,2.2) ゾウの立ち位置
    const forward = anchor.clone().sub(approach).setY(0).normalize(); // approach→幹中心の方向
    const side = new THREE.Vector3(forward.z, 0, -forward.x); // 左右(側方)ベクトル(world.tsのheading計算と共通)
    const buildPos = (lateral: number, back: number, height: number): THREE.Vector3 =>
      approach.clone().addScaledVector(side, lateral).addScaledVector(forward, back).add(new THREE.Vector3(0, height, 0));
    const target = anchor.clone().lerp(approach, 0.5).add(new THREE.Vector3(0, 0.65, 0.05));
    presets.set("behavior:peel-banana", {
      landscape: { position: buildPos(5.6, -0.8, 2.1), target, fov: 44 },
      portrait: { position: buildPos(4.4, -0.6, 2.4), target, fov: 60 }
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

  /** R1-02修正: 前回のgoTo()が返したPromiseが未解決のまま残っている状態で新しいtransitionへ
   * 上書きすると、前回のPromiseが永久にstallする(gait.walkTo()のR1-01と同型の欠陥だった)。
   * 新transition設定前に必ず呼び、前回分を明示的に解決してから差し替える。 */
  function resolvePendingTransition(): void {
    if (transition) {
      const resolve = transition.resolve;
      transition = null;
      resolve();
    }
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
      resolvePendingTransition();
      camera.position.copy(variant.position);
      currentTarget.copy(variant.target);
      camera.fov = variant.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(currentTarget);
      transition = null;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      resolvePendingTransition();
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

  function isTransitioning(): boolean {
    return transition !== null;
  }

  const rig: CameraRig = { camera, goTo, setOrientation, update, registerPreset, setFollowTarget, setReducedMotion, isTransitioning };

  // QA向けの一時的な橋渡し: main.ts(編集禁止)がworld.tsへCameraRigを配線するまでの間、
  // world.tsのelephantSeek(S3b)がbehavior:<id>への実カメラカットを行えるようにwindow経由で公開する
  // (world.ts側のsetCameraRig()で明示接続されればそちらが優先される)。?qa=1時のみ。
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("qa") === "1") {
    (window as unknown as { __cameraRigDebug?: CameraRig }).__cameraRigDebug = rig;
  }

  return rig;
}

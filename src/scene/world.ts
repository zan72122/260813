// WorldApi実装。放飼場environment全体を構築し、update(dt)を配布する。
// openGate/elephantSeek/elephantEnter/elephantIdleAtはS3/S3bが差し込むフック登録制
// (registerHooks)。未登録時は短いフォールバック(openGateのみ実演出あり、他はwarn+即resolve)。
import * as THREE from "three";
import { createEventBus } from "../core/events";
import { createRng } from "../core/rng";
import type { BehaviorId, EventBus, FoodKind, Quality, SpotKind, TimeOfDay, Vec3, WorldApi } from "../core/types";
import { BEHAVIORS, type BehaviorCamera, type BehaviorContext, type BehaviorEnv, runBehaviorLifecycle } from "./elephant/behaviors";
import { getSpot, SPOTS } from "../game/spots";
import { Elephant } from "./elephant";
import { createWindSystem, type WindSystem } from "./effects/leaves";
import { createBackdrop } from "./environment/backdrop";
import { createBanyan } from "./environment/banyan";
import { createCart } from "./environment/cart";
import { disposeObject3D } from "./environment/dispose";
import { createBananaStem, createFoodMesh } from "./environment/foods";
import { createGate } from "./environment/gate";
import { createKeeper } from "./environment/keeper";
import { createLighting, type LightingRig } from "./environment/lighting";
import { createPipe } from "./environment/pipe";
import { createSandPit } from "./environment/sandPit";
import { createStoneWall } from "./environment/stoneWall";
import { createTallTree } from "./environment/tallTree";
import { createTerrain, groundHeight } from "./environment/terrain";

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
  /** QA/debug向けの軽量スナップショット。debug/qa.tsは編集禁止のため、getState()配線側(S4/S6)が
   * この戻り値を使ってelephantキーを含める想定。JSON化可能な値のみ。 */
  getDebugInfo(): { elephant: { present: true; visible: boolean; state: string; position: Vec3 } };
  /** behavior:start/completeを含むイベント一式。S4(ゲームループ)が購読する想定
   * (world.ts自体はセッション状態を持たない、イベント配信のみ)。 */
  readonly events: EventBus;
  /** S6のQAハーネスが任意behaviorを直接再生するための入口。対象spotへ受理される餌種を自動配置してから
   * (walkToSpotを経由せず)即座に行動を再生する。spotが非表示中なら見える状態にしてから再生する。 */
  playBehaviorDirect(id: BehaviorId): Promise<void>;
  /** main.tsがcameras.tsのCameraRigを接続するための差し込み口(main.ts編集不可のためS4完成まで任意)。
   * 未接続の間はwindow.__cameraRigDebug(?qa=1時にcameras.tsが公開するQAブリッジ)を代わりに探す。 */
  setCameraRig(rig: BehaviorCamera | null): void;
  /** S4: intro演出(飼育員がカートを押して入場する)。keeper/cartを画面外相当の開始位置から定位置まで
   * tweenで動かす。2回目以降/スキップ時はopts.instantで即座に定位置へ確定する(冪等)。 */
  playIntro(opts?: { instant?: boolean }): Promise<void>;
  /** S4: ヒント演出用。飼育員にワールド座標を指差させ、視線も向ける。nullで自然な姿勢へ戻す。 */
  keeperPointAt(pos: Vec3 | null): void;
  /** S5: せってい「ひかりをよわく」。lighting.tsのsetDim()への薄い委譲。 */
  setLightDim(on: boolean): void;
}

interface RunningAnim {
  t: number;
  duration: number;
  easing: (t: number) => number;
  onUpdate: (t: number) => void;
  resolve: () => void;
}

function easeOutCubic(t: number): number {
  const p = 1 - t;
  return 1 - p * p * p;
}

function linear(t: number): number {
  return t;
}

function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 997;
}

export function createWorld(opts?: {
  quality?: Quality;
  timeOfDay?: TimeOfDay;
  reducedMotion?: boolean;
  seed?: number;
}): World {
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
  // S4: intro演出(飼育員がカートを押して入場)のため、既定の立ち位置をカート((0,0,8)付近、
  // 「手前中央」=観察デッキそば)のすぐ脇に変更した(S3c時点はx=0,z=0=放飼場中央付近に佇んでいて
  // カートと無関係な位置だった)。x/zはcameras.tsの"keeper"プリセット(target z≈7.6)に合わせ、
  // yはgroundHeight(x,z)から算出(起伏に足元を合わせる、S3cの修正方針を踏襲)。
  const KEEPER_REST_X = 0.9;
  const KEEPER_REST_Z = 7.35;
  keeper.group.position.set(KEEPER_REST_X, groundHeight(KEEPER_REST_X, KEEPER_REST_Z), KEEPER_REST_Z);
  keeper.group.rotation.y = Math.PI; // 局所+Z向きの顔を-Z(放飼場中心/ゲート側)へ向ける
  scene.add(keeper.group);

  // ゾウ本体(S3)。enter()が呼ばれるまで非表示(Elephantのコンストラクタで初期visible=false)。
  const seedRng = createRng(opts?.seed ?? 1);
  const elephantRng = seedRng.fork("elephant");
  const elephant = new Elephant(elephantRng);
  elephant.setReducedMotion(reducedMotion);
  scene.add(elephant.object3D);
  // 5固有行動(S3b)専用の独立乱数列。elephant本体(モデル/歩行/鼻)のrngとは分けて、
  // 「呼び出し順に依存する微差」がゾウの見た目乱数へ波及しないようにする。
  const behaviorRng = seedRng.fork("behavior-director");

  const events: EventBus = createEventBus();

  // main.ts(編集禁止)がcameras.tsのCameraRigをまだ配線していない間の橋渡し。setCameraRig()で
  // 明示接続されればそちらを優先、未接続ならcameras.tsが?qa=1時に公開するwindowブリッジを試す。
  let cameraBridge: BehaviorCamera | null = null;
  function setCameraRig(rig: BehaviorCamera | null): void {
    cameraBridge = rig;
  }
  function resolveCamera(): BehaviorCamera | null {
    if (cameraBridge) return cameraBridge;
    if (typeof window !== "undefined") {
      const w = window as unknown as { __cameraRigDebug?: BehaviorCamera };
      if (w.__cameraRigDebug) return w.__cameraRigDebug;
    }
    return null;
  }

  const isQaMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("qa") === "1";
  // QA視覚確認用の一時的な足場: ?qa=1の時だけゾウを見える状態にし、window経由でenter/walkToSpot/
  // sniffAroundを外部(playwright等)から呼べるようにする。本番フロー(qa未指定)では一切発火しない。
  if (isQaMode) {
    elephant.object3D.visible = true;
    elephant.idleAt({ x: 0, y: 0, z: 2 });
    (window as unknown as { __elephantDebug?: Elephant }).__elephantDebug = elephant;
  }

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
  // S3が受け持つenter/idleに加え、S3bがelephantSeek(walkToSpot→sniff→行動再生→餌消費)を接続する。
  registerHooks({
    elephantEnter: () => elephant.enter(),
    elephantIdleAt: (pos) => elephant.idleAt(pos),
    elephantSeek: (spotId, food) => runElephantSeek(spotId, food)
  });

  const runningAnims: RunningAnim[] = [];
  function animateValue(duration: number, onUpdate: (t: number) => void, opts?: { easing?: (t: number) => number }): Promise<void> {
    const easing = opts?.easing ?? easeOutCubic;
    return new Promise<void>((resolve) => {
      if (duration <= 0) {
        onUpdate(easing(1));
        resolve();
        return;
      }
      runningAnims.push({ t: 0, duration, easing, onUpdate, resolve });
    });
  }
  /** behaviors/*.tsへ渡すruntimed: 生のu(0..1)を毎フレーム渡す(easeは呼び出し側=各行動が自分で掛ける)。 */
  function runBehaviorTimed(duration: number, onUpdate: (u: number) => void): Promise<void> {
    return animateValue(duration, onUpdate, { easing: linear });
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
    elephant.update(dt);

    for (let i = runningAnims.length - 1; i >= 0; i--) {
      const anim = runningAnims[i];
      if (!anim) continue;
      anim.t = Math.min(1, anim.t + dt / anim.duration);
      anim.onUpdate(anim.easing(anim.t));
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
    elephant.setReducedMotion(on);
  }

  function setLightDim(on: boolean): void {
    lighting.setDim(on);
  }

  function placeFood(spotId: SpotKind, food: FoodKind): void {
    const existing = placedFoods.get(spotId);
    if (existing) {
      disposeObject3D(existing);
      placedFoods.delete(spotId);
    }
    const spot = getSpot(spotId);
    let group: THREE.Group;
    if (food === "banana-stem") {
      // peel-banana行動が層(layers)/芯(core)を個別に剥がせるよう、userDataへ保持しておく
      // (createFoodMesh()はgroupしか返さないため、layers構造が要る場合はcreateBananaStem()を使う)。
      const stem = createBananaStem(hashSeed(spotId + food));
      stem.group.userData.bananaLayers = stem.layers;
      stem.group.userData.bananaCore = stem.core;
      group = stem.group;
    } else {
      group = createFoodMesh(food, hashSeed(spotId + food));
    }
    group.position.set(spot.position.x, spot.position.y, spot.position.z);
    scene.add(group);
    placedFoods.set(spotId, group);
  }

  function clearFoods(): void {
    for (const obj of placedFoods.values()) disposeObject3D(obj);
    placedFoods.clear();
  }

  // 5固有行動が触れる環境インスタンス一式(behaviors/types.tsのBehaviorEnv)。
  const behaviorEnv: BehaviorEnv = { stoneWall, sandPit, pipe: pipeRig, banyan, tallTree };

  /** spotIdの行動(BehaviorId)を1回再生する。placeFood→BEHAVIORS[...]実行→餌の後片付けまで面倒を見る。
   * elephantSeek(歩行込み)とplayBehaviorDirect(QA向け、歩行スキップ)の両方から呼ばれる共通経路。 */
  async function runSpotBehavior(spotId: SpotKind, food: FoodKind): Promise<void> {
    const spot = getSpot(spotId);
    placeFood(spotId, food); // 呼び出し側が未配置でも/違う食材を指定していても、要求通りに揃える
    // 対象(隙間/砂場/土管/根元/高木)の方をきちんと向かせてから行動を始める。walkToSpot経由でも
    // (歩いてきた方向をそのまま向いているだけで対象を向いているとは限らないため)、
    // playBehaviorDirect経由(歩行スキップ)でも、この1箇所で一貫して向きを揃える。
    const heading = Math.atan2(spot.position.x - spot.approach.x, spot.position.z - spot.approach.z);
    elephant.idleAt(spot.approach, heading);
    const foodObject = placedFoods.get(spotId);
    if (!foodObject) {
      console.warn(`[world] runSpotBehavior(${spotId}): placeFood failed unexpectedly, skipping`);
      return;
    }
    const behaviorId = spot.elephantBehavior;
    const fn = BEHAVIORS[behaviorId];
    const ctx: BehaviorContext = {
      elephant,
      scene,
      camera: resolveCamera(),
      rng: behaviorRng.fork(`${spotId}-${behaviorId}`),
      reducedMotion,
      quality,
      events,
      spotId,
      food,
      foodObject,
      env: behaviorEnv,
      runTimed: runBehaviorTimed
    };
    await runBehaviorLifecycle(events, behaviorId, spotId, () => fn(ctx));
    // 行動側がfoodObjectを食べ終えて(disposeObject3Dで)取り除いている前提。map側の参照も掃除する。
    placedFoods.delete(spotId);
  }

  /** exploration表現: 複数の隠しスポットがあるとき、本命へ向かう前に一瞬だけ別スポット方向へ
   * 鼻を向ける「迷い」をrngで混ぜる(発生率5割、+2秒以内、全体テンポは損なわない)。 */
  async function maybeGlanceElsewhere(targetSpotId: SpotKind): Promise<void> {
    if (!elephant.visible) return; // enter()未了(=まだ登場していない)なら演出しない
    if (SPOTS.length <= 1) return;
    if (behaviorRng.next() >= 0.5) return;
    const decoys = SPOTS.filter((s) => s.id !== targetSpotId);
    const decoy = decoys.length > 0 ? behaviorRng.pick(decoys) : undefined;
    if (!decoy) return;
    const p = elephant.getPosition();
    const dir = new THREE.Vector3(decoy.position.x - p.x, 0, decoy.position.z - p.z);
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const glanceTarget = new THREE.Vector3(p.x + dir.x * 0.9, p.y + 0.55, p.z + dir.z * 0.9);
    elephant.trunk.setTarget(glanceTarget, { curl: 0.15 });
    const duration = Math.min(2, (reducedMotion ? 0.45 : 0.9) + behaviorRng.range(0, 0.5));
    await animateValue(duration, () => {}, { easing: linear });
    elephant.trunk.relax();
  }

  async function runElephantSeek(spotId: SpotKind, food: FoodKind): Promise<void> {
    // elephantEnter()未実行(=非表示)のままelephantSeek()が呼ばれた場合の防御。非表示中は
    // elephant.update(dt)が丸ごとno-opなためgait/trunkのタスクが進まずPromiseが永久に解決しない
    // (呼び出し順の誤りでゲームが止まる)事故を避け、その場で見える状態にしてから進める。
    if (!elephant.visible) elephant.object3D.visible = true;
    await maybeGlanceElsewhere(spotId);
    await elephant.walkToSpot(spotId);
    const sniffSeconds = behaviorRng.range(reducedMotion ? 0.3 : 0.55, reducedMotion ? 0.5 : 0.9);
    await elephant.sniffAround(sniffSeconds);
    await runSpotBehavior(spotId, food);
  }

  /** S6のQAハーネスが任意behaviorを直接再生する入口。歩行はスキップし、対象spotの受理食材(先頭)を
   * 自動配置してから即座に行動を再生する。ゾウが未登場でも見える状態にしてから配置する。 */
  async function playBehaviorDirect(id: BehaviorId): Promise<void> {
    const spot = SPOTS.find((s) => s.elephantBehavior === id);
    if (!spot) {
      console.warn(`[world] playBehaviorDirect: no spot maps to behavior "${id}"`);
      return;
    }
    const food = spot.acceptedFoodTypes[0];
    if (!food) {
      console.warn(`[world] playBehaviorDirect: spot "${spot.id}" has no acceptedFoodTypes`);
      return;
    }
    if (!elephant.visible) elephant.object3D.visible = true;
    await runSpotBehavior(spot.id, food);
  }

  // S4: intro演出。keeper/cartの「定位置」は構築時点の位置(keeperは上のKEEPER_REST、cartはcreateCart()
  // 内で設定した(0,0,8))をそのまま使う。開始位置はそこから-X方向へ離れた場所(観察デッキの外側寄り、
  // カメラ"keeper"プリセットのx=2.4付近から見て画面手前から奥へ押して入ってくるように読める向き)。
  const keeperRestPos = keeper.group.position.clone();
  const cartRestPos = cart.position.clone();
  const INTRO_START_OFFSET_X = -3.4;
  let introSettled = false;
  async function playIntro(opts?: { instant?: boolean }): Promise<void> {
    if (opts?.instant || introSettled) {
      keeper.group.position.copy(keeperRestPos);
      cart.position.copy(cartRestPos);
      introSettled = true;
      return;
    }
    const kStart = keeperRestPos.clone().add(new THREE.Vector3(INTRO_START_OFFSET_X, 0, 0));
    const cStart = cartRestPos.clone().add(new THREE.Vector3(INTRO_START_OFFSET_X, 0, 0));
    keeper.group.position.copy(kStart);
    cart.position.copy(cStart);
    const duration = reducedMotion ? 0.7 : 2.2;
    await animateValue(duration, (t) => {
      keeper.group.position.x = THREE.MathUtils.lerp(kStart.x, keeperRestPos.x, t);
      cart.position.x = THREE.MathUtils.lerp(cStart.x, cartRestPos.x, t);
      // 押しているカートの微かな上下(轍を乗り越える感じ)。因果を強調しすぎない小さな揺れ。
      cart.position.y = cartRestPos.y + (reducedMotion ? 0 : Math.sin(t * Math.PI * 5) * 0.012 * (1 - t));
    });
    keeper.group.position.copy(keeperRestPos);
    cart.position.copy(cartRestPos);
    introSettled = true;
  }

  function keeperPointAt(pos: Vec3 | null): void {
    if (!pos) {
      keeper.point(null);
      keeper.lookAt(null);
      return;
    }
    const target = new THREE.Vector3(pos.x, pos.y, pos.z);
    keeper.point(target);
    keeper.lookAt(target);
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

  function getDebugInfo(): { elephant: { present: true; visible: boolean; state: string; position: Vec3 } } {
    return {
      elephant: {
        present: true,
        visible: elephant.visible,
        state: elephant.getState(),
        position: elephant.getPosition()
      }
    };
  }

  function dispose(): void {
    elephant.dispose();
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

  const api: World = {
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
    registerHooks,
    getDebugInfo,
    events,
    playBehaviorDirect,
    setCameraRig,
    playIntro,
    keeperPointAt,
    setLightDim
  };

  // S3b: playBehaviorDirect()をQAスクリプトから直接叩けるようworld自体もwindowへ公開する
  // (cameras.tsも同条件でCameraRigを公開するので、resolveCamera()が拾って実カメラカットする)。
  if (isQaMode) {
    (window as unknown as { __worldDebug?: World }).__worldDebug = api;
  }

  return api;
}

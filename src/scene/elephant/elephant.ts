// 統合クラス: アジアゾウ本体。model(見た目+常時アニメ)+trunk(鼻のspline制御)+gait(歩行)を束ね、
// enter/walkToSpot/sniffAround/idleAtの高レベル演出APIをworld.tsのフックへ提供する。
import * as THREE from "three";
import type { Rng, SpotKind, Vec3 } from "../../core/types";
import { getSpot } from "../../game/spots";
import { groundHeight } from "../environment/terrain";
import { Gait } from "./gait";
import { buildElephantModel, type ElephantModel, type LegRig } from "./model";
import { Trunk } from "./trunk";

// ゲート開口部(terrain.tsのisGateArc)の外側。ゲートz=-12.6より奥(-Z側)から入場する。
const GATE_OUTSIDE = { x: 0, z: -14.4 };
const GATE_INSIDE = { x: 0, z: -9.4 };

export type ElephantState = "hidden" | "idle" | "walking" | "sniffing" | "entering";

interface TimedTask {
  t: number;
  duration: number;
  onUpdate: (u: number) => void;
  resolve: () => void;
}

export class Elephant {
  private readonly model: ElephantModel;
  private readonly gait: Gait;
  private readonly rng: Rng;
  readonly trunk: Trunk;

  private state: ElephantState = "hidden";
  private readonly timedTasks: TimedTask[] = [];

  constructor(rng: Rng) {
    this.rng = rng;
    this.model = buildElephantModel(rng.fork("elephant-model"));
    this.trunk = new Trunk({ rng: rng.fork("trunk") });
    this.model.trunkSocket.add(this.trunk.root);
    this.gait = new Gait({
      root: this.model.group,
      bodyPivot: this.model.bodyPivot,
      legs: this.model.legs,
      groundOffset: this.model.groundOffset,
      groundHeight,
      speed: 1.2
    });
    this.model.group.visible = false;
    // 入場前は柵の外(ゲートの向こう)に待機させておく。
    this.gait.snapTo({ ...GATE_OUTSIDE, y: 0 }, 0);
  }

  /** シーンに追加するObject3D。 */
  get object3D(): THREE.Object3D {
    return this.model.group;
  }

  /** S3b(behaviors)が個々の脚(股関節/膝ピボット)を直接動かすためのアクセサ(掘る仕草の前脚等)。
   * gait.update()は非移動中も毎フレームsettleLegs()でhip/knee.rotation.xを0へ寄せるため、
   * behaviorがこれらを操作する場合はelephant.update(dt)より後(同一フレーム内)に上書きし続けること。 */
  get legs(): readonly LegRig[] {
    return this.model.legs;
  }

  /** S3b向け: 体幹ピボット(呼吸/歩行ボブが掛かる親)。break-branchの重心後方シフト等の微傾斜に使う。
   * legsと同様、gait.applyBodyMotion()が毎フレームposition.y/rotation.zを設定し直すため、
   * behaviorが操作する場合はelephant.update(dt)より後で上書きし続けること。 */
  get bodyPivot(): THREE.Group {
    return this.model.bodyPivot;
  }

  get visible(): boolean {
    return this.model.group.visible;
  }

  getState(): ElephantState {
    return this.state;
  }

  getPosition(): Vec3 {
    const p = this.model.group.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  update(dt: number): void {
    // タイムドタスク(sniffAround等)は非表示中も進めない。
    if (!this.model.group.visible) return;
    this.gait.update(dt);
    this.model.setWalking(this.gait.isMoving);
    this.model.update(dt);
    this.trunk.setSwing(this.gait.isMoving ? 0.6 : 0);
    // sniffAround等のタイムドタスクがtrunk.setTarget()を呼ぶので、trunk.update()より先に進める
    // (同一フレーム内で最新の目標を反映させるため)。
    this.advanceTimedTasks(dt);
    this.trunk.update(dt);
  }

  setReducedMotion(on: boolean): void {
    this.model.setReducedMotion(on);
    this.gait.setReducedMotion(on);
    this.trunk.setReducedMotion(on);
  }

  private runTimed(duration: number, onUpdate: (u: number) => void): Promise<void> {
    return new Promise((resolve) => {
      if (duration <= 0) {
        onUpdate(1);
        resolve();
        return;
      }
      this.timedTasks.push({ t: 0, duration, onUpdate, resolve });
    });
  }

  private advanceTimedTasks(dt: number): void {
    for (let i = this.timedTasks.length - 1; i >= 0; i--) {
      const task = this.timedTasks[i];
      if (!task) continue;
      task.t = Math.min(1, task.t + dt / task.duration);
      task.onUpdate(task.t);
      if (task.t >= 1) {
        this.timedTasks.splice(i, 1);
        task.resolve();
      }
    }
  }

  /** ゲート開口部の外側から場内へ歩き、立ち止まり、鼻を上げて左右に匂いを探す登場演出。 */
  async enter(): Promise<void> {
    this.state = "entering";
    this.model.group.visible = true;
    const startX = GATE_OUTSIDE.x + this.rng.range(-0.5, 0.5);
    this.gait.snapTo({ x: startX, y: 0, z: GATE_OUTSIDE.z }, 0);

    const entryHeading = this.rng.range(-0.15, 0.15);
    const entryX = GATE_INSIDE.x + entryHeading * 2;
    await this.gait.walkTo([
      { x: startX * 0.4, y: 0, z: GATE_OUTSIDE.z + 1.6 },
      { x: entryX, y: 0, z: GATE_INSIDE.z }
    ]);

    // 登場演出は鼻を高く上げて左右に匂いを探る(sniffAround()の「低く振る」とは高さが異なる)。
    this.state = "sniffing";
    const sniffSeconds = this.rng.range(2, 3);
    await this.trunkSearchSweep(sniffSeconds, { heightBase: 1.55, heightAmp: 0.35, reach: 0.75, curlBase: 0.1 });
    this.trunk.relax();
    this.state = "idle";
  }

  /** SPOTSのapproachへ歩く。 */
  async walkToSpot(spotId: SpotKind): Promise<void> {
    const spot = getSpot(spotId);
    this.state = "walking";
    this.trunk.setSwing(0.6);
    await this.gait.walkTo([spot.approach]);
    this.state = "idle";
    this.trunk.relax();
  }

  /** その場で鼻を左右低く振って嗅ぐ。 */
  async sniffAround(seconds: number): Promise<void> {
    this.state = "sniffing";
    await this.trunkSearchSweep(seconds, { heightBase: 0.32, heightAmp: 0.16, reach: 0.9, curlBase: 0.2 });
    this.trunk.relax();
    if (this.state === "sniffing") this.state = "idle";
  }

  /** 鼻を根本前方の一定の高さへ伸ばし、左右に振りながら探す共通アニメーション。
   * heightBaseは地面からの高さ(ワールド単位、root.position.yは脚長ぶん既に高いのでgroundHeightを
   * 基準に取り直す)。enter()の「鼻を上げて探す」とsniffAround()の「低く振る」を同じ仕組みで作る。 */
  private async trunkSearchSweep(
    seconds: number,
    opts: { heightBase: number; heightAmp: number; reach: number; curlBase: number }
  ): Promise<void> {
    const rootPos = this.model.group.position;
    const groundY = groundHeight(rootPos.x, rootPos.z);
    const base = new THREE.Vector3(rootPos.x, groundY, rootPos.z);
    const forward = new THREE.Vector3(Math.sin(this.model.group.rotation.y), 0, Math.cos(this.model.group.rotation.y));
    const sweeps = 2 + Math.round(this.rng.range(0, 1));
    const seedPhase = this.rng.range(0, Math.PI * 2);
    await this.runTimed(Math.max(0.3, seconds), (u) => {
      const angle = Math.sin(u * Math.PI * 2 * sweeps + seedPhase) * 0.9;
      const lift = opts.heightBase + Math.sin(u * Math.PI) * opts.heightAmp;
      const target = base
        .clone()
        .addScaledVector(forward, opts.reach)
        .add(new THREE.Vector3(Math.sin(angle) * 0.7, lift, Math.cos(angle) * 0.15));
      this.trunk.setTarget(target, { curl: opts.curlBase + 0.1 * Math.sin(u * Math.PI * 3) });
    });
  }

  /** その場idle(呼吸の微動、耳、瞬き、尻尾)。posを渡すとその位置へ即座に移動して佇む。
   * headingRad省略時は現在の向きを保つ(WorldApi.elephantIdleAtの既存契約通り)。S3bのbehaviors実行前
   * (world.ts側)がheadingRadを明示して「対象(隙間/砂場/土管/根元/高木)の方を向かせる」用途に使う。 */
  idleAt(pos: Vec3 | null, headingRad?: number): void {
    this.gait.stop();
    if (pos) {
      this.gait.snapTo(pos, headingRad ?? this.model.group.rotation.y);
    }
    this.state = "idle";
    this.trunk.relax();
  }

  dispose(): void {
    this.trunk.dispose();
    this.model.dispose();
  }
}

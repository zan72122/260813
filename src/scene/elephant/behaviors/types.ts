// 5固有行動(behaviors/*.ts)が共通で受け取るコンテキスト型。world.tsのelephantSeekが構築して渡す。
import type * as THREE from "three";
import type { EventBus, FoodKind, Quality, Rng, SpotKind } from "../../../core/types";
import type { Banyan } from "../../environment/banyan";
import type { Pipe } from "../../environment/pipe";
import type { SandPit } from "../../environment/sandPit";
import type { StoneWall } from "../../environment/stoneWall";
import type { TallTree } from "../../environment/tallTree";
import type { Elephant } from "../elephant";

/** カメラ制御の最小インターフェース(cameras.tsのCameraRig全体ではなくgoToのみ必要)。
 * main.ts編集禁止のため実カメラの配線はS4で完成する想定。未接続時はnullで安全にno-op。 */
export interface BehaviorCamera {
  goTo(preset: string, opts?: { instant?: boolean }): Promise<void>;
}

/** 各行動が触れうる環境インスタンス一式。全spot分揃えて渡す(未使用のものは単に参照しない)。 */
export interface BehaviorEnv {
  stoneWall: StoneWall;
  sandPit: SandPit;
  pipe: Pipe;
  banyan: Banyan;
  tallTree: TallTree;
}

export interface BehaviorContext {
  readonly elephant: Elephant;
  readonly scene: THREE.Scene;
  /** main.ts未配線の間はnull(カメラ演出はno-opでスキップされる)。 */
  readonly camera: BehaviorCamera | null;
  readonly rng: Rng;
  readonly reducedMotion: boolean;
  readonly quality: Quality;
  readonly events: EventBus;
  readonly spotId: SpotKind;
  readonly food: FoodKind;
  /** placeFoodされた餌メッシュ本体。行動が動かし、食べ終えたらシーンから取り除く責務を持つ。 */
  readonly foodObject: THREE.Object3D;
  readonly env: BehaviorEnv;
  /** duration秒(reducedMotion調整込み)かけてonUpdate(u: 0..1)を毎フレーム呼び、完了でresolveする。
   * world.update(dt)のループに乗って進む(linear、easeは呼び出し側が自分で掛ける)。 */
  runTimed(duration: number, onUpdate: (u: number) => void): Promise<void>;
}

export type BehaviorFn = (ctx: BehaviorContext) => Promise<void>;

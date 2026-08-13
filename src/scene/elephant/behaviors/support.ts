// 5行動が共有する小さなヘルパー。scaledDuration/runBehaviorLifecycleはthree非依存の純ロジックで、
// tests/unit/behaviors.test.tsが直接テストする。それ以外(THREE座標系のヘルパー)はここにまとめて
// 各behaviors/*.tsの重複を減らす。
import * as THREE from "three";
import type { BehaviorId, EventBus, SpotKind } from "../../../core/types";
import { disposeObject3D } from "../../environment/dispose";
import type { LegRig } from "../model";
import type { BehaviorContext } from "./types";

/** reducedMotion時に尺を短縮する倍率(要件: 約60%)。 */
export const REDUCED_MOTION_SCALE = 0.6;

/** 秒数をreducedMotionに応じてスケールする(純ロジック、three非依存)。 */
export function scaledDuration(seconds: number, reducedMotion: boolean): number {
  const s = Math.max(0, seconds);
  return reducedMotion ? s * REDUCED_MOTION_SCALE : s;
}

/** behavior:start → fn() → behavior:complete の順でeventBusへemitする共通ラッパー(純ロジック)。
 * fnが例外を投げた場合はcompleteをemitせずそのまま再throwする(中断を握りつぶさない)。 */
export async function runBehaviorLifecycle(
  events: EventBus,
  id: BehaviorId,
  spotId: SpotKind,
  fn: () => Promise<void>
): Promise<void> {
  events.emit("behavior:start", { behaviorId: id, spotId });
  await fn();
  events.emit("behavior:complete", { behaviorId: id, spotId });
}

/** camera未接続(null)時は安全にno-opする、行動専用接写への遷移。 */
export async function cutCamera(ctx: Pick<BehaviorContext, "camera">, preset: string): Promise<void> {
  if (!ctx.camera) return;
  await ctx.camera.goTo(preset);
}

/** 完了後の「少し引いたReveal」ショット: spot:<id>(S2既存の引いた画)へ遷移し、短く静止してから戻る。 */
export async function revealShot(
  ctx: Pick<BehaviorContext, "camera" | "reducedMotion" | "runTimed">,
  spotId: string
): Promise<void> {
  await cutCamera(ctx, `spot:${spotId}`);
  await ctx.runTimed(scaledDuration(1.0, ctx.reducedMotion), () => {});
}

export function worldPositionOf(obj: THREE.Object3D): THREE.Vector3 {
  return obj.getWorldPosition(new THREE.Vector3());
}

/** 鼻の付け根付近(=概ね口元)のワールド座標。「口へ運ぶ」動作の着地点として使う。 */
export function mouthPosition(ctx: Pick<BehaviorContext, "elephant">): THREE.Vector3 {
  return worldPositionOf(ctx.elephant.trunk.root).add(new THREE.Vector3(0, 0.05, 0.08));
}

/** 餌を食べ終えたとしてシーンから除去する(geometry/material解放込み)。 */
export function eatFood(ctx: Pick<BehaviorContext, "foodObject">): void {
  disposeObject3D(ctx.foodObject);
}

/** ゾウの現在地からfoodへ向かう水平(XZ)方向の単位ベクトル。 */
export function approachDirXZ(ctx: Pick<BehaviorContext, "elephant">, foodWorldPos: THREE.Vector3): THREE.Vector3 {
  const p = ctx.elephant.getPosition();
  const dir = new THREE.Vector3(foodWorldPos.x - p.x, 0, foodWorldPos.z - p.z);
  if (dir.lengthSq() < 1e-6) return new THREE.Vector3(0, 0, 1);
  return dir.normalize();
}

/** 前脚を1本選ぶ(dig-sandの掻き仕草用)。rngで左右どちらかをランダム選択。 */
export function pickFrontLeg(ctx: Pick<BehaviorContext, "rng">, legs: readonly LegRig[]): LegRig | undefined {
  const fronts = legs.filter((l) => l.front);
  return fronts.length > 0 ? ctx.rng.pick(fronts) : legs[0];
}

export function lerpV3(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  return a.clone().lerp(b, t);
}

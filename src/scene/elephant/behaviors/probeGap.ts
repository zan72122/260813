// probe-gap(石垣): 鼻先が隙間の前で一拍ためらい→差し込み(鼻が曲がって奥へ)→先端curlで餌をつまむ→
// ゆっくり引き抜く→口へ運び咀嚼。因果の瞬間は「つまむ」(=食べ物が姿を現す瞬間でもある)。
import * as THREE from "three";
import { Easing } from "../../../core/tween";
import { approachDirXZ, cutCamera, eatFood, lerpV3, mouthPosition, revealShot, worldPositionOf } from "./support";
import { scaledDuration } from "./support";
import type { BehaviorContext } from "./types";

export async function probeGap(ctx: BehaviorContext): Promise<void> {
  const { elephant, rng, reducedMotion, foodObject } = ctx;
  const trunk = elephant.trunk;
  const T = (s: number): number => scaledDuration(s, reducedMotion);

  const foodPos = worldPositionOf(foodObject);
  const dir = approachDirXZ(ctx, foodPos); // ゾウ→隙間の水平方向
  const frontPos = foodPos.clone().addScaledVector(dir, -0.4).add(new THREE.Vector3(0, 0.05, 0));
  const insidePos = foodPos.clone().addScaledVector(dir, 0.12); // 隙間の奥へわずかに押し込む

  // 餌は隙間の奥にあり、掴むまでは見えない。
  foodObject.visible = false;

  await cutCamera(ctx, "behavior:probe-gap");

  // --- ためらい: 鼻先を隙間の手前で1-2拍、軽く行き来させる ---
  const beats = rng.int(1, 2);
  for (let b = 0; b < beats; b++) {
    const near = frontPos.clone().addScaledVector(dir, 0.12 + rng.range(-0.03, 0.03));
    await ctx.runTimed(T(0.32), (u) => {
      trunk.setTarget(lerpV3(frontPos, near, Math.sin(u * Math.PI)), { curl: 0.08 });
    });
  }

  // --- 差し込み: 鼻が曲がって奥へ進む ---
  await ctx.runTimed(T(1.5), (u) => {
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(lerpV3(frontPos, insidePos, e), { curl: 0.15 + e * 0.35 });
  });

  // --- つまむ(因果の瞬間): 先端curlを強め、餌が姿を現す ---
  foodObject.visible = true;
  foodObject.position.copy(foodPos);
  foodObject.scale.setScalar(0.001);
  await ctx.runTimed(T(0.4), (u) => {
    trunk.setTarget(insidePos, { curl: 0.5 + u * 0.45 });
    foodObject.scale.setScalar(THREE.MathUtils.clamp(Easing.easeOutBack(u), 0.001, 1));
  });
  foodObject.scale.setScalar(1);

  // --- 引き抜く: ゆっくり手前へ。餌は鼻先に追従 ---
  await ctx.runTimed(T(1.3), (u) => {
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(lerpV3(insidePos, frontPos, e), { curl: 0.92 });
    foodObject.position.copy(trunk.getTipPosition());
  });

  // --- 口へ運ぶ ---
  const mouth = mouthPosition(ctx);
  await ctx.runTimed(T(0.65), (u) => {
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(lerpV3(frontPos, mouth, e), { curl: 0.9 });
    foodObject.position.copy(trunk.getTipPosition());
  });

  // --- 咀嚼 ---
  await ctx.runTimed(T(0.5), (u) => {
    trunk.setCurl(0.85 + Math.sin(u * Math.PI * 4) * 0.08);
  });
  eatFood(ctx);
  trunk.relax();

  await revealShot(ctx, ctx.spotId);
}

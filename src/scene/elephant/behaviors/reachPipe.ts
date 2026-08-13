// reach-pipe(土管): 土管前でしゃがみ気味に→鼻が土管口へ入る→setPipeXray(true)で内部が透けて鼻の
// 進行が見える→鼻先が餌に触れcurl(因果の瞬間: 届く)→鼻と餌が一緒に戻る→xray解除→口へ。
import * as THREE from "three";
import { Easing } from "../../../core/tween";
import { cutCamera, eatFood, lerpV3, mouthPosition, revealShot, scaledDuration, worldPositionOf } from "./support";
import type { BehaviorContext } from "./types";

const CROUCH = 0.14;

export async function reachPipe(ctx: BehaviorContext): Promise<void> {
  const { elephant, reducedMotion, foodObject, env } = ctx;
  const trunk = elephant.trunk;
  const pipe = env.pipe;
  const T = (s: number): number => scaledDuration(s, reducedMotion);

  const foodPos = worldPositionOf(foodObject);
  const elephantPos = elephant.getPosition();
  const [endA, endB] = pipe.getOpeningPositions();
  const distA = Math.hypot(endA.x - elephantPos.x, endA.z - elephantPos.z);
  const distB = Math.hypot(endB.x - elephantPos.x, endB.z - elephantPos.z);
  const nearOpening = distA <= distB ? endA : endB;
  const towardElephant = new THREE.Vector3(elephantPos.x - nearOpening.x, 0, elephantPos.z - nearOpening.z);
  if (towardElephant.lengthSq() < 1e-6) towardElephant.set(0, 0, 1);
  towardElephant.normalize();
  const outsidePos = nearOpening.clone().addScaledVector(towardElephant, 0.35).add(new THREE.Vector3(0, 0.05, 0));

  foodObject.visible = false;

  const applyCrouch = (): void => {
    elephant.bodyPivot.position.y = -CROUCH;
  };

  await cutCamera(ctx, "behavior:reach-pipe");

  // --- しゃがみ気味に ---
  await ctx.runTimed(T(0.6), (u) => {
    elephant.bodyPivot.position.y = -CROUCH * Easing.easeOutQuad(u);
    trunk.setTarget(outsidePos, { curl: 0.1 });
  });

  // --- 鼻が土管口へ入る ---
  pipe.setPipeXray(true);
  foodObject.visible = true;
  await ctx.runTimed(T(1.4), (u) => {
    applyCrouch();
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(lerpV3(outsidePos, nearOpening, e), { curl: 0.15 + e * 0.3 });
  });

  // --- 内部を奥へ進み、餌に届く ---
  await ctx.runTimed(T(1.4), (u) => {
    applyCrouch();
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(lerpV3(nearOpening, foodPos, e), { curl: 0.45 + e * 0.2 });
  });

  // --- 因果の瞬間: 届く(先端curlで確保) ---
  await ctx.runTimed(T(0.4), (u) => {
    applyCrouch();
    trunk.setTarget(foodPos, { curl: 0.65 + u * 0.28 });
  });

  // --- 鼻と餌が一緒に戻る ---
  await ctx.runTimed(T(1.3), (u) => {
    applyCrouch();
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(lerpV3(foodPos, outsidePos, e), { curl: 0.9 });
    foodObject.position.copy(trunk.getTipPosition());
  });

  // --- xray解除 ---
  pipe.setPipeXray(false);

  // --- 口へ ---
  const mouth = mouthPosition(ctx);
  await ctx.runTimed(T(0.75), (u) => {
    const e = Easing.easeInOutQuad(u);
    elephant.bodyPivot.position.y = -CROUCH * (1 - e);
    trunk.setTarget(lerpV3(outsidePos, mouth, e), { curl: 0.88 });
    foodObject.position.copy(trunk.getTipPosition());
  });

  await ctx.runTimed(T(0.55), (u) => {
    trunk.setCurl(0.82 + Math.sin(u * Math.PI * 4) * 0.08);
  });
  eatFood(ctx);
  trunk.relax();
  elephant.bodyPivot.position.y = 0;

  await revealShot(ctx, ctx.spotId);
}

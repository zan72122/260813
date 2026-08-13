// peel-banana(ガジュマル根元): バナナ茎の外層を鼻でつかむ→1枚を長く引いて剥がす(繊維の裏の
// クリーム色が見える)→口へ→次の層、を3回繰り返す→芯を食べる。因果の瞬間は「剥がれる」(層ごと)。
import * as THREE from "three";
import { Easing } from "../../../core/tween";
import { paintVertexUniform } from "../../environment/proc";
import { disposeObject3D } from "../../environment/dispose";
import { cutCamera, eatFood, mouthPosition, revealShot, scaledDuration, worldPositionOf } from "./support";
import type { BehaviorContext } from "./types";

const BANANA_INNER = new THREE.Color("#f2ecd4");

function arcLerp(a: THREE.Vector3, b: THREE.Vector3, t: number, lift: number): THREE.Vector3 {
  const p = a.clone().lerp(b, t);
  p.y += Math.sin(t * Math.PI) * lift;
  return p;
}

export async function peelBanana(ctx: BehaviorContext): Promise<void> {
  const { elephant, rng, reducedMotion, foodObject, scene } = ctx;
  const trunk = elephant.trunk;
  const T = (s: number): number => scaledDuration(s, reducedMotion);

  const layers = (foodObject.userData.bananaLayers as THREE.Mesh[] | undefined) ?? [];
  const stemCenter = worldPositionOf(foodObject);
  const mouth = mouthPosition(ctx);

  await cutCamera(ctx, "behavior:peel-banana");

  // --- 掴む意思表示: 鼻先を茎へ寄せる一拍 ---
  await ctx.runTimed(T(0.6), (u) => {
    const p = stemCenter.clone().add(new THREE.Vector3(0, 0.06, Math.sin(u * Math.PI) * -0.05));
    trunk.setTarget(p, { curl: 0.1 + u * 0.15 });
  });

  const peelCount = Math.min(3, layers.length);
  for (let i = 0; i < peelCount; i++) {
    const layer = layers[i];
    if (!layer) continue;
    const angle = rng.range(0, Math.PI * 2);
    const grabWorld = worldPositionOf(layer);

    // --- 掴む ---
    await ctx.runTimed(T(0.65), (u) => {
      trunk.setTarget(grabWorld, { curl: 0.35 + u * 0.35 });
    });

    // --- 剥がれる(因果の瞬間): 繊維の裏のクリーム色を見せ、シーン直下へ付け替えて自由に動かす ---
    paintVertexUniform(layer.geometry, BANANA_INNER);
    scene.attach(layer);
    layer.userData.peeled = true;

    const outDir = new THREE.Vector3(Math.sin(angle), 0.35, Math.cos(angle)).normalize();
    const pulledPos = grabWorld.clone().addScaledVector(outDir, 0.55);

    // --- 長く引いて剥がす ---
    await ctx.runTimed(T(1.15), (u) => {
      const e = Easing.easeInOutQuad(u);
      const p = arcLerp(grabWorld, pulledPos, e, 0.18);
      trunk.setTarget(p, { curl: 0.75 });
      layer.position.copy(p);
      layer.rotation.z = e * (angle % 2 === 0 ? 1 : -1) * 0.9;
      layer.scale.setScalar(THREE.MathUtils.lerp(1, 0.82, e));
    });

    // --- 口へ ---
    await ctx.runTimed(T(0.65), (u) => {
      const e = Easing.easeInOutQuad(u);
      const p = arcLerp(pulledPos, mouth, e, 0.22);
      trunk.setTarget(p, { curl: 0.85 });
      layer.position.copy(p);
      layer.scale.setScalar(THREE.MathUtils.lerp(0.82, 0.3, e));
    });

    await ctx.runTimed(T(0.4), (u) => {
      trunk.setCurl(0.8 + Math.sin(u * Math.PI * 4) * 0.08);
    });
    disposeObject3D(layer);
  }

  // --- 芯を食べる ---
  await ctx.runTimed(T(0.55), (u) => {
    const e = Easing.easeInOutQuad(u);
    const p = stemCenter.clone().lerp(mouth, e * 0.4);
    trunk.setTarget(p, { curl: 0.4 + u * 0.4 });
  });
  await ctx.runTimed(T(0.65), (u) => {
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(stemCenter.clone().lerp(mouth, e), { curl: 0.88 });
    foodObject.position.lerpVectors(stemCenter, mouth, e * 0.9);
  });
  await ctx.runTimed(T(0.6), (u) => {
    trunk.setCurl(0.82 + Math.sin(u * Math.PI * 4) * 0.08);
  });
  eatFood(ctx);
  trunk.relax();

  await revealShot(ctx, ctx.spotId);
}

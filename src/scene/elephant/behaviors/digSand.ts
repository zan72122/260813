// dig-sand(砂場): 鼻で砂表面を2-3回払う→前脚で1-2回掻く→砂が退く(sandPitのmound stateを段階的に
// 下げる+砂decal/粒子少量)→餌が徐々に見える→鼻で拾い口へ。因果の瞬間は「現れる」(餌が見える瞬間)。
import * as THREE from "three";
import { Easing } from "../../../core/tween";
import { quantizeParticleCount, spawnPuffs } from "../../effects/dust";
import {
  cutCamera,
  eatFood,
  mouthPosition,
  pickFrontLeg,
  revealShot,
  scaledDuration,
  worldPositionOf
} from "./support";
import type { BehaviorContext } from "./types";

const WET_SAND = new THREE.Color("#cbb387");
const DUST_COLOR = new THREE.Color("#e8d5a8");

function buildDecal(rng: () => number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(0.55, 20);
  geo.rotateX(-Math.PI / 2);
  const colors = new Float32Array(geo.getAttribute("position").count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    const j = 0.9 + rng() * 0.2;
    colors[i] = WET_SAND.r * j;
    colors[i + 1] = WET_SAND.g * j;
    colors[i + 2] = WET_SAND.b * j;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "dig-sand-decal";
  return mesh;
}

export async function digSand(ctx: BehaviorContext): Promise<void> {
  const { elephant, rng, reducedMotion, foodObject, env, scene, quality } = ctx;
  const trunk = elephant.trunk;
  const sandPit = env.sandPit;
  const T = (s: number): number => scaledDuration(s, reducedMotion);

  const surfacePos = worldPositionOf(foodObject);
  const buriedPos = surfacePos.clone().add(new THREE.Vector3(0, -0.14, 0));

  // 既に砂に埋もれている状態を確立(盛り上げ済み、餌は非表示)。
  sandPit.setMoundLevel(1);
  foodObject.visible = false;
  foodObject.position.copy(buriedPos);
  foodObject.scale.setScalar(0.001);

  const decal = buildDecal(() => rng.next());
  decal.position.set(surfacePos.x, 0.03, surfacePos.z);
  decal.scale.setScalar(0.001);
  scene.add(decal);

  const puffs: ReturnType<typeof spawnPuffs>[] = [];
  function popPuff(): void {
    const count = quantizeParticleCount(7, quality);
    const puff = spawnPuffs(
      new THREE.Vector3(surfacePos.x, 0.12, surfacePos.z),
      { color: DUST_COLOR, count, spread: 0.35, size: 0.045, rise: 0.3, duration: T(0.7) },
      () => rng.next()
    );
    scene.add(puff.object);
    puffs.push(puff);
  }
  function advancePuffs(dt: number): void {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      if (!p) continue;
      if (!p.step(dt)) {
        p.dispose();
        puffs.splice(i, 1);
      }
    }
  }

  await cutCamera(ctx, "behavior:dig-sand");

  // --- 鼻で砂表面を2-3回払う ---
  const sweeps = rng.int(2, 3);
  const sweepBase = surfacePos.clone().add(new THREE.Vector3(0, 0.22, 0.05));
  for (let i = 0; i < sweeps; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    await ctx.runTimed(T(1.0), (u) => {
      const e = Math.sin(u * Math.PI);
      const target = sweepBase.clone().add(new THREE.Vector3(dir * e * 0.42, -e * 0.06, 0));
      trunk.setTarget(target, { curl: 0.12 + e * 0.1 });
    });
  }
  trunk.setCurl(0.05);

  // --- 前脚で1-2回掻く ---
  const paws = rng.int(1, 2);
  const paw = pickFrontLeg(ctx, elephant.legs);
  for (let i = 0; i < paws; i++) {
    popPuff();
    let prevU = 0;
    await ctx.runTimed(T(0.7), (u) => {
      advancePuffs((u - prevU) * T(0.7));
      prevU = u;
      const scratch = Math.sin(u * Math.PI * 3) * 0.34 * (1 - u * 0.2);
      if (paw) {
        paw.hip.rotation.x = scratch;
        paw.knee.rotation.x = -Math.max(0, scratch) * 0.6;
      }
      sandPit.setMoundLevel(THREE.MathUtils.lerp(1, 0.55, u * ((i + 1) / paws)));
      decal.scale.setScalar(THREE.MathUtils.lerp(0.15, 0.55, u));
      (decal.material as THREE.MeshStandardMaterial).opacity = 0.5 * u;
    });
  }

  // --- 砂が退く(段階的)+餌が徐々に見える(因果の瞬間: 現れる) ---
  foodObject.visible = true;
  const recedeDuration = T(2.4);
  let recedePrevU = 0;
  await ctx.runTimed(recedeDuration, (u) => {
    const e = Easing.easeInOutQuad(u);
    sandPit.setMoundLevel(THREE.MathUtils.lerp(0.55, 0, e));
    decal.scale.setScalar(THREE.MathUtils.lerp(0.55, 1, e));
    (decal.material as THREE.MeshStandardMaterial).opacity = 0.5 * (1 - e * 0.6);
    foodObject.position.lerpVectors(buriedPos, surfacePos, e);
    foodObject.scale.setScalar(THREE.MathUtils.lerp(0.4, 1, e));
    if (u > 0.55 && puffs.length === 0 && rng.next() < 0.4) popPuff();
    advancePuffs((u - recedePrevU) * recedeDuration);
    recedePrevU = u;
  });
  sandPit.setMoundLevel(0);

  // --- 鼻で拾い口へ ---
  await ctx.runTimed(T(0.7), (u) => {
    trunk.setTarget(surfacePos, { curl: 0.15 + u * 0.7 });
  });
  const mouth = mouthPosition(ctx);
  await ctx.runTimed(T(0.8), (u) => {
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(surfacePos.clone().lerp(mouth, e), { curl: 0.85 });
    foodObject.position.copy(trunk.getTipPosition());
  });
  await ctx.runTimed(T(0.6), (u) => {
    trunk.setCurl(0.8 + Math.sin(u * Math.PI * 4) * 0.08);
  });
  eatFood(ctx);
  trunk.relax();
  if (paw) {
    paw.hip.rotation.x = 0;
    paw.knee.rotation.x = 0;
  }

  for (const p of puffs) p.dispose();
  puffs.length = 0;
  decal.parent?.remove(decal);
  decal.geometry.dispose();
  (decal.material as THREE.Material).dispose();

  await revealShot(ctx, ctx.spotId);
}

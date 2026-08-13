// break-branch(高木): 鼻を高く伸ばす(後脚に体重移動、前脚が少し浮いてもよい)→枝を掴む→2-3回引いて
// しなる(bone曲げ)→バキッと折れる(枝メッシュが分離して落下)→地面で葉を食べる。因果の瞬間は「折れる」。
import * as THREE from "three";
import { Easing } from "../../../core/tween";
import { quantizeParticleCount, spawnPuffs } from "../../effects/dust";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paintVertexAO, roughenGeometry, standardMaterial } from "../../environment/proc";
import { disposeObject3D } from "../../environment/dispose";
import { cutCamera, eatFood, mouthPosition, revealShot, scaledDuration, worldPositionOf } from "./support";
import type { BehaviorContext } from "./types";

const BARK_COLOR = new THREE.Color("#6b5a42");
const LEAF_COLOR = new THREE.Color("#5aa860");

function buildDebrisBranch(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  group.name = "broken-branch-debris";

  const stickGeo = new THREE.CylinderGeometry(0.05, 0.1, 1.1, 8, 3);
  stickGeo.rotateZ(Math.PI / 2.3);
  roughenGeometry(stickGeo, 0.012, rng);
  paintVertexAO(stickGeo, BARK_COLOR, rng, { aoStrength: 0.22, hueJitter: 0.08 });
  const stick = new THREE.Mesh(stickGeo, standardMaterial({ color: 0xffffff, roughness: 0.95 }));
  stick.castShadow = true;

  const leafGeoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const leafGeo = new THREE.ConeGeometry(0.05, 0.15, 6);
    const t = i / 7;
    leafGeo.translate((t - 0.5) * 0.9, 0.05 + (i % 2) * 0.03, 0);
    leafGeo.rotateZ((i % 2 === 0 ? 1 : -1) * 0.9);
    paintVertexAO(leafGeo, LEAF_COLOR, rng, { aoStrength: 0.18, hueJitter: 0.12 });
    leafGeoms.push(leafGeo);
  }
  const mergedLeaves = mergeGeometries(leafGeoms, false) as THREE.BufferGeometry;
  leafGeoms.forEach((g) => g.dispose());
  const leaves = new THREE.Mesh(mergedLeaves, standardMaterial({ color: 0xffffff, roughness: 0.9 }));
  leaves.castShadow = true;

  group.add(stick, leaves);
  return group;
}

export async function breakBranch(ctx: BehaviorContext): Promise<void> {
  const { elephant, rng, reducedMotion, foodObject, env, scene, quality } = ctx;
  const trunk = elephant.trunk;
  const tree = env.tallTree;
  const T = (s: number): number => scaledDuration(s, reducedMotion);

  const frontLegs = elephant.legs.filter((l) => l.front);

  await cutCamera(ctx, "behavior:break-branch");

  // --- 鼻を高く伸ばす(後脚に体重移動、前脚がわずかに浮く) ---
  await ctx.runTimed(T(1.6), (u) => {
    const e = Easing.easeOutQuad(u);
    elephant.bodyPivot.rotation.x = -0.07 * e;
    for (const leg of frontLegs) leg.knee.rotation.x = -0.14 * e;
    const reachTarget = worldPositionOf(tree.branchTipBone).addScaledVector(new THREE.Vector3(0, -1, 0), 0.15 * (1 - e * 0.4));
    trunk.setTarget(reachTarget, { curl: 0.1 + e * 0.55 });
  });

  // --- 2-3回引いてしなる(引くたびに戻りが浅くなり、緊張が蓄積する) ---
  const pulls = rng.int(2, 3);
  let bendState = 0;
  for (let p = 0; p < pulls; p++) {
    const startBend = bendState;
    const dipBend = startBend - (0.22 + p * 0.08);
    const restBend = startBend - (0.09 + p * 0.05);
    await ctx.runTimed(T(1.1), (u) => {
      elephant.bodyPivot.rotation.x = -0.07;
      for (const leg of frontLegs) leg.knee.rotation.x = -0.14;
      const bend =
        u < 0.5
          ? THREE.MathUtils.lerp(startBend, dipBend, Easing.easeOutQuad(u / 0.5))
          : THREE.MathUtils.lerp(dipBend, restBend, Easing.easeInOutQuad((u - 0.5) / 0.5));
      tree.branchTipBone.rotation.z = bend;
      const squeeze = 1 - Math.abs(u - 0.5) * 2; // 0..1..0、引きの山でcurlが強まる
      trunk.setTarget(worldPositionOf(tree.branchTipBone), { curl: 0.65 + squeeze * 0.25 });
    });
    bendState = restBend;
  }

  // --- 因果の瞬間: バキッと折れる ---
  const breakWorldPos = worldPositionOf(tree.branchTipBone);
  const debris = buildDebrisBranch(() => rng.next());
  debris.position.copy(breakWorldPos);
  debris.quaternion.copy(tree.branchTipBone.getWorldQuaternion(new THREE.Quaternion()));
  scene.add(debris);
  tree.branchMesh.visible = false;
  tree.branchLeaves.visible = false;
  tree.feeder.visible = false;

  foodObject.visible = true;
  const foodStart = worldPositionOf(foodObject);
  const landing = tree.trunkBase
    .clone()
    .add(new THREE.Vector3(rng.range(-0.6, 0.6), 0, rng.range(0.5, 1.1)));
  const debrisStart = debris.position.clone();
  const debrisSpin = rng.range(-2.4, 2.4);

  await ctx.runTimed(T(1.2), (u) => {
    const e = Easing.easeInQuad(u);
    debris.position.lerpVectors(debrisStart, new THREE.Vector3(landing.x, 0.06, landing.z), e);
    debris.rotation.x += debrisSpin * 0.016;
    foodObject.position.lerpVectors(foodStart, new THREE.Vector3(landing.x + 0.25, 0.06, landing.z + 0.15), e);
    trunk.setTarget(worldPositionOf(elephant.trunk.root).lerp(landing, 0.1), { curl: 0.2 * (1 - u) });
  });

  const puffCount = quantizeParticleCount(6, quality);
  const puff = spawnPuffs(new THREE.Vector3(landing.x, 0.05, landing.z), {
    color: LEAF_COLOR,
    count: puffCount,
    spread: 0.3,
    size: 0.05,
    rise: 0.22,
    duration: T(0.6)
  }, () => rng.next());
  scene.add(puff.object);
  let puffPrevU = 0;
  await ctx.runTimed(T(0.6), (u) => {
    puff.step((u - puffPrevU) * T(0.6));
    puffPrevU = u;
    elephant.bodyPivot.rotation.x = THREE.MathUtils.lerp(-0.07, 0, u);
    for (const leg of frontLegs) leg.knee.rotation.x = THREE.MathUtils.lerp(-0.14, 0, u);
  });
  puff.dispose();

  // --- 地面で葉を食べる ---
  const foodGround = foodObject.position.clone();
  await ctx.runTimed(T(0.7), (u) => {
    trunk.setTarget(foodGround, { curl: 0.2 + u * 0.65 });
  });
  const mouth = mouthPosition(ctx);
  await ctx.runTimed(T(0.8), (u) => {
    const e = Easing.easeInOutQuad(u);
    trunk.setTarget(foodGround.clone().lerp(mouth, e), { curl: 0.88 });
    foodObject.position.copy(trunk.getTipPosition());
  });
  await ctx.runTimed(T(0.6), (u) => {
    trunk.setCurl(0.82 + Math.sin(u * Math.PI * 4) * 0.08);
  });
  eatFood(ctx);
  disposeObject3D(debris);
  trunk.relax();
  elephant.bodyPivot.rotation.x = 0;
  for (const leg of frontLegs) leg.knee.rotation.x = 0;

  await revealShot(ctx, ctx.spotId);
}

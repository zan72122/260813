// 飼育員: ローポリだが人と分かる形(帽子+シャツ+ズボン、シンプルな顔)。idle/point/lookAt API。
import * as THREE from "three";
import { paintVertexAO, seededRandom, standardMaterial } from "./proc";

const SKIN_COLOR = new THREE.Color("#e0b088");
const SHIRT_COLOR = new THREE.Color("#7fae7a");
const PANTS_COLOR = new THREE.Color("#5a6b8a");
const HAT_COLOR = new THREE.Color("#e8d5a8");
const HAT_BAND = new THREE.Color("#7fae7a");

export interface Keeper {
  readonly group: THREE.Group;
  /** 毎フレーム呼ぶと僅かな重心の揺れ(呼吸)を再生。reducedMotion時はworld.tsが呼ばない想定。 */
  idle(dt: number): void;
  /** ワールド座標へ指差す。nullで自然な体側へ戻す。 */
  point(target: THREE.Vector3 | null): void;
  /** ワールド座標へ視線(頭)を向ける。nullで正面へ戻す。 */
  lookAt(target: THREE.Vector3 | null): void;
}

function part(geo: THREE.BufferGeometry, color: THREE.Color, rng: () => number): THREE.Mesh {
  paintVertexAO(geo, color, rng, { aoStrength: 0.22, hueJitter: 0.06 });
  const mesh = new THREE.Mesh(geo, standardMaterial({ color: 0xffffff, roughness: 0.9 }));
  mesh.castShadow = true;
  return mesh;
}

export function createKeeper(): Keeper {
  const rng = seededRandom(4141);
  const group = new THREE.Group();
  group.name = "keeper";

  const bodyPivot = new THREE.Group();
  bodyPivot.name = "keeper-body-pivot";
  bodyPivot.position.y = 0.85; // 腰の高さを基準に呼吸で上下させる
  group.add(bodyPivot);

  // 脚(ズボン)
  for (const lx of [-0.11, 0.11]) {
    const leg = part(new THREE.BoxGeometry(0.18, 0.85, 0.2), PANTS_COLOR, rng);
    leg.position.set(lx, -0.85 + 0.425, 0);
    group.add(leg);
  }

  // 胴体(シャツ)
  const torso = part(new THREE.BoxGeometry(0.5, 0.62, 0.3), SHIRT_COLOR, rng);
  torso.position.y = 0.31;
  bodyPivot.add(torso);

  // 腕(左は固定、右はpoint()で動かす)
  const armL = part(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 8), SKIN_COLOR, rng);
  armL.geometry.translate(0, -0.3, 0);
  const armPivotL = new THREE.Group();
  armPivotL.position.set(-0.32, 0.55, 0);
  armPivotL.rotation.z = 0.12;
  armPivotL.add(armL);
  bodyPivot.add(armPivotL);

  const armR = part(new THREE.CylinderGeometry(0.07, 0.06, 0.6, 8), SKIN_COLOR, rng);
  armR.geometry.translate(0, -0.3, 0);
  const armPivotR = new THREE.Group();
  armPivotR.name = "keeper-arm-pivot-r";
  armPivotR.position.set(0.32, 0.55, 0);
  armPivotR.rotation.z = -0.12;
  armPivotR.add(armR);
  bodyPivot.add(armPivotR);

  // 頭+顔
  const headPivot = new THREE.Group();
  headPivot.name = "keeper-head-pivot";
  headPivot.position.set(0, 0.7, 0);
  bodyPivot.add(headPivot);

  const head = part(new THREE.SphereGeometry(0.22, 14, 12), SKIN_COLOR, rng);
  headPivot.add(head);

  // 目(小さな暗色球2個。怖くならないよう控えめ)
  const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: "#4a3a2e", roughness: 0.6 });
  for (const ex of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 0.02, 0.205);
    headPivot.add(eye);
  }
  // 口元の微笑み(小さな弧を薄い箱で表現)
  const mouthGeo = new THREE.BoxGeometry(0.09, 0.018, 0.02);
  const mouthMat = new THREE.MeshStandardMaterial({ color: "#a8695a", roughness: 0.7 });
  const mouth = new THREE.Mesh(mouthGeo, mouthMat);
  mouth.position.set(0, -0.08, 0.215);
  headPivot.add(mouth);

  // 帽子(つばの広い麦わら帽風)
  const hatTop = part(new THREE.ConeGeometry(0.17, 0.16, 12), HAT_COLOR, rng);
  hatTop.position.y = 0.29;
  headPivot.add(hatTop);
  const brimGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16);
  paintVertexAO(brimGeo, HAT_COLOR, rng, { aoStrength: 0.15, hueJitter: 0.04 });
  const brim = new THREE.Mesh(brimGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  brim.position.y = 0.225;
  headPivot.add(brim);
  const bandGeo = new THREE.CylinderGeometry(0.175, 0.175, 0.035, 16, 1, true);
  paintVertexAO(bandGeo, HAT_BAND, rng, { aoStrength: 0.1, hueJitter: 0.04 });
  const band = new THREE.Mesh(bandGeo, standardMaterial({ color: 0xffffff, roughness: 0.85 }));
  band.position.y = 0.225;
  headPivot.add(band);

  let elapsed = 0;
  let pointT = 0;
  let targetPointT = 0;
  let targetLookYaw = 0;
  let targetLookPitch = 0;
  let curYaw = 0;
  let curPitch = 0;

  function idle(dt: number): void {
    elapsed += dt;
    bodyPivot.position.y = 0.85 + Math.sin(elapsed * 1.6) * 0.012;
    bodyPivot.rotation.y = Math.sin(elapsed * 0.7) * 0.02;
    // 指差し/視線のイージング
    pointT = THREE.MathUtils.damp(pointT, targetPointT, 6, dt);
    armPivotR.rotation.x = THREE.MathUtils.lerp(0, -1.3, pointT);
    armPivotR.rotation.z = THREE.MathUtils.lerp(-0.12, -0.25, pointT);
    curYaw = THREE.MathUtils.damp(curYaw, targetLookYaw, 8, dt);
    curPitch = THREE.MathUtils.damp(curPitch, targetLookPitch, 8, dt);
    headPivot.rotation.y = curYaw;
    headPivot.rotation.x = curPitch;
  }

  function point(target: THREE.Vector3 | null): void {
    if (!target) {
      targetPointT = 0;
      return;
    }
    targetPointT = 1;
    const local = group.worldToLocal(target.clone());
    const angle = Math.atan2(local.x - 0.32, -local.z);
    armPivotR.rotation.y = THREE.MathUtils.clamp(angle, -0.6, 0.6);
  }

  function lookAt(target: THREE.Vector3 | null): void {
    if (!target) {
      targetLookYaw = 0;
      targetLookPitch = 0;
      return;
    }
    const local = group.worldToLocal(target.clone());
    const headWorldY = 0.85 + 0.7;
    targetLookYaw = THREE.MathUtils.clamp(Math.atan2(local.x, -local.z), -0.9, 0.9);
    targetLookPitch = THREE.MathUtils.clamp(Math.atan2(local.y - headWorldY, Math.abs(local.z) + 0.001), -0.5, 0.5);
  }

  return { group, idle, point, lookAt };
}

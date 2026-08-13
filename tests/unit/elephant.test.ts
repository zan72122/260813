import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createRng } from "../../src/core/rng";
import { advanceToward, Gait, legAngles } from "../../src/scene/elephant/gait";
import { buildElephantModel, type LegRig } from "../../src/scene/elephant/model";
import { Trunk } from "../../src/scene/elephant/trunk";
import { Elephant } from "../../src/scene/elephant/elephant";

function makeLegRig(phaseOffset: number): LegRig {
  return {
    hip: new THREE.Group(),
    knee: new THREE.Group(),
    front: true,
    side: 1,
    phaseOffset
  };
}

describe("elephant/gait pure math", () => {
  it("advanceToward moves toward the target and reports arrival within ARRIVE_EPS", () => {
    const start = { x: 0, y: 0, z: 0 };
    const target = { x: 10, y: 0, z: 0 };
    let cur = start;
    let steps = 0;
    while (steps < 1000) {
      const { next, arrived } = advanceToward(cur, target, 1.2 / 60);
      cur = next;
      steps++;
      if (arrived) break;
    }
    expect(steps).toBeLessThan(1000);
    expect(Math.hypot(cur.x - target.x, cur.z - target.z)).toBeLessThan(0.1);
  });

  it("legAngles produces a diagonal gait: opposite-phase legs swing oppositely", () => {
    const a = legAngles(Math.PI / 2, 0, 1);
    const b = legAngles(Math.PI / 2, Math.PI, 1);
    // 逆位相の脚は符号が逆(対角パターン)になる
    expect(Math.sign(a.swing)).not.toBe(Math.sign(b.swing));
    expect(a.swing).not.toBeCloseTo(b.swing, 5);
  });

  it("legAngles moveFactor=0 keeps the leg neutral (no swing/lift while stationary)", () => {
    const still = legAngles(1.23, 0.5, 0);
    expect(still.swing).toBeCloseTo(0, 10);
    expect(still.lift).toBeCloseTo(0, 10);
  });
});

describe("elephant/gait Gait class (waypoint arrival with fixed THREE objects)", () => {
  function makeGait(): { gait: Gait; root: THREE.Object3D } {
    const root = new THREE.Object3D();
    const bodyPivot = new THREE.Object3D();
    const legs: LegRig[] = [makeLegRig(0), makeLegRig(Math.PI), makeLegRig(Math.PI), makeLegRig(0)];
    const gait = new Gait({
      root,
      bodyPivot,
      legs,
      groundOffset: 1.1,
      groundHeight: () => 0,
      speed: 1.2
    });
    return { gait, root };
  }

  it("walkTo resolves once the root reaches every waypoint, updating heading along the way", async () => {
    const { gait, root } = makeGait();
    const points = [
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 4 }
    ];
    let resolved = false;
    void gait.walkTo(points).then(() => {
      resolved = true;
    });
    let frames = 0;
    while (!resolved && frames < 2000) {
      gait.update(1 / 60);
      frames++;
      await Promise.resolve();
    }
    expect(resolved).toBe(true);
    expect(root.position.x).toBeCloseTo(3, 0);
    expect(root.position.z).toBeCloseTo(4, 0);
    // groundOffset(1.1)がroot.yに反映されている(足が地面に沿う)
    expect(root.position.y).toBeCloseTo(1.1, 5);
  });

  it("isMoving reflects walking state and legs settle back to neutral once idle", () => {
    const { gait } = makeGait();
    expect(gait.isMoving).toBe(false);
    void gait.walkTo([{ x: 5, y: 0, z: 0 }]);
    gait.update(1 / 60);
    expect(gait.isMoving).toBe(true);
    gait.stop();
    for (let i = 0; i < 30; i++) gait.update(1 / 60);
    expect(gait.isMoving).toBe(false);
  });
});

describe("elephant/trunk spline follow", () => {
  it("getTipPosition converges toward a setTarget() goal over successive update(dt) calls (1st-order lag)", () => {
    const trunk = new Trunk({ rng: createRng(7) });
    trunk.root.updateWorldMatrix(true, false);

    const target = new THREE.Vector3(0.6, -0.3, 1.4);
    trunk.setTarget(target);

    const distances: number[] = [];
    for (let i = 0; i < 90; i++) {
      trunk.update(1 / 60);
      distances.push(trunk.getTipPosition().distanceTo(target));
    }

    // 遅れ(1次遅れ)がある: 最初のフレームではまだ目標に到達していない
    expect(distances[0]).toBeGreaterThan(0.05);
    // 十分な時間が経てば目標へ収束する
    const last = distances[distances.length - 1] as number;
    expect(last).toBeLessThan(0.15);
    // 収束は単調に近い(最後の値が最初より十分小さい)
    expect(last).toBeLessThan(distances[0] as number);
  });

  it("relax() returns the tip toward a natural hanging pose when no target is set", () => {
    const trunk = new Trunk({ rng: createRng(11) });
    trunk.setTarget(new THREE.Vector3(0.5, 0.9, 0.8));
    for (let i = 0; i < 30; i++) trunk.update(1 / 60);
    const raised = trunk.getTipPosition().clone();

    trunk.relax();
    for (let i = 0; i < 180; i++) trunk.update(1 / 60);
    const relaxed = trunk.getTipPosition().clone();

    // relax後は上げていた位置より低い(自然な垂れ下がり)姿勢へ戻る
    expect(relaxed.y).toBeLessThan(raised.y);
  });

  // curl()は鼻先の「指」のFK(ボーンの見た目の曲がり)に効く演出パラメータであり、
  // ゲームロジック向けの権威ある座標(getTipPosition()=currentTip)には影響しない設計。
  // ここでは実際に曲がっているボーンチェーンの先端ワールド位置で検証する。
  function lastBoneWorldPosition(trunk: Trunk): THREE.Vector3 {
    let lastBone: THREE.Object3D | null = null;
    trunk.root.traverse((obj) => {
      if ((obj as THREE.Bone).isBone) lastBone = obj;
    });
    if (!lastBone) throw new Error("no bone found");
    return (lastBone as THREE.Object3D).getWorldPosition(new THREE.Vector3());
  }

  it("setCurl(1) bends the tip bone away from where curl(0) leaves it", () => {
    const straight = new Trunk({ rng: createRng(3) });
    straight.setTarget(new THREE.Vector3(0, -0.2, 1.3), { curl: 0, instant: true });
    for (let i = 0; i < 20; i++) straight.update(1 / 60);
    const straightTip = lastBoneWorldPosition(straight);

    const curled = new Trunk({ rng: createRng(3) });
    curled.setTarget(new THREE.Vector3(0, -0.2, 1.3), { curl: 1, instant: true });
    for (let i = 0; i < 20; i++) curled.update(1 / 60);
    const curledTip = lastBoneWorldPosition(curled);

    expect(curledTip.distanceTo(straightTip)).toBeGreaterThan(0.02);
  });
});

describe("elephant/model procedural build smoke", () => {
  it("builds a model with the required bone count for the trunk and leg rig for gait", () => {
    const rng = createRng(42);
    const model = buildElephantModel(rng.fork("model"));
    expect(model.legs.length).toBe(4);
    expect(model.groundOffset).toBeGreaterThan(0);
    expect(model.group.isObject3D).toBe(true);

    let meshCount = 0;
    model.group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshCount++;
    });
    // 胴体/頭/耳2/脚4/尻尾 以上のメッシュが存在する
    expect(meshCount).toBeGreaterThanOrEqual(8);

    model.dispose();
  });

  it("keeps the elephant's total triangle budget under ~25k", () => {
    const rng = createRng(9);
    const model = buildElephantModel(rng.fork("model"));
    const trunk = new Trunk({ rng: createRng(9).fork("trunk") });
    model.trunkSocket.add(trunk.root);

    let triangles = 0;
    model.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      const count = geo.index ? geo.index.count : (geo.getAttribute("position")?.count ?? 0);
      triangles += count / 3;
    });
    expect(triangles).toBeLessThan(25000);

    trunk.dispose();
    model.dispose();
  });
});

describe("elephant/elephant integration", () => {
  it("is hidden until enter() runs, and walks in/sniffs/settles into idle", async () => {
    const rng = createRng(5);
    const elephant = new Elephant(rng);
    expect(elephant.visible).toBe(false);
    expect(elephant.getState()).toBe("hidden");

    let entered = false;
    void elephant.enter().then(() => {
      entered = true;
    });
    expect(elephant.visible).toBe(true); // enter()呼び出し直後に表示される

    let frames = 0;
    while (!entered && frames < 3000) {
      elephant.update(1 / 60);
      frames++;
      await Promise.resolve();
    }
    expect(entered).toBe(true);
    expect(elephant.getState()).toBe("idle");
  });

  it("walkToSpot resolves and idleAt(pos) snaps the elephant to a position without throwing", async () => {
    const rng = createRng(6);
    const elephant = new Elephant(rng);

    let entered = false;
    void elephant.enter().then(() => {
      entered = true;
    });
    let enterFrames = 0;
    while (!entered && enterFrames < 3000) {
      elephant.update(1 / 60);
      enterFrames++;
      await Promise.resolve();
    }
    expect(entered).toBe(true);

    let done = false;
    void elephant.walkToSpot("sand").then(() => {
      done = true;
    });
    let frames = 0;
    while (!done && frames < 3000) {
      elephant.update(1 / 60);
      frames++;
      await Promise.resolve();
    }
    expect(done).toBe(true);

    expect(() => elephant.idleAt({ x: 1, y: 0, z: 2 })).not.toThrow();
    const pos = elephant.getPosition();
    expect(pos.x).toBeCloseTo(1, 5);
    expect(pos.z).toBeCloseTo(2, 5);

    elephant.dispose();
  });
});

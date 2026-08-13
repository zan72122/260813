// 歩行: waypoint配列をroot motionで辿る(向き補間含む)。sineベースの4脚gait(対角パターン)、
// 体の上下動+ロール微量を加える。歩行速度~1.2単位/秒(ゆったり)。groundHeightに沿って足を接地させる。
import * as THREE from "three";
import type { LegRig } from "./model";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface GaitOptions {
  root: THREE.Object3D;
  bodyPivot: THREE.Object3D;
  legs: readonly LegRig[];
  groundOffset: number;
  groundHeight: (x: number, z: number) => number;
  speed?: number;
}

const DEFAULT_SPEED = 1.2;
const ARRIVE_EPS = 0.06;
const LEG_SWING_AMPLITUDE = 0.42;
const LEG_LIFT_AMPLITUDE = 0.16;
const BOB_AMPLITUDE = 0.035;
const ROLL_AMPLITUDE = 0.02;

interface WalkTask {
  points: THREE.Vector3[];
  index: number;
  resolve: () => void;
}

function angleLerp(from: number, to: number, t: number): number {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

/** 純計算部: 現在位置から目標へ最大stepだけ進んだ次の位置と、到達したかどうかを返す。
 * three.js非依存(Vec3Likeのみ)なのでNode/jsdom双方で軽量にテストできる。 */
export function advanceToward(
  current: Vec3Like,
  target: Vec3Like,
  maxStep: number
): { next: Vec3Like; arrived: boolean; distance: number } {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= ARRIVE_EPS) {
    return { next: { x: current.x, y: current.y, z: current.z }, arrived: true, distance };
  }
  const step = Math.min(distance, maxStep);
  const nx = current.x + (dx / distance) * step;
  const nz = current.z + (dz / distance) * step;
  return { next: { x: nx, y: current.y, z: nz }, arrived: false, distance };
}

/** 純計算部: 対角gaitの脚位相からswing/lift角を計算する。three.js非依存。 */
export function legAngles(phase: number, phaseOffset: number, moveFactor: number): { swing: number; lift: number } {
  const p = phase + phaseOffset;
  const swing = Math.sin(p) * LEG_SWING_AMPLITUDE * moveFactor;
  const lift = Math.max(0, Math.sin(p)) * LEG_LIFT_AMPLITUDE * moveFactor;
  return { swing, lift };
}

export class Gait {
  private readonly root: THREE.Object3D;
  private readonly bodyPivot: THREE.Object3D;
  private readonly legs: readonly LegRig[];
  private readonly groundOffset: number;
  private readonly groundHeightFn: (x: number, z: number) => number;
  private readonly speed: number;

  private task: WalkTask | null = null;
  private phase = 0;
  private elapsed = 0;
  private reducedMotion = false;
  private moving = false;

  constructor(opts: GaitOptions) {
    this.root = opts.root;
    this.bodyPivot = opts.bodyPivot;
    this.legs = opts.legs;
    this.groundOffset = opts.groundOffset;
    this.groundHeightFn = opts.groundHeight;
    this.speed = opts.speed ?? DEFAULT_SPEED;
  }

  get isMoving(): boolean {
    return this.moving;
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }

  /** アニメーションなしで即座に位置合わせ(登場前配置・テスト向け)。 */
  snapTo(pos: Vec3Like, headingRad?: number): void {
    this.root.position.set(pos.x, this.groundHeightFn(pos.x, pos.z) + this.groundOffset, pos.z);
    if (headingRad !== undefined) this.root.rotation.y = headingRad;
    this.settleLegsInstant();
  }

  /** waypointを順に辿る。全て到達したら解決するPromiseを返す。 */
  walkTo(points: Vec3Like[]): Promise<void> {
    const pts = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    if (pts.length === 0) return Promise.resolve();
    return new Promise((resolve) => {
      this.task = { points: pts, index: 0, resolve };
    });
  }

  /** 現在のwalkTo待ちを即座に打ち切って解決する。 */
  stop(): void {
    if (this.task) {
      const resolve = this.task.resolve;
      this.task = null;
      resolve();
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.task) {
      this.moving = true;
      this.stepTowardWaypoint(dt);
    } else {
      this.moving = false;
      this.settleLegs(dt);
    }
    this.applyBodyMotion();
  }

  private stepTowardWaypoint(dt: number): void {
    const task = this.task;
    if (!task) return;
    const target = task.points[task.index];
    if (!target) {
      this.task = null;
      task.resolve();
      return;
    }
    const current = this.root.position;
    const dx = target.x - current.x;
    const dz = target.z - current.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= ARRIVE_EPS) {
      task.index += 1;
      if (task.index >= task.points.length) {
        this.task = null;
        task.resolve();
      }
      return;
    }

    const desiredHeading = Math.atan2(dx, dz);
    const turnSpeed = this.reducedMotion ? 10 : 5.2;
    this.root.rotation.y = angleLerp(this.root.rotation.y, desiredHeading, 1 - Math.exp(-turnSpeed * dt));

    const maxStep = this.speed * dt;
    const step = Math.min(dist, maxStep);
    const heading = this.root.rotation.y;
    current.x += Math.sin(heading) * step;
    current.z += Math.cos(heading) * step;
    current.y = this.groundHeightFn(current.x, current.z) + this.groundOffset;

    const moveFactor = maxStep > 1e-6 ? THREE.MathUtils.clamp(step / maxStep, 0, 1) : 0;
    this.phase += dt * (this.speed * 2.4 + 0.001);
    this.animateLegs(moveFactor);
  }

  private animateLegs(moveFactor: number): void {
    for (const leg of this.legs) {
      const { swing, lift } = legAngles(this.phase, leg.phaseOffset, moveFactor);
      leg.hip.rotation.x = swing;
      leg.knee.rotation.x = -lift;
    }
  }

  private settleLegs(dt: number): void {
    const k = Math.min(1, dt * 6);
    for (const leg of this.legs) {
      leg.hip.rotation.x = THREE.MathUtils.lerp(leg.hip.rotation.x, 0, k);
      leg.knee.rotation.x = THREE.MathUtils.lerp(leg.knee.rotation.x, 0, k);
    }
  }

  private settleLegsInstant(): void {
    for (const leg of this.legs) {
      leg.hip.rotation.x = 0;
      leg.knee.rotation.x = 0;
    }
  }

  private applyBodyMotion(): void {
    if (this.reducedMotion) {
      this.bodyPivot.position.y = 0;
      this.bodyPivot.rotation.z = 0;
      return;
    }
    if (this.moving) {
      this.bodyPivot.position.y = Math.abs(Math.sin(this.phase)) * BOB_AMPLITUDE;
      this.bodyPivot.rotation.z = Math.sin(this.phase) * ROLL_AMPLITUDE;
    } else {
      this.bodyPivot.position.y = Math.sin(this.elapsed * 0.9) * BOB_AMPLITUDE * 0.25;
      this.bodyPivot.rotation.z = 0;
    }
  }
}

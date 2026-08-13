// カメラは「見せたいものが必ず画面に入る」ように、
// 位置ではなく〈注視点 + 方向 + 収めたい半径〉で指定する。
// こうすると iPhone 縦・iPad 横のどの比率でも構図が破綻しない。
import * as THREE from 'three';
import { clamp, easeInOutCubic, lerp, damp } from './util.js';

// maxRatio: 横幅を収めるためにどこまで後退してよいかの上限（縦画面対策）。
// 1.0 なら縦の収まりだけを守り、大きいほど横も律儀に収める。
export function pose(target, dir, rH, rV, fov = 50, maxRatio = 1.35) {
  return {
    target: new THREE.Vector3().fromArray(target),
    dir: new THREE.Vector3().fromArray(dir).normalize(),
    rH,
    rV,
    fov,
    maxRatio,
  };
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.cur = {
      target: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 0.4, 1).normalize(),
      rH: 20,
      rV: 14,
      fov: 50,
      maxRatio: 1.35,
    };
    this.from = null;
    this.to = null;
    this.t = 1;
    this.dur = 1;
    this.time = 0;
    // 指で少しだけ見回せる量（クライマックスのみ有効にする）
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.lookEnabled = false;
    this.sway = 1;
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._right = new THREE.Vector3();
  }

  jumpTo(p) {
    this.cur.target.copy(p.target);
    this.cur.dir.copy(p.dir);
    this.cur.rH = p.rH;
    this.cur.rV = p.rV;
    this.cur.fov = p.fov;
    this.cur.maxRatio = p.maxRatio ?? 1.35;
    this.from = null;
    this.to = null;
    this.t = 1;
  }

  moveTo(p, duration = 2.0) {
    this.from = {
      target: this.cur.target.clone(),
      dir: this.cur.dir.clone(),
      rH: this.cur.rH,
      rV: this.cur.rV,
      fov: this.cur.fov,
      maxRatio: this.cur.maxRatio,
    };
    this.to = p;
    this.dur = Math.max(0.0001, duration);
    this.t = 0;
  }

  get settled() {
    return this.t >= 1;
  }

  setLook(yaw, pitch) {
    this.targetYaw = clamp(yaw, -0.45, 0.45);
    this.targetPitch = clamp(pitch, -0.22, 0.30);
  }

  update(dt, aspect) {
    this.time += dt;

    if (this.to) {
      this.t = clamp(this.t + dt / this.dur, 0, 1);
      const e = easeInOutCubic(this.t);
      this.cur.target.lerpVectors(this.from.target, this.to.target, e);
      this.cur.dir.copy(this.from.dir).lerp(this.to.dir, e).normalize();
      this.cur.rH = lerp(this.from.rH, this.to.rH, e);
      this.cur.rV = lerp(this.from.rV, this.to.rV, e);
      this.cur.fov = lerp(this.from.fov, this.to.fov, e);
      this.cur.maxRatio = lerp(this.from.maxRatio, this.to.maxRatio ?? 1.35, e);
      if (this.t >= 1) this.to = null;
    }

    if (!this.lookEnabled) {
      this.targetYaw = 0;
      this.targetPitch = 0;
    }
    this.lookYaw = damp(this.lookYaw, this.targetYaw, 4, dt);
    this.lookPitch = damp(this.lookPitch, this.targetPitch, 4, dt);

    const cam = this.camera;
    if (cam.fov !== this.cur.fov) {
      cam.fov = this.cur.fov;
      cam.updateProjectionMatrix();
    }

    // 収めたい範囲から距離を逆算する。横が入りきらない縦画面では自動的に下がる。
    const half = THREE.MathUtils.degToRad(this.cur.fov) / 2;
    const tanV = Math.tan(half);
    const dV = this.cur.rV / tanV;
    const dH = this.cur.rH / (tanV * Math.max(aspect, 0.0001));
    // 縦画面では横幅を完全に収めようとすると遠のきすぎるので、後退量に上限を置く。
    const dist = Math.max(dV, Math.min(dH, dV * this.cur.maxRatio)) * 1.06;

    // 生き物のような微かな揺れ。止まっていても画面が死なない。
    const s = this.sway;
    const bob = Math.sin(this.time * 0.47) * 0.09 * s;
    const drift = Math.sin(this.time * 0.31 + 1.7) * 0.14 * s;

    const dir = this._v.copy(this.cur.dir);
    if (this.lookYaw || this.lookPitch) {
      dir.applyAxisAngle(this._up, this.lookYaw);
      this._right.crossVectors(dir, this._up).normalize();
      dir.applyAxisAngle(this._right, -this.lookPitch);
    }
    dir.normalize();

    cam.position.copy(this.cur.target).addScaledVector(dir, dist);
    cam.position.y += bob;
    cam.position.x += drift;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.cur.target);
  }
}

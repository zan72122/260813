import * as THREE from 'three';
import { Ease, clamp01 } from './util.js';

const VFOV = 42;

/**
 * Scripted camera chain. There is no free camera: every module asks for a
 * framed "shot" (a point to look at, a direction to look from, and the size of
 * the box that must stay on screen) and the rig works out the distance for the
 * current aspect ratio. That is what makes portrait and landscape both work
 * without a single hand-tuned number per orientation.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.camera.fov = VFOV;
    this.aspect = 1;
    this.from = null;
    this.to = null;
    this.t = 1;
    this.dur = 1;
    this.ease = Ease.inOut;
    this.shakePower = 0;
    this.time = 0;
    this._look = new THREE.Vector3();
    this._dir = new THREE.Vector3(0, 0, 1);
    this._pos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  static shot({ look, dir, fitW, fitH, tilt = 0 }) {
    return {
      look: new THREE.Vector3().fromArray(look),
      dir: new THREE.Vector3().fromArray(dir).normalize(),
      fitW,
      fitH,
      tilt,
    };
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  cut(shot) {
    this.from = shot;
    this.to = shot;
    this.t = 1;
    this._look.copy(shot.look);
    this._dir.copy(shot.dir);
    this._fitW = shot.fitW;
    this._fitH = shot.fitH;
    this._tilt = shot.tilt || 0;
  }

  /** Move to a new shot over `dur` seconds. */
  move(shot, dur = 1.4, ease = Ease.inOut) {
    if (!this.to) return this.cut(shot);
    this.from = {
      look: this._look.clone(),
      dir: this._dir.clone(),
      fitW: this._fitW,
      fitH: this._fitH,
      tilt: this._tilt || 0,
    };
    this.to = shot;
    this.t = 0;
    this.dur = Math.max(0.0001, dur);
    this.ease = ease;
  }

  shake(power = 0.06) {
    this.shakePower = Math.max(this.shakePower, power);
  }

  get moving() {
    return this.t < 1;
  }

  distanceFor(fitW, fitH) {
    const half = Math.tan((VFOV * Math.PI) / 360);
    const dV = fitH / 2 / half;
    const dH = fitW / 2 / (half * this.aspect);
    return Math.max(dV, dH) * 1.04;
  }

  update(dt) {
    this.time += dt;
    if (!this.to) return;
    this.t = clamp01(this.t + dt / this.dur);
    const k = this.ease(this.t);
    const a = this.from || this.to;
    const b = this.to;
    this._look.lerpVectors(a.look, b.look, k);
    this._dir.lerpVectors(a.dir, b.dir, k).normalize();
    this._fitW = a.fitW + (b.fitW - a.fitW) * k;
    this._fitH = a.fitH + (b.fitH - a.fitH) * k;
    this._tilt = (a.tilt || 0) + ((b.tilt || 0) - (a.tilt || 0)) * k;

    const dist = this.distanceFor(this._fitW, this._fitH);
    this._pos.copy(this._dir).multiplyScalar(dist).add(this._look);

    // Very small idle drift keeps the picture alive without any wobble that
    // would make a small child feel seasick.
    const drift = Math.min(0.02 * dist, 0.05);
    this._pos.x += Math.sin(this.time * 0.5) * drift;
    this._pos.y += Math.sin(this.time * 0.37 + 1.1) * drift * 0.6;

    if (this.shakePower > 0.0005) {
      this._pos.x += (Math.random() - 0.5) * this.shakePower;
      this._pos.y += (Math.random() - 0.5) * this.shakePower;
      this.shakePower *= Math.exp(-8 * dt);
    }

    this.camera.position.copy(this._pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this._look);
    if (this._tilt) this.camera.rotateZ(this._tilt);
    this.camera.updateMatrixWorld();
  }

  /** World point -> CSS pixel coordinates, for placing the finger hints. */
  project(v3, out, width, height) {
    this._tmp.copy(v3).project(this.camera);
    out.x = ((this._tmp.x + 1) / 2) * width;
    out.y = ((1 - this._tmp.y) / 2) * height;
    return out;
  }
}

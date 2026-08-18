import * as THREE from 'three';
import { CAM, REDUCED_MOTION, STYLE } from '../style';
import { sineInOut, clamp01 } from './ease';

export type ShotName = keyof typeof CAM.shots;

interface ShotDef {
  pos: number[];
  target: number[];
  portraitPos: number[];
  portraitTarget: number[];
}

/**
 * CameraRig — the game owns the camera, the player never does.
 * Shots are authored in STYLE_LOCK.camera.shots with separate portrait
 * framings (re-composition, not cropping). While a finger is down the rig
 * freezes (see hold()).
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private from = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private to = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private t = 1;
  private duration = 1;
  private held = false;
  private portrait = false;
  private currentShot: ShotName = 'establish';
  private time = 0;
  private curTarget = new THREE.Vector3();

  constructor() {
    this.camera = new THREE.PerspectiveCamera(CAM.fovLandscape, 1, CAM.near, CAM.far);
    this.jumpTo('establish');
  }

  get shot(): ShotName {
    return this.currentShot;
  }

  private shotVectors(name: ShotName): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const s = CAM.shots[name] as ShotDef;
    const pos = this.portrait ? s.portraitPos : s.pos;
    const target = this.portrait ? s.portraitTarget : s.target;
    return { pos: new THREE.Vector3().fromArray(pos), target: new THREE.Vector3().fromArray(target) };
  }

  jumpTo(name: ShotName): void {
    this.currentShot = name;
    const v = this.shotVectors(name);
    this.from.pos.copy(v.pos);
    this.from.target.copy(v.target);
    this.to.pos.copy(v.pos);
    this.to.target.copy(v.target);
    this.t = 1;
    this.apply(v.pos, v.target);
  }

  /** Glide to a shot. Duration in seconds; defaults to the locked transition. */
  moveTo(name: ShotName, duration = CAM.transitionDuration): void {
    this.currentShot = name;
    const v = this.shotVectors(name);
    this.from.pos.copy(this.camera.position);
    this.from.target.copy(this.curTarget);
    this.to.pos.copy(v.pos);
    this.to.target.copy(v.target);
    this.duration = REDUCED_MOTION
      ? STYLE.motionReduction.prefersReducedMotion.cameraTransitionDuration
      : duration;
    this.t = 0;
  }

  /** Freeze all camera motion while the player is touching hair. */
  hold(down: boolean): void {
    this.held = down;
  }

  setViewport(width: number, height: number): void {
    const portrait = height > width;
    const changed = portrait !== this.portrait;
    this.portrait = portrait;
    this.camera.aspect = width / height;
    this.camera.fov = portrait ? CAM.fovPortrait : CAM.fovLandscape;
    this.camera.updateProjectionMatrix();
    if (changed) {
      // Re-compose (not crop) for the new orientation, gliding gently.
      this.moveTo(this.currentShot, 0.9);
    }
  }

  tick(dt: number): void {
    this.time += dt;
    if (!this.held && this.t < 1) {
      this.t = clamp01(this.t + dt / this.duration);
    }
    const k = sineInOut(this.t);
    const pos = this.from.pos.clone().lerp(this.to.pos, k);
    const target = this.from.target.clone().lerp(this.to.target, k);

    // A slow breath keeps still shots alive without ever fighting the hand.
    const amp = REDUCED_MOTION
      ? STYLE.motionReduction.prefersReducedMotion.breathAmplitude
      : CAM.breathAmplitude;
    if (!this.held && this.t >= 1) {
      pos.y += Math.sin((this.time * Math.PI * 2) / CAM.breathPeriod) * amp;
      pos.x += Math.cos((this.time * Math.PI * 2) / (CAM.breathPeriod * 1.7)) * amp * 0.6;
    }
    this.apply(pos, target);
  }

  private apply(pos: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.position.copy(pos);
    this.curTarget.copy(target);
    this.camera.lookAt(target);
  }
}

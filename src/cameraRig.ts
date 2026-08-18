import * as THREE from 'three';
import { dampV3, damp } from './util';

export interface CamShot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov?: number;
}

/**
 * カメラリグ — 自由カメラなし。ゲーム側がショットを指定し、
 * 因果が見えている間はカットせず滑らかに移動する。
 * 縦画面では自動で引き気味 + FOV広めに補正する。
 */
export class CameraRig {
  private cam: THREE.PerspectiveCamera;
  private targetPos = new THREE.Vector3(0, 1.6, 3.2);
  private targetLook = new THREE.Vector3(0, 0.3, 0);
  private curLook = new THREE.Vector3(0, 0.3, 0);
  private targetFov = 42;
  speed = 3.2;
  /** 縦画面時に注視点から遠ざける倍率 */
  portraitPull = 1.35;

  constructor(cam: THREE.PerspectiveCamera) {
    this.cam = cam;
  }

  cut(shot: CamShot) {
    this.setShot(shot);
    this.cam.position.copy(this.effectivePos());
    this.curLook.copy(this.targetLook);
    this.cam.fov = this.effectiveFov();
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(this.curLook);
  }

  setShot(shot: CamShot) {
    this.targetPos.copy(shot.pos);
    this.targetLook.copy(shot.look);
    this.targetFov = shot.fov ?? 42;
  }

  /** 注視点だけずらす(追従用) */
  nudgeLook(look: THREE.Vector3) {
    this.targetLook.copy(look);
  }
  nudgePos(pos: THREE.Vector3) {
    this.targetPos.copy(pos);
  }
  getTargetPos() { return this.targetPos.clone(); }
  getTargetLook() { return this.targetLook.clone(); }

  private effectivePos(): THREE.Vector3 {
    const portrait = window.innerHeight > window.innerWidth;
    if (!portrait) return this.targetPos.clone();
    // 縦画面: look から pos 方向へ引く + 少し高く
    const dir = this.targetPos.clone().sub(this.targetLook);
    return this.targetLook.clone().addScaledVector(dir, this.portraitPull).add(new THREE.Vector3(0, 0.12, 0));
  }

  private effectiveFov(): number {
    const portrait = window.innerHeight > window.innerWidth;
    return this.targetFov + (portrait ? 8 : 0);
  }

  update(dt: number) {
    const p = this.effectivePos();
    dampV3(this.cam.position, p, this.speed, dt);
    dampV3(this.curLook, this.targetLook, this.speed + 1, dt);
    this.cam.fov = damp(this.cam.fov, this.effectiveFov(), 3, dt);
    this.cam.updateProjectionMatrix();
    this.cam.lookAt(this.curLook);
  }
}

import * as THREE from 'three';
import { Easing, TweenManager, type ActiveTweenHandle } from './tween.ts';

export type ShotName = 'overview' | 'cleanup' | 'transform' | 'mat' | 'napReveal';
export type Orientation = 'portrait' | 'landscape';

interface ShotPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

type ShotTable = Record<ShotName, Record<Orientation, ShotPreset>>;

function shot(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov: number): ShotPreset {
  return { position: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz), fov };
}

const SHOTS: ShotTable = {
  overview: {
    portrait: shot(0, 3.3, 4.35, 0, 0.55, -0.1, 46),
    landscape: shot(0, 2.85, 3.55, 0, 0.6, -0.1, 40),
  },
  cleanup: {
    portrait: shot(0.05, 3.35, 2.7, 0.05, 0.15, -0.15, 56),
    landscape: shot(0.05, 2.55, 2.9, 0.05, 0.15, -0.2, 44),
  },
  transform: {
    portrait: shot(-0.08, 3.6, 3.5, -0.08, 0.4, -0.55, 58),
    landscape: shot(-0.08, 3.0, 3.15, -0.08, 0.4, -0.55, 42),
  },
  mat: {
    portrait: shot(0, 2.05, 2.7, 0, 0.2, -0.55, 58),
    landscape: shot(0, 1.7, 2.95, 0, 0.22, -0.55, 44),
  },
  napReveal: {
    portrait: shot(0, 2.55, 3.65, 0, 0.7, -0.2, 40),
    landscape: shot(0, 2.35, 3.2, 0, 0.72, -0.2, 36),
  },
};

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  private tweens: TweenManager;
  private orientation: Orientation = 'portrait';
  private currentShot: ShotName = 'overview';
  private locked = false;
  private target = new THREE.Vector3(0, 0.55, -0.1);
  private pendingTarget = new THREE.Vector3();
  private activeTween: ActiveTweenHandle | null = null;

  constructor(aspect: number, tweens: TweenManager) {
    this.camera = new THREE.PerspectiveCamera(34, aspect, 0.1, 30);
    this.tweens = tweens;
    this.snapTo('overview');
  }

  get shot(): ShotName {
    return this.currentShot;
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked && this.activeTween) {
      // Interaction spec: camera is locked during any drag/trace — moves only
      // between interactions. A shot transition that was still animating when
      // the drag started must freeze in place immediately, not keep tweening.
      this.tweens.cancel(this.activeTween);
      this.activeTween = null;
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  setOrientation(orientation: Orientation, aspect: number): void {
    this.orientation = orientation;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // Re-apply the current shot for the new orientation instantly (resize should not animate).
    this.snapTo(this.currentShot);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private presetFor(name: ShotName): ShotPreset {
    return SHOTS[name][this.orientation];
  }

  snapTo(name: ShotName): void {
    this.currentShot = name;
    const p = this.presetFor(name);
    this.camera.position.copy(p.position);
    this.camera.fov = p.fov;
    this.camera.updateProjectionMatrix();
    this.target.copy(p.target);
    this.camera.lookAt(this.target);
  }

  /** Tweens to a new named shot; ignored while locked (mid-drag) unless force=true. Never call during an active drag except with force for hard cuts you explicitly intend. */
  tweenTo(name: ShotName, durationSeconds: number, force = false): void {
    if (this.locked && !force) return;
    this.currentShot = name;
    const from = this.camera.position.clone();
    const fromTarget = this.target.clone();
    const fromFov = this.camera.fov;
    const p = this.presetFor(name);
    this.pendingTarget.copy(p.target);
    this.activeTween = this.tweens.add(
      durationSeconds,
      Easing.cubicInOut,
      (t) => {
        this.camera.position.lerpVectors(from, p.position, t);
        this.target.lerpVectors(fromTarget, this.pendingTarget, t);
        this.camera.fov = THREE.MathUtils.lerp(fromFov, p.fov, t);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(this.target);
      },
      () => {
        this.activeTween = null;
      },
    );
  }

  /** Small idle sway for TITLE / overview shots (disabled under reduced motion). */
  applyIdleSway(elapsedSeconds: number, reducedMotion: boolean): void {
    if (reducedMotion) return;
    if (this.currentShot !== 'overview' || this.locked) return;
    const p = this.presetFor('overview');
    const sway = Math.sin(elapsedSeconds * 0.25) * 0.05;
    this.camera.position.set(p.position.x + sway, p.position.y, p.position.z);
    this.camera.lookAt(this.target);
  }
}

import * as THREE from 'three';
import { Easing, TweenManager, type ActiveTweenHandle } from './tween.ts';

export type ShotName = 'overview' | 'cleanup' | 'transform' | 'mat' | 'napReveal';
export type Orientation = 'portrait' | 'landscape';
export type DeviceClass = 'phone' | 'tablet';

interface ShotPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

type OrientationTable = Record<Orientation, ShotPreset>;
type ShotTable = Record<ShotName, Record<DeviceClass, OrientationTable>>;

function shot(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov: number): ShotPreset {
  return { position: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz), fov };
}

/**
 * Fix-round-1 note (see docs/VERIFICATION.md "Fix round 1"): the original
 * portrait presets used a much wider vertical FOV (46-58°) than landscape
 * (36-44°) to compensate for portrait's narrow aspect starving horizontal
 * coverage. Since THREE.PerspectiveCamera's `fov` is the VERTICAL field of
 * view, inflating it to buy width also blew out the vertical frustum well
 * past the 1.85m-tall room — the camera (already elevated above the wall
 * top) ended up staring into the ceiling void at a grazing angle at the top
 * of frame (an unreadable cropped/foreshortened wall-top smear) while the
 * bottom of frame wasted space on empty near-camera floor. The fix keeps
 * portrait FOV close to landscape's own range (34-40°) and instead lowers
 * camera height / shallows the pitch so the vertical span reads
 * floor-to-just-above-the-window, accepting a narrower (but honest) width
 * crop — exactly like a portrait photo of a wide room really would.
 */
const SHOTS: ShotTable = {
  overview: {
    phone: {
      portrait: shot(0, 1.75, 4.6, 0, 0.58, -0.1, 27),
      landscape: shot(0, 2.85, 3.55, 0, 0.6, -0.1, 40),
    },
    tablet: {
      portrait: shot(0, 1.8, 4.5, 0, 0.6, -0.05, 25),
      landscape: shot(0, 2.7, 3.85, 0, 0.6, -0.1, 34),
    },
  },
  cleanup: {
    phone: {
      portrait: shot(0.05, 4.65, 4.7, 0.05, 1.0, -0.3, 34),
      landscape: shot(0.05, 2.55, 2.9, 0.05, 0.15, -0.2, 44),
    },
    tablet: {
      portrait: shot(0.05, 4.6, 4.6, 0.05, 0.8, -0.45, 30),
      landscape: shot(0.05, 2.4, 3.2, 0.05, 0.2, -0.2, 38),
    },
  },
  transform: {
    phone: {
      portrait: shot(0.02, 6.0, 4.7, 0.02, 0.8, -0.3, 30),
      landscape: shot(-0.08, 3.0, 3.15, -0.08, 0.4, -0.55, 42),
    },
    tablet: {
      portrait: shot(-0.08, 2.8, 4.6, -0.08, 0.75, -0.3, 29),
      landscape: shot(-0.08, 2.85, 3.5, -0.08, 0.45, -0.55, 36),
    },
  },
  mat: {
    phone: {
      portrait: shot(0, 4.3, 3.1, 0, 0.65, -0.48, 41),
      landscape: shot(0, 1.7, 2.95, 0, 0.22, -0.55, 44),
    },
    tablet: {
      portrait: shot(0, 1.85, 3.4, 0, 0.7, -0.28, 37),
      landscape: shot(0, 1.65, 3.2, 0, 0.24, -0.55, 38),
    },
  },
  napReveal: {
    phone: {
      portrait: shot(0, 3.95, 3.0, 0, 1.0, -0.18, 42),
      landscape: shot(0, 2.35, 3.2, 0, 0.72, -0.2, 36),
    },
    tablet: {
      portrait: shot(0, 1.4, 3.7, 0, 0.7, -0.68, 34),
      landscape: shot(0, 2.25, 3.5, 0, 0.72, -0.2, 32),
    },
  },
};

export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  private tweens: TweenManager;
  private orientation: Orientation = 'portrait';
  private deviceClass: DeviceClass = 'phone';
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

  setOrientation(orientation: Orientation, aspect: number, deviceClass: DeviceClass = this.deviceClass): void {
    this.orientation = orientation;
    this.deviceClass = deviceClass;
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
    return SHOTS[name][this.deviceClass][this.orientation];
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

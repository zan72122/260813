import * as THREE from 'three';
import { Layout } from './Layout';
import { clamp01, damp, easeInOutCubic, lerp, smootherstep } from './math';

export interface ShotState {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** roll in radians - used very sparingly */
  roll?: number;
}

/**
 * A shot describes where the camera wants to be, for a given screen shape and a
 * given time since the shot started. Shots can animate themselves (dollies,
 * crane-ups) which lets one shot run for many seconds without any cutting.
 */
export type Shot = (wide: number, life: number, big: number) => ShotState;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Author a shot from a portrait variant and a landscape variant. */
export function biShot(
  portrait: { pos: [number, number, number]; look: [number, number, number]; fov: number },
  landscape: { pos: [number, number, number]; look: [number, number, number]; fov: number },
  animate?: (s: ShotState, life: number, wide: number) => void,
): Shot {
  const pP = new THREE.Vector3(...portrait.pos);
  const pL = new THREE.Vector3(...landscape.pos);
  const lP = new THREE.Vector3(...portrait.look);
  const lL = new THREE.Vector3(...landscape.look);
  const out: ShotState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55 };
  return (wide, life, _big) => {
    out.pos.copy(pP).lerp(pL, wide);
    out.look.copy(lP).lerp(lL, wide);
    out.fov = lerp(portrait.fov, landscape.fov, wide);
    out.roll = 0;
    animate?.(out, life, wide);
    return out;
  };
}

/**
 * Blends between shots. There is never a hard cut: taking a new shot captures
 * the current camera state and eases towards the new (possibly moving) target.
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  private shot: Shot;
  private life = 0;
  private blend = 1;
  private blendDur = 1;
  private ease: (t: number) => number = easeInOutCubic;
  private from: ShotState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55, roll: 0 };
  private curPos = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private curFov = 55;
  private curRoll = 0;
  private smoothPos = new THREE.Vector3();
  private smoothLook = new THREE.Vector3();
  private started = false;
  /** gentle idle drift so held frames still feel alive */
  breathe = 1;
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private layout: Layout) {
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.12, 900);
    this.shot = biShot(
      { pos: [0, 6, 12], look: [0, 0, 0], fov: 55 },
      { pos: [0, 6, 12], look: [0, 0, 0], fov: 50 },
    );
  }

  /** Take a new shot, easing over `dur` seconds (0 = immediate). */
  cut(shot: Shot, dur = 0, ease: (t: number) => number = smootherstep.bind(null, 0, 1)) {
    if (!this.started || dur <= 0) {
      const s = shot(this.layout.wide, 0, this.layout.big);
      this.curPos.copy(s.pos); this.curLook.copy(s.look); this.curFov = s.fov;
      this.smoothPos.copy(s.pos); this.smoothLook.copy(s.look);
      this.blend = 1; this.blendDur = 1;
      this.started = true;
    } else {
      this.from.pos.copy(this.curPos);
      this.from.look.copy(this.curLook);
      this.from.fov = this.curFov;
      this.from.roll = this.curRoll;
      this.blend = 0;
      this.blendDur = dur;
    }
    this.shot = shot;
    this.life = 0;
    this.ease = ease;
  }

  /** Seconds elapsed inside the current shot. */
  get shotTime() { return this.life; }

  update(dt: number) {
    this.life += dt;
    const w = this.layout.wide;
    const s = this.shot(w, this.life, this.layout.big);

    if (this.blend < 1) {
      this.blend = clamp01(this.blend + dt / Math.max(0.001, this.blendDur));
      const r = this.ease(this.blend);
      this.curPos.copy(_a.copy(this.from.pos).lerp(s.pos, r));
      this.curLook.copy(_b.copy(this.from.look).lerp(s.look, r));
      this.curFov = lerp(this.from.fov, s.fov, r);
      this.curRoll = lerp(this.from.roll ?? 0, s.roll ?? 0, r);
    } else {
      this.curPos.copy(s.pos);
      this.curLook.copy(s.look);
      this.curFov = s.fov;
      this.curRoll = s.roll ?? 0;
    }

    // A whisper of drift. Slow and small: children get motion sick easily.
    const t = this.life;
    const br = this.breathe;
    const drift = 0.035 * br;
    this.curPos.x += Math.sin(t * 0.31) * drift;
    this.curPos.y += Math.sin(t * 0.24 + 1.7) * drift * 0.8;

    // Critically-damped follow removes any residual stepping from state changes.
    this.smoothPos.copy(damp3(this.smoothPos, this.curPos, 14, dt));
    this.smoothLook.copy(damp3(this.smoothLook, this.curLook, 12, dt));

    const cam = this.camera;
    cam.position.copy(this.smoothPos);
    cam.fov = this.curFov;
    cam.aspect = this.layout.aspect;
    this.up.set(Math.sin(this.curRoll), Math.cos(this.curRoll), 0);
    cam.up.copy(this.up);
    cam.lookAt(this.smoothLook);
    cam.updateProjectionMatrix();
  }

  /** Instantly settle the smoothing (used on resize / orientation change). */
  settle() {
    this.smoothPos.copy(this.curPos);
    this.smoothLook.copy(this.curLook);
  }
}

const _tmp = new THREE.Vector3();
function damp3(cur: THREE.Vector3, target: THREE.Vector3, lambda: number, dt: number) {
  _tmp.set(
    damp(cur.x, target.x, lambda, dt),
    damp(cur.y, target.y, lambda, dt),
    damp(cur.z, target.z, lambda, dt),
  );
  return _tmp;
}

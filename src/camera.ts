import * as THREE from 'three'
import { tweens, easeInOut, Ease } from './tween'

interface Shot {
  pos: [number, number, number]
  target: [number, number, number]
  fov: number
}

// Authored for a landscape-ish aspect (1.25). Portrait pulls the camera
// back along the same ray so the whole set stays in frame.
const SHOTS: Record<string, Shot> = {
  title: { pos: [3.0, 2.1, 3.8], target: [0, 0.5, 0], fov: 38 },
  dip: { pos: [-2.7, 2.7, 3.5], target: [-2.6, 0.25, 0.5], fov: 42 },
  top: { pos: [0, 4.9, 1.1], target: [0, 0.25, 0.05], fov: 42 },
  cream: { pos: [0, 1.9, 3.15], target: [0, 0.45, 0], fov: 40 },
  layers: { pos: [0.0, 0.72, 3.4], target: [0, 0.45, 0], fov: 36 },
  cocoa: { pos: [0, 2.85, 2.4], target: [0, 0.72, 0], fov: 40 },
  chill: { pos: [-0.4, 2.1, 4.3], target: [1.35, 0.6, -0.7], fov: 46 },
  cut: { pos: [0.95, 0.95, 3.15], target: [0.78, 0.42, 0.3], fov: 34 },
  reveal: { pos: [1.15, 1.15, 3.3], target: [0.82, 0.5, 0.35], fov: 38 },
  hero: { pos: [2.7, 2.05, 3.5], target: [0.35, 0.8, 0.2], fov: 40 },
}

export type ShotName = keyof typeof SHOTS

export class CameraRig {
  camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60)
  swayAmp = 0
  private cur = {
    pos: new THREE.Vector3(3, 2.1, 3.8),
    target: new THREE.Vector3(0, 0.5, 0),
    fov: 38,
  }
  private baseAspect = 1.25
  private time = 0
  private tmpDir = new THREE.Vector3()
  private tmpPos = new THREE.Vector3()
  private tmpTarget = new THREE.Vector3()

  shotName: ShotName = 'title'

  go(name: ShotName, dur = 1, ease: Ease = easeInOut): Promise<void> {
    this.shotName = name
    const s = SHOTS[name]
    const fp = this.cur.pos.clone()
    const ft = this.cur.target.clone()
    const ffov = this.cur.fov
    const tp = new THREE.Vector3(...s.pos)
    const tt = new THREE.Vector3(...s.target)
    if (dur <= 0.01) {
      this.cur.pos.copy(tp)
      this.cur.target.copy(tt)
      this.cur.fov = s.fov
      return Promise.resolve()
    }
    return tweens.to({
      dur,
      ease,
      update: (v) => {
        this.cur.pos.lerpVectors(fp, tp, v)
        this.cur.target.lerpVectors(ft, tt, v)
        this.cur.fov = ffov + (s.fov - ffov) * v
      },
    })
  }

  snap(name: ShotName) {
    void this.go(name, 0)
  }

  update(dt: number, aspect: number) {
    this.time += dt
    const mult = aspect < this.baseAspect ? Math.min(Math.pow(this.baseAspect / aspect, 0.85), 2.4) : 1
    this.tmpDir.subVectors(this.cur.pos, this.cur.target)
    this.tmpPos.copy(this.cur.target).addScaledVector(this.tmpDir, mult)
    if (this.swayAmp > 0) {
      this.tmpPos.x += Math.sin(this.time * 0.4) * this.swayAmp
      this.tmpPos.y += Math.sin(this.time * 0.27) * this.swayAmp * 0.4
    }
    this.camera.position.copy(this.tmpPos)
    this.tmpTarget.copy(this.cur.target)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.tmpTarget)
    if (this.camera.fov !== this.cur.fov || this.camera.aspect !== aspect) {
      this.camera.fov = this.cur.fov
      this.camera.aspect = aspect
      this.camera.updateProjectionMatrix()
    }
  }
}

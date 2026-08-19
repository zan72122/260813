import { CamSpec } from '../core/camera'
import { Vec3, clamp } from '../core/math'

export type Layout = {
  w: number
  h: number
  aspect: number
  portrait: boolean
  ui: number          // base UI unit in px
  safeTop: number
  safeBottom: number
  safeLeft: number
  safeRight: number
}

export function makeLayout(w: number, h: number, insets: { t: number; b: number; l: number; r: number }): Layout {
  const portrait = h >= w
  const ui = clamp(Math.min(w, h) * 0.062, 26, 74)
  return {
    w, h, aspect: w / h, portrait, ui,
    safeTop: insets.t, safeBottom: insets.b, safeLeft: insets.l, safeRight: insets.r
  }
}

export type FrameOpts = {
  center: Vec3
  halfW: number
  halfH: number
  dist: number
  yaw: number      // radians, 0 = straight on, + = camera moves right
  pitch: number    // radians, + = camera above
  screenY?: number // where the subject sits vertically, 0 top .. 1 bottom
  screenX?: number
  pad?: number
}

/**
 * Solves camera distance + FOV so the requested world box always fits, in any
 * aspect ratio. This is what makes portrait and landscape genuinely different
 * compositions rather than a stretched copy of one another.
 */
export function frame(o: FrameOpts, L: Layout): CamSpec {
  const pad = o.pad ?? 1.06
  const sy = o.screenY ?? 0.5
  const sx = o.screenX ?? 0.5
  const shrinkY = Math.max(0.28, 1 - 2 * Math.abs(sy - 0.5))
  const shrinkX = Math.max(0.28, 1 - 2 * Math.abs(sx - 0.5))
  let visHalfH = (o.halfH * pad) / shrinkY
  const needByWidth = (o.halfW * pad) / shrinkX / Math.max(0.3, L.aspect)
  visHalfH = Math.max(visHalfH, needByWidth)

  let fov = 2 * Math.atan(visHalfH / o.dist)
  const fovDeg = clamp((fov * 180) / Math.PI, 24, 58)
  fov = (fovDeg * Math.PI) / 180
  const dist = visHalfH / Math.tan(fov / 2)

  const cy = Math.cos(o.pitch), sy2 = Math.sin(o.pitch)
  const dir: Vec3 = {
    x: Math.sin(o.yaw) * cy,
    y: sy2,
    z: Math.cos(o.yaw) * cy
  }
  // shift the look-at point so the subject lands where we want on screen
  const offUp = (sy - 0.5) * 2 * visHalfH
  const offRight = -(sx - 0.5) * 2 * visHalfH * L.aspect
  // camera basis (approximate: yaw only affects right vector meaningfully)
  const right: Vec3 = { x: Math.cos(o.yaw), y: 0, z: -Math.sin(o.yaw) }
  const up: Vec3 = {
    x: -Math.sin(o.yaw) * sy2,
    y: cy,
    z: -Math.cos(o.yaw) * sy2
  }
  const target: Vec3 = {
    x: o.center.x + up.x * offUp + right.x * offRight,
    y: o.center.y + up.y * offUp + right.y * offRight,
    z: o.center.z + up.z * offUp + right.z * offRight
  }
  return {
    pos: { x: target.x + dir.x * dist, y: target.y + dir.y * dist, z: target.z + dir.z * dist },
    target,
    fov: fovDeg
  }
}

/* ---- world bounds of the workpiece (pivot included) ---- */
export const WORLD = {
  /** everything: handle bottom to rib tips */
  centerY: -0.13,
  halfH: 1.52,
  halfWClosed: 0.30,
  halfWOpen: 1.70,
  /** just the splitting zone */
  splitCenterY: 0.30,
  splitHalfH: 1.20
}

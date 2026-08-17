import * as THREE from 'three'
import { INNER_X, INNER_Z, CREAM_H, CUT_X, CUT_Z } from './metrics'
import { tweens, easeInOut, clamp } from './tween'

const HM_W = 192
const HM_H = 140
const TARGET = 140 // smoothed height value (0-255)

export interface CreamMetrics {
  coverage: number
  flatness: number
}

/**
 * One cream layer. The surface is a height-mapped plane: piping paints
 * bright blobs into a canvas (height + alpha + bump), the spatula strokes
 * it toward one mid value. A slab box under the plane grows with coverage
 * so the layer is visible from the side through the glass.
 */
export class CreamLayer {
  group = new THREE.Group()
  plane: THREE.Mesh
  slab: THREE.Mesh
  slabL: THREE.Mesh[] = []
  private hCanvas: HTMLCanvasElement
  private hCtx: CanvasRenderingContext2D
  private hTex: THREE.CanvasTexture
  private sampler: HTMLCanvasElement
  private planeMat: THREE.MeshStandardMaterial
  private voidUniform = { value: 0 }
  private dirty = false
  coverage = 0
  flatness = 0

  constructor(
    public baseY: number,
    surfaceMap: THREE.Texture | null,
    creamColor = 0xf8f2e3,
  ) {
    this.hCanvas = document.createElement('canvas')
    this.hCanvas.width = HM_W
    this.hCanvas.height = HM_H
    this.hCtx = this.hCanvas.getContext('2d', { willReadFrequently: false })!
    this.hCtx.fillStyle = '#000'
    this.hCtx.fillRect(0, 0, HM_W, HM_H)
    this.hTex = new THREE.CanvasTexture(this.hCanvas)
    this.sampler = document.createElement('canvas')
    this.sampler.width = 32
    this.sampler.height = 24

    const geo = new THREE.PlaneGeometry(INNER_X, INNER_Z, 88, 64)
    geo.rotateX(-Math.PI / 2)
    this.planeMat = new THREE.MeshStandardMaterial({
      color: surfaceMap ? 0xffffff : creamColor,
      map: surfaceMap ?? null,
      roughness: 0.38,
      metalness: 0,
      displacementMap: this.hTex,
      displacementScale: 0.26,
      displacementBias: 0.005,
      bumpMap: this.hTex,
      bumpScale: 0.9,
      alphaMap: this.hTex,
      alphaTest: 0.13,
    })
    const vu = this.voidUniform
    this.planeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uVoidOn = vu
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vLocal;\nuniform float uVoidOn;',
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
if (uVoidOn > 0.5 && vLocal.x > ${CUT_X.toFixed(3)} && vLocal.z > ${CUT_Z.toFixed(3)}) discard;`,
        )
    }
    this.planeMat.customProgramCacheKey = () => 'creamplane' + (surfaceMap ? 'M' : 'C')

    this.plane = new THREE.Mesh(geo, this.planeMat)
    this.plane.position.y = baseY
    this.plane.receiveShadow = true
    this.plane.visible = false
    this.group.add(this.plane)

    const slabMat = new THREE.MeshStandardMaterial({ color: creamColor, roughness: 0.42 })
    const slabGeo = new THREE.BoxGeometry(INNER_X - 0.02, CREAM_H, INNER_Z - 0.02)
    slabGeo.translate(0, CREAM_H / 2, 0)
    this.slab = new THREE.Mesh(slabGeo, slabMat)
    this.slab.position.y = baseY - CREAM_H
    this.slab.scale.y = 0.04
    this.slab.visible = false
    this.group.add(this.slab)

    // L-shaped replacement used once the slice is cut out of the corner.
    const halfX = INNER_X / 2 - 0.01
    const halfZ = INNER_Z / 2 - 0.01
    const g1 = new THREE.BoxGeometry(CUT_X + halfX, CREAM_H, halfZ * 2)
    g1.translate((CUT_X - halfX) / 2, CREAM_H / 2, 0)
    const g2 = new THREE.BoxGeometry(halfX - CUT_X, CREAM_H, halfZ + CUT_Z)
    g2.translate((halfX + CUT_X) / 2, CREAM_H / 2, (CUT_Z - halfZ) / 2)
    for (const g of [g1, g2]) {
      const m = new THREE.Mesh(g, slabMat)
      m.position.y = baseY - CREAM_H
      m.visible = false
      this.slabL.push(m)
      this.group.add(m)
    }
  }

  activate() {
    this.plane.visible = true
    this.slab.visible = true
  }

  private uv(px: number, pz: number): [number, number] {
    const u = clamp(px / INNER_X + 0.5, 0.035, 0.965)
    const v = clamp(0.5 - pz / INNER_Z, 0.04, 0.96)
    return [u * HM_W, v * HM_H]
  }

  /** Squeeze cream at world-local (x,z). */
  pipeAt(px: number, pz: number) {
    const [x, y] = this.uv(px, pz)
    const ctx = this.hCtx
    ctx.globalCompositeOperation = 'lighten'
    const r = 16
    const g = ctx.createRadialGradient(x, y, 1, x, y, r)
    g.addColorStop(0, 'rgb(225,225,225)')
    g.addColorStop(0.55, 'rgb(160,160,160)')
    g.addColorStop(1, 'rgb(0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    this.dirty = true
  }

  /** Spatula stroke from previous to current point: converge to TARGET. */
  smoothStroke(px0: number, pz0: number, px1: number, pz1: number) {
    const [x0, y0] = this.uv(px0, pz0)
    const [x1, y1] = this.uv(px1, pz1)
    const ctx = this.hCtx
    ctx.strokeStyle = `rgba(${TARGET},${TARGET},${TARGET},0.32)`
    ctx.lineWidth = 42
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    this.dirty = true
  }

  /** Guaranteed finish: fade the whole map to the smoothed value. */
  finishFlatten(): Promise<void> {
    return tweens.to({
      dur: 0.7,
      ease: easeInOut,
      update: () => {
        const ctx = this.hCtx
        ctx.fillStyle = `rgba(${TARGET},${TARGET},${TARGET},0.16)`
        ctx.fillRect(0, 0, HM_W, HM_H)
        this.dirty = true
      },
    })
  }

  computeMetrics(): CreamMetrics {
    const sctx = this.sampler.getContext('2d', { willReadFrequently: true })!
    sctx.drawImage(this.hCanvas, 0, 0, 32, 24)
    const d = sctx.getImageData(2, 2, 28, 20).data
    let covered = 0
    let sum = 0
    const n = 28 * 20
    for (let i = 0; i < n; i++) {
      const v = d[i * 4]
      if (v > 45) covered++
      sum += v
    }
    const mean = sum / n
    let flat = 0
    for (let i = 0; i < n; i++) {
      if (Math.abs(d[i * 4] - mean) < 26) flat++
    }
    this.coverage = covered / n
    this.flatness = mean > 60 ? flat / n : 0
    return { coverage: this.coverage, flatness: this.flatness }
  }

  /** Grow the side slab with coverage. */
  updateSlab() {
    const s = clamp(this.coverage * 1.35, 0.04, 1)
    this.slab.scale.y += (s - this.slab.scale.y) * 0.12
  }

  setVoid(on: boolean) {
    this.voidUniform.value = on ? 1 : 0
    this.slab.visible = !on && this.slab.visible
    if (on) {
      for (const m of this.slabL) m.visible = true
      this.slab.visible = false
    }
  }

  flushTexture() {
    if (this.dirty) {
      this.hTex.needsUpdate = true
      this.dirty = false
    }
  }
}

/**
 * The visible top surface of the finished cream: an ivory canvas that the
 * cocoa phase gradually darkens. Used as the color map of the top plane.
 */
export class CocoaSurface {
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  private ctx: CanvasRenderingContext2D
  private sampler: HTMLCanvasElement
  private dirty = false
  coverage = 0

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 184
    this.ctx = this.canvas.getContext('2d')!
    this.ctx.fillStyle = '#f2ead6'
    this.ctx.fillRect(0, 0, 256, 184)
    // faint cream speckle
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 256
      const y = Math.random() * 184
      this.ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,250,0.25)' : 'rgba(210,196,160,0.2)'
      this.ctx.fillRect(x, y, 1.5, 1.5)
    }
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.sampler = document.createElement('canvas')
    this.sampler.width = 32
    this.sampler.height = 24
  }

  /** A pinch of cocoa lands at world-local (x,z). */
  dust(px: number, pz: number) {
    const u = clamp(px / INNER_X + 0.5, 0, 1) * 256
    const v = clamp(0.5 - pz / INNER_Z, 0, 1) * 184
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(88,58,34,0.2)'
    ctx.beginPath()
    ctx.arc(u, v, 12 + Math.random() * 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(66,42,24,0.5)'
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(u + (Math.random() - 0.5) * 30, v + (Math.random() - 0.5) * 30, 1.6, 1.6)
    }
    this.dirty = true
  }

  /** Final even dusting while the last particles fall. */
  finishDust(): Promise<void> {
    return tweens.to({
      dur: 0.6,
      update: () => {
        const ctx = this.ctx
        ctx.fillStyle = 'rgba(88,58,34,0.05)'
        ctx.fillRect(0, 0, 256, 184)
        ctx.fillStyle = 'rgba(66,42,24,0.4)'
        for (let i = 0; i < 24; i++) {
          ctx.fillRect(Math.random() * 256, Math.random() * 184, 1.6, 1.6)
        }
        this.dirty = true
      },
    })
  }

  computeCoverage(): number {
    const sctx = this.sampler.getContext('2d', { willReadFrequently: true })!
    sctx.drawImage(this.canvas, 0, 0, 32, 24)
    const d = sctx.getImageData(2, 2, 28, 20).data
    let dark = 0
    const n = 28 * 20
    for (let i = 0; i < n; i++) {
      if (d[i * 4] < 175) dark++
    }
    this.coverage = dark / n
    return this.coverage
  }

  flushTexture() {
    if (this.dirty) {
      this.texture.needsUpdate = true
      this.dirty = false
    }
  }
}

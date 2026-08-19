import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { CELL, GRID_N } from '../core/config'
import { Rect, Terrain, rectValid } from '../game/terrain'
import { clamp } from '../core/util'

const W = GRID_N + 1

const DRY = [0.945, 0.845, 0.632]
const WET = [0.475, 0.362, 0.236]

/**
 * The sand surface. Positions/normals/colours are refreshed only inside the
 * dirty rectangle so dragging a shovel costs a few hundred vertices, not 9409.
 */
export class SandMesh {
  readonly mesh: Mesh
  private readonly geo: BufferGeometry
  private readonly pos: Float32Array
  private readonly nrm: Float32Array
  private readonly col: Float32Array
  private readonly wet: Float32Array

  constructor(private readonly terrain: Terrain) {
    const count = W * W
    this.pos = new Float32Array(count * 3)
    this.nrm = new Float32Array(count * 3)
    this.col = new Float32Array(count * 3)
    this.wet = new Float32Array(count)

    for (let j = 0; j < W; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i
        this.pos[k * 3] = terrain.wx(i)
        this.pos[k * 3 + 2] = terrain.wz(j)
        this.nrm[k * 3 + 1] = 1
      }
    }

    const idx = new Uint32Array(GRID_N * GRID_N * 6)
    let p = 0
    for (let j = 0; j < GRID_N; j++) {
      for (let i = 0; i < GRID_N; i++) {
        const a = j * W + i
        const b = a + 1
        const c = a + W
        const d = c + 1
        idx[p++] = a
        idx[p++] = c
        idx[p++] = b
        idx[p++] = b
        idx[p++] = c
        idx[p++] = d
      }
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new BufferAttribute(this.nrm, 3))
    geo.setAttribute('color', new BufferAttribute(this.col, 3))
    geo.setAttribute('aWet', new BufferAttribute(this.wet, 1))
    geo.setIndex(new BufferAttribute(idx, 1))
    geo.computeBoundingSphere()
    this.geo = geo

    const mat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: false,
    })
    // Wet sand is darker *and* shinier — the single strongest read of
    // "the water went here".
    mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
      shader.vertexShader =
        'attribute float aWet;\nvarying float vWet;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWet = aWet;')
      shader.fragmentShader =
        'varying float vWet;\n' +
        shader.fragmentShader.replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n roughnessFactor = mix(0.99, 0.24, clamp(vWet,0.0,1.0));',
        )
    }

    this.mesh = new Mesh(geo, mat)
    this.mesh.receiveShadow = true
    this.mesh.castShadow = false
    this.mesh.frustumCulled = false
    this.mesh.name = 'sand'

    terrain.markAllDirty()
    this.update()
  }

  /** Refresh the vertex data covered by the terrain's dirty rect. */
  update(extra?: Rect): void {
    const t = this.terrain
    let r = t.dirty
    if (extra && rectValid(extra)) {
      r = rectValid(r)
        ? {
            i0: Math.min(r.i0, extra.i0),
            j0: Math.min(r.j0, extra.j0),
            i1: Math.max(r.i1, extra.i1),
            j1: Math.max(r.j1, extra.j1),
          }
        : extra
    }
    if (!rectValid(r)) return

    const i0 = Math.max(0, r.i0 - 1)
    const j0 = Math.max(0, r.j0 - 1)
    const i1 = Math.min(W - 1, r.i1 + 1)
    const j1 = Math.min(W - 1, r.j1 + 1)

    const h = t.height
    const inv = 1 / (2 * CELL)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * W + i
        const hk = h[k]
        this.pos[k * 3 + 1] = hk

        // Analytic normal from neighbouring heights — far cheaper than
        // recomputing face normals every frame.
        const hl = i > 0 ? h[k - 1] : hk
        const hr = i < W - 1 ? h[k + 1] : hk
        const hu = j > 0 ? h[k - W] : hk
        const hd = j < W - 1 ? h[k + W] : hk
        let nx = (hl - hr) * inv
        let nz = (hu - hd) * inv
        const len = Math.hypot(nx, 1, nz) || 1
        this.nrm[k * 3] = nx / len
        this.nrm[k * 3 + 1] = 1 / len
        this.nrm[k * 3 + 2] = nz / len

        const wetv = clamp(t.wetness[k], 0, 1)
        this.wet[k] = wetv
        const speck = 0.93 + t.grainTint[k] * 0.13
        const packed = 0.96 + t.compaction[k] * 0.05
        const shade = speck * packed
        for (let c = 0; c < 3; c++) {
          this.col[k * 3 + c] = (DRY[c] * (1 - wetv) + WET[c] * wetv) * shade
        }
      }
    }

    const rows = j1 - j0 + 1
    const offset = j0 * W
    const cnt = rows * W
    updateRange(this.geo.getAttribute('position') as BufferAttribute, offset * 3, cnt * 3)
    updateRange(this.geo.getAttribute('normal') as BufferAttribute, offset * 3, cnt * 3)
    updateRange(this.geo.getAttribute('color') as BufferAttribute, offset * 3, cnt * 3)
    updateRange(this.geo.getAttribute('aWet') as BufferAttribute, offset, cnt)

    t.dirty = { i0: W, j0: W, i1: -1, j1: -1 }
  }

  dispose(): void {
    this.geo.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
  }
}

type RangedAttribute = BufferAttribute & {
  updateRanges?: Array<{ start: number; count: number }>
  updateRange?: { offset: number; count: number }
  addUpdateRange?: (start: number, count: number) => void
  clearUpdateRanges?: () => void
}

/** Partial buffer upload, tolerant of three.js r15x/r16x API differences. */
function updateRange(attr: BufferAttribute, start: number, count: number): void {
  const a = attr as RangedAttribute
  if (typeof a.addUpdateRange === 'function') {
    a.clearUpdateRanges?.()
    a.addUpdateRange(start, count)
  } else if (a.updateRange) {
    a.updateRange.offset = start
    a.updateRange.count = count
  }
  attr.needsUpdate = true
}

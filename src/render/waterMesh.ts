import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three'
import { CELL, GRID_NX, GRID_NZ, WATER_EPS } from '../core/config'
import { Rect, Terrain, rectValid } from '../game/terrain'
import { Water } from '../game/water'
import { clamp } from '../core/util'

const WX = GRID_NX + 1
const WZ = GRID_NZ + 1

const VERT = /* glsl */ `
attribute float aDepth;
attribute float aFoam;
varying float vDepth;
varying float vFoam;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vDepth = aDepth;
  vFoam = aFoam;
  vNormalW = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const FRAG = /* glsl */ `
precision highp float;
varying float vDepth;
varying float vFoam;
varying vec3 vNormalW;
varying vec3 vWorld;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSun;
uniform vec3 uCam;

void main() {
  float d = vDepth;
  if (d < 0.0008) discard;

  vec3 n = normalize(vNormalW);
  vec3 v = normalize(uCam - vWorld);

  float depthT = clamp(d / 0.055, 0.0, 1.0);
  vec3 base = mix(uShallow, uDeep, depthT);

  // Moving highlight bands read as "this water is going somewhere".
  float band = sin((vWorld.x + vWorld.z * 0.55) * 9.0 - uTime * 2.6) * 0.5 + 0.5;
  base += band * 0.06 * (1.0 - depthT);

  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  vec3 h = normalize(normalize(uSun) + v);
  float spec = pow(max(dot(n, h), 0.0), 90.0);

  vec3 col = base + fres * 0.30 + spec * 0.85;

  // White lip at the advancing edge.
  float foam = clamp(vFoam, 0.0, 1.0);
  col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.75);

  float alpha = clamp(smoothstep(0.0008, 0.010, d) * 0.90 + fres * 0.16 + foam * 0.35, 0.0, 0.97);
  gl_FragColor = vec4(col, alpha);
}
`

/** Thin translucent surface sitting just above the wet sand. */
export class WaterMesh {
  readonly mesh: Mesh
  private readonly geo: BufferGeometry
  private readonly pos: Float32Array
  private readonly nrm: Float32Array
  private readonly dep: Float32Array
  private readonly foam: Float32Array
  private readonly mat: ShaderMaterial
  private lastRect: Rect | null = null

  constructor(private readonly terrain: Terrain) {
    const count = WX * WZ
    this.pos = new Float32Array(count * 3)
    this.nrm = new Float32Array(count * 3)
    this.dep = new Float32Array(count)
    this.foam = new Float32Array(count)

    for (let j = 0; j < WZ; j++) {
      for (let i = 0; i < WX; i++) {
        const k = j * WX + i
        this.pos[k * 3] = terrain.wx(i)
        this.pos[k * 3 + 1] = -1
        this.pos[k * 3 + 2] = terrain.wz(j)
        this.nrm[k * 3 + 1] = 1
      }
    }

    const idx = new Uint32Array(GRID_NX * GRID_NZ * 6)
    let p = 0
    for (let j = 0; j < GRID_NZ; j++) {
      for (let i = 0; i < GRID_NX; i++) {
        const a = j * WX + i
        idx[p++] = a
        idx[p++] = a + WX
        idx[p++] = a + 1
        idx[p++] = a + 1
        idx[p++] = a + WX
        idx[p++] = a + WX + 1
      }
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('normal', new BufferAttribute(this.nrm, 3))
    geo.setAttribute('aDepth', new BufferAttribute(this.dep, 1))
    geo.setAttribute('aFoam', new BufferAttribute(this.foam, 1))
    geo.setIndex(new BufferAttribute(idx, 1))
    geo.computeBoundingSphere()
    this.geo = geo

    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new Color(0.44, 0.78, 0.88) },
        uDeep: { value: new Color(0.12, 0.42, 0.68) },
        uSun: { value: new Vector3(-0.45, 0.82, 0.36) },
        uCam: { value: new Vector3() },
      },
    })

    this.mesh = new Mesh(geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 4
    this.mesh.name = 'water'
  }

  setTime(t: number, camPos: Vector3): void {
    this.mat.uniforms.uTime.value = t
    ;(this.mat.uniforms.uCam.value as Vector3).copy(camPos)
  }

  update(water: Water): void {
    const rect = water.renderRect()
    // When the water vanishes we still need one final pass to clear the old area.
    const target = rectValid(rect) ? rect : this.lastRect
    if (!target || !rectValid(target)) {
      this.lastRect = null
      return
    }
    const i0 = Math.max(0, target.i0 - 1)
    const j0 = Math.max(0, target.j0 - 1)
    const i1 = Math.min(WX - 1, target.i1 + 1)
    const j1 = Math.min(WZ - 1, target.j1 + 1)

    const h = this.terrain.height
    const d = water.depth
    const inv = 1 / (2 * CELL)

    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * WX + i
        const dk = d[k]
        const surf = h[k] + Math.max(dk, 0)
        // Lift a hair above the sand so the two surfaces never z-fight.
        this.pos[k * 3 + 1] = surf + 0.0035
        this.dep[k] = dk

        if (dk > WATER_EPS) {
          const sl = h[k - 1] + (i > 0 ? d[k - 1] : 0)
          const sr = h[k + 1] + (i < WX - 1 ? d[k + 1] : 0)
          const su = h[k - WX] + (j > 0 ? d[k - WX] : 0)
          const sd = h[k + WX] + (j < WZ - 1 ? d[k + WX] : 0)
          let nx = (sl - sr) * inv
          let nz = (su - sd) * inv
          const len = Math.hypot(nx, 1, nz) || 1
          this.nrm[k * 3] = nx / len
          this.nrm[k * 3 + 1] = 1 / len
          this.nrm[k * 3 + 2] = nz / len

          const speed = Math.hypot(water.velX[k], water.velZ[k])
          const thin = 1 - clamp(dk / 0.02, 0, 1)
          this.foam[k] = clamp(speed * 34 * thin, 0, 1)
        } else {
          this.nrm[k * 3] = 0
          this.nrm[k * 3 + 1] = 1
          this.nrm[k * 3 + 2] = 0
          this.foam[k] = 0
        }
      }
    }

    const offset = j0 * WX
    const cnt = (j1 - j0 + 1) * WX
    setRange(this.geo.getAttribute('position') as BufferAttribute, offset * 3, cnt * 3)
    setRange(this.geo.getAttribute('normal') as BufferAttribute, offset * 3, cnt * 3)
    setRange(this.geo.getAttribute('aDepth') as BufferAttribute, offset, cnt)
    setRange(this.geo.getAttribute('aFoam') as BufferAttribute, offset, cnt)

    this.lastRect = rectValid(rect) ? { ...rect } : null
  }

  reset(): void {
    this.dep.fill(0)
    this.foam.fill(0)
    for (let k = 0; k < WX * WZ; k++) this.pos[k * 3 + 1] = -1
    ;(this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(this.geo.getAttribute('aDepth') as BufferAttribute).needsUpdate = true
    ;(this.geo.getAttribute('aFoam') as BufferAttribute).needsUpdate = true
    this.lastRect = null
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
  }
}

type RangedAttribute = BufferAttribute & {
  updateRanges?: Array<{ start: number; count: number }>
  updateRange?: { offset: number; count: number }
  addUpdateRange?: (start: number, count: number) => void
  clearUpdateRanges?: () => void
}

function setRange(attr: BufferAttribute, start: number, count: number): void {
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

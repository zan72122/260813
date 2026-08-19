import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Scene,
} from 'three'

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(-mv.z, 0.001);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = vAlpha * smoothstep(0.25, 0.02, r);
  gl_FragColor = vec4(vColor, a);
}
`

type Pool = {
  points: Points
  pos: Float32Array
  vel: Float32Array
  life: Float32Array
  maxLife: Float32Array
  size: Float32Array
  alpha: Float32Array
  color: Float32Array
  cursor: number
  count: number
  gravity: number
  drag: number
  geo: BufferGeometry
  mat: ShaderMaterial
}

/**
 * Two tiny pooled particle systems: dry sand grains kicked up by the shovel,
 * and water droplets at the pouring point. Both are hard-capped.
 */
export class Particles {
  private readonly sand: Pool
  private readonly drops: Pool
  private scale = 900

  constructor(scene: Scene, budget: number) {
    this.sand = makePool(scene, Math.round(budget * 0.55), 5.4, 2.6, false)
    this.drops = makePool(scene, Math.round(budget * 0.45), 6.2, 1.2, true)
  }

  setPixelScale(heightPx: number): void {
    this.scale = heightPx * 0.9
    this.sand.mat.uniforms.uScale.value = this.scale
    this.drops.mat.uniforms.uScale.value = this.scale
  }

  spawnSand(x: number, y: number, z: number, n: number, dirX = 0, dirZ = 0): void {
    const p = this.sand
    for (let i = 0; i < n; i++) {
      const k = p.cursor
      p.cursor = (p.cursor + 1) % p.count
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 0.11
      p.pos[k * 3] = x + Math.cos(a) * r
      p.pos[k * 3 + 1] = y + 0.02
      p.pos[k * 3 + 2] = z + Math.sin(a) * r
      p.vel[k * 3] = Math.cos(a) * 0.42 + dirX * 0.6 + (Math.random() - 0.5) * 0.2
      p.vel[k * 3 + 1] = 0.55 + Math.random() * 0.7
      p.vel[k * 3 + 2] = Math.sin(a) * 0.42 + dirZ * 0.6 + (Math.random() - 0.5) * 0.2
      const l = 0.34 + Math.random() * 0.24
      p.life[k] = l
      p.maxLife[k] = l
      p.size[k] = 2.6 + Math.random() * 3.0
      const tint = 0.86 + Math.random() * 0.14
      p.color[k * 3] = 0.95 * tint
      p.color[k * 3 + 1] = 0.85 * tint
      p.color[k * 3 + 2] = 0.63 * tint
    }
  }

  spawnDrop(x: number, y: number, z: number, n: number, vy = -1.4): void {
    const p = this.drops
    for (let i = 0; i < n; i++) {
      const k = p.cursor
      p.cursor = (p.cursor + 1) % p.count
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 0.09
      p.pos[k * 3] = x + Math.cos(a) * r
      p.pos[k * 3 + 1] = y
      p.pos[k * 3 + 2] = z + Math.sin(a) * r
      p.vel[k * 3] = Math.cos(a) * 0.3
      p.vel[k * 3 + 1] = vy
      p.vel[k * 3 + 2] = Math.sin(a) * 0.3
      const l = 0.3 + Math.random() * 0.25
      p.life[k] = l
      p.maxLife[k] = l
      p.size[k] = 3.0 + Math.random() * 3.4
      p.color[k * 3] = 0.72
      p.color[k * 3 + 1] = 0.92
      p.color[k * 3 + 2] = 1.0
    }
  }

  update(dt: number): void {
    step(this.sand, dt)
    step(this.drops, dt)
  }

  clear(): void {
    for (const p of [this.sand, this.drops]) {
      p.life.fill(0)
      p.alpha.fill(0)
      for (let i = 0; i < p.count; i++) p.pos[i * 3 + 1] = -999
      ;(p.geo.getAttribute('position') as BufferAttribute).needsUpdate = true
      ;(p.geo.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true
    }
  }

  dispose(): void {
    for (const p of [this.sand, this.drops]) {
      p.geo.dispose()
      p.mat.dispose()
    }
  }
}

function makePool(scene: Scene, count: number, gravity: number, drag: number, additive: boolean): Pool {
  const pos = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const alpha = new Float32Array(count)
  const color = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) pos[i * 3 + 1] = -999

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aSize', new BufferAttribute(size, 1))
  geo.setAttribute('aAlpha', new BufferAttribute(alpha, 1))
  geo.setAttribute('aColor', new BufferAttribute(color, 3))
  geo.boundingSphere = null

  const mat = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : undefined,
    uniforms: { uScale: { value: 900 }, uColor: { value: new Color(1, 1, 1) } },
  })

  const points = new Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 6
  scene.add(points)

  return {
    points,
    pos,
    vel: new Float32Array(count * 3),
    life: new Float32Array(count),
    maxLife: new Float32Array(count),
    size,
    alpha,
    color,
    cursor: 0,
    count,
    gravity,
    drag,
    geo,
    mat,
  }
}

function step(p: Pool, dt: number): void {
  let any = false
  const dragF = Math.max(0, 1 - p.drag * dt)
  for (let i = 0; i < p.count; i++) {
    if (p.life[i] <= 0) {
      if (p.alpha[i] !== 0) {
        p.alpha[i] = 0
        any = true
      }
      continue
    }
    any = true
    p.life[i] -= dt
    p.vel[i * 3] *= dragF
    p.vel[i * 3 + 2] *= dragF
    p.vel[i * 3 + 1] -= p.gravity * dt
    p.pos[i * 3] += p.vel[i * 3] * dt
    p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt
    p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt
    const t = Math.max(0, p.life[i] / p.maxLife[i])
    p.alpha[i] = t * t
    if (p.life[i] <= 0) {
      p.pos[i * 3 + 1] = -999
      p.alpha[i] = 0
    }
  }
  if (any) {
    ;(p.geo.getAttribute('position') as BufferAttribute).needsUpdate = true
    ;(p.geo.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true
    ;(p.geo.getAttribute('aSize') as BufferAttribute).needsUpdate = true
    ;(p.geo.getAttribute('aColor') as BufferAttribute).needsUpdate = true
  }
}

import * as THREE from 'three'
import { WORLD } from '../core/config'

const _v = new THREE.Vector3()

export interface GuideCell {
  p: THREE.Vector3
  r: number
  filled: number // 0..1, animated
  hit: boolean
}

const ghostVert = `
  attribute float aFill;
  varying float vFill;
  varying vec3 vNrm;
  varying vec3 vView;
  void main() {
    vFill = aFill;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vNrm = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`

const ghostFrag = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vFill;
  varying vec3 vNrm;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNrm);
    vec3 v = normalize(vView);
    float fres = pow(1.0 - abs(dot(n, v)), 2.1);
    float pulse = 0.62 + 0.38 * sin(uTime * 2.2 - vFill * 3.0);
    float a = (0.05 + fres * 0.42) * pulse * (1.0 - vFill) * uAlpha;
    vec3 col = mix(uColor, vec3(1.0, 0.99, 0.94), fres * 0.55);
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }`

/**
 * A guide is a chain of "checkpoint" bubbles along the path the child should
 * draw. Each one dissolves the moment sand reaches it, so the guide is also
 * the progress bar — and it disappears entirely once the shape is made.
 */
export class PathGuide {
  readonly group = new THREE.Group()
  readonly cells: GuideCell[] = []
  readonly curves: THREE.CatmullRomCurve3[] = []
  private mesh: THREE.InstancedMesh
  private aFill: THREE.InstancedBufferAttribute
  private mat: THREE.ShaderMaterial
  private uTime = { value: 0 }
  private flow: THREE.Points
  private flowMat: THREE.ShaderMaterial
  private flowCurve: number[] = []
  private extra: THREE.Object3D[] = []
  private fadeOut = 0

  /** `runs` is one or more polylines; every run gets checkpoints and motes. */
  constructor(runs: THREE.Vector3[][], radius: number, color: THREE.ColorRepresentation) {
    for (const pts of runs) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4)
      this.curves.push(curve)
      const n = Math.max(2, Math.round(curve.getLength() / (radius * 1.25)))
      for (let i = 0; i <= n; i++) {
        this.cells.push({ p: curve.getPointAt(i / n).clone(), r: radius, filled: 0, hit: false })
      }
    }

    const geo = new THREE.SphereGeometry(1, 12, 8)
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      fog: false,
      uniforms: {
        uTime: this.uTime,
        uColor: { value: new THREE.Color(color) },
        uAlpha: { value: 1 },
      },
      vertexShader: ghostVert,
      fragmentShader: ghostFrag,
    })
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.cells.length)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 8
    this.aFill = new THREE.InstancedBufferAttribute(new Float32Array(this.cells.length), 1)
    geo.setAttribute('aFill', this.aFill)
    const m = new THREE.Matrix4()
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]
      m.makeScale(c.r, c.r, c.r)
      m.setPosition(c.p)
      this.mesh.setMatrixAt(i, m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.group.add(this.mesh)

    // drifting sand motes that show which way to drag
    const perCurve = 22
    const fn = perCurve * this.curves.length
    const fp = new Float32Array(fn * 3)
    const ft = new Float32Array(fn)
    for (let i = 0; i < fn; i++) {
      ft[i] = (i % perCurve) / perCurve
      this.flowCurve.push(Math.floor(i / perCurve))
    }
    const fgeo = new THREE.BufferGeometry()
    fgeo.setAttribute('position', new THREE.BufferAttribute(fp, 3))
    fgeo.setAttribute('aT', new THREE.BufferAttribute(ft, 1))
    this.flowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uAlpha: { value: 1 } },
      vertexShader: `
        attribute float aT;
        uniform float uAlpha;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 7.0 * (16.0 / max(-mv.z, 0.5));
          gl_Position = projectionMatrix * mv;
          vA = uAlpha * (0.35 + 0.65 * sin(aT * 3.14159));
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = 1.0 - smoothstep(0.1, 0.5, length(c));
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.82), d * vA);
        }`,
    })
    this.flow = new THREE.Points(fgeo, this.flowMat)
    this.flow.frustumCulled = false
    this.flow.renderOrder = 9
    this.group.add(this.flow)
  }

  addExtra(o: THREE.Object3D) {
    this.extra.push(o)
    this.group.add(o)
  }

  /** 0..1 fraction of checkpoints reached. */
  get progress(): number {
    let n = 0
    for (const c of this.cells) if (c.hit) n++
    return n / this.cells.length
  }

  /**
   * Marks any checkpoint that now has sand in it. `leniency` grows the
   * catch radius the longer a stage runs, so a child who is enjoying
   * themselves off to one side still finishes the shape.
   */
  check(
    has: (x: number, y: number, z: number, r: number) => boolean,
    leniency = 1
  ): number {
    let fresh = 0
    for (const c of this.cells) {
      if (c.hit) continue
      if (has(c.p.x, c.p.y, c.p.z, c.r * 0.92 * leniency)) {
        c.hit = true
        fresh++
      }
    }
    return fresh
  }

  /** The first checkpoint still waiting — where the hint hand should point. */
  nextCell(): GuideCell | null {
    for (const c of this.cells) if (!c.hit) return c
    return null
  }

  beginFade() {
    this.fadeOut = 1
  }
  get faded(): boolean {
    return this.fadeOut > 0 && this.mat.uniforms.uAlpha.value <= 0.01
  }

  update(dt: number, t: number) {
    this.uTime.value = t
    let dirty = false
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]
      const target = c.hit ? 1 : 0
      if (Math.abs(c.filled - target) > 0.001) {
        c.filled += (target - c.filled) * Math.min(1, dt * 6)
        this.aFill.setX(i, c.filled)
        dirty = true
      }
    }
    if (dirty) this.aFill.needsUpdate = true

    if (this.fadeOut > 0) {
      const a = this.mat.uniforms.uAlpha.value as number
      const na = Math.max(0, a - dt * 1.6)
      this.mat.uniforms.uAlpha.value = na
      this.flowMat.uniforms.uAlpha.value = na
      for (const o of this.extra) {
        const mm = (o as THREE.Mesh).material as THREE.Material & { opacity: number }
        if (mm && 'opacity' in mm) mm.opacity = Math.max(0, mm.opacity - dt * 1.6)
      }
    }

    // motes crawl along their run toward the unfinished end
    const pos = this.flow.geometry.attributes.position as THREE.BufferAttribute
    const at = this.flow.geometry.attributes.aT as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const u = (at.getX(i) + dt * 0.22) % 1
      at.setX(i, u)
      const curve = this.curves[this.flowCurve[i]] ?? this.curves[0]
      curve.getPointAt(u, _v)
      pos.setXYZ(i, _v.x, _v.y + Math.sin(t * 2 + i) * 0.02, _v.z + Math.cos(t * 1.6 + i * 0.7) * 0.05)
    }
    pos.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mat.dispose()
    this.flow.geometry.dispose()
    this.flowMat.dispose()
    for (const o of this.extra) {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material
      if (mat) mat.dispose()
    }
  }
}

/** Soft glowing ellipse painted on the seabed under the foundation guide. */
export function makeFoundationDecal(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(1, 48)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv);
        float ring = smoothstep(0.72, 0.98, d) * smoothstep(1.0, 0.94, d);
        float inner = (1.0 - smoothstep(0.0, 1.0, d)) * 0.16;
        float pulse = 0.7 + 0.3 * sin(uTime * 2.0 - d * 5.0);
        float a = (ring * 0.62 + inner) * pulse * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.94, 0.72), a);
      }`,
  })
  const m = new THREE.Mesh(geo, mat)
  m.scale.set(WORLD.foundationRX + 0.35, 1, WORLD.foundationRZ + 0.45)
  m.position.y = WORLD.seabedY + 0.035
  m.renderOrder = 7
  m.userData.mat = mat
  return m
}

/** The arch outline that must stay hollow — it never fills in. */
export function makeGateOutline(gateHalf: number, wallTop: number, archTop: number): THREE.Mesh {
  const pts: THREE.Vector2[] = []
  const gh = gateHalf
  const top = wallTop
  const rise = archTop - top
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI
    pts.push(new THREE.Vector2(-Math.cos(a) * gh, top + Math.sin(a) * rise))
  }
  const shape = new THREE.Shape()
  shape.moveTo(-gh, WORLD.seabedY + 0.36)
  shape.lineTo(-gh, top)
  for (const p of pts) shape.lineTo(p.x, p.y)
  shape.lineTo(gh, WORLD.seabedY + 0.36)
  shape.closePath()

  const geo = new THREE.ShapeGeometry(shape)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9ff0ff,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const m = new THREE.Mesh(geo, mat)
  m.renderOrder = 6
  return m
}

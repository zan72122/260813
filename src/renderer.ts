import { FRAG, VERT } from './shaders'

export interface SceneUniforms {
  time: number
  squash: number
  plateCX: number
  plateCY: number
  plateHX: number
  plateHY: number
  centerX: number
  centerY: number
  lensR: number
  lensOn: number
  light: number
  reveal: number
  press: number
  contact: number
  k: number
  ghostR: number
  ghostHit: number
  ringR: number
  flash: number
}

const UNIFORM_NAMES = [
  'uRes',
  'uPx',
  'uTime',
  'uSquash',
  'uPlateC',
  'uPlateH',
  'uCenter',
  'uLensR',
  'uLensOn',
  'uLight',
  'uReveal',
  'uPress',
  'uContact',
  'uK',
  'uGhostR',
  'uGhostHit',
  'uRingR',
  'uFlash',
] as const

type UniformName = (typeof UNIFORM_NAMES)[number]

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)
  if (!sh) throw new Error('shader alloc failed')
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${log}`)
  }
  return sh
}

/**
 * 画面いっぱいの三角形を 1 枚だけ描くだけの、とても小さな WebGL ラッパ。
 * iOS Safari を第一に考えて WebGL1 のみを使う。
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext | null = null
  private program: WebGLProgram | null = null
  private loc = {} as Record<UniformName, WebGLUniformLocation | null>
  private buffer: WebGLBuffer | null = null
  private dprCap: number
  /** 描画できないとき (WebGL 非対応・コンテキストロスト) は true */
  failed = false

  width = 1
  height = 1
  px = 1

  constructor(canvas: HTMLCanvasElement, dprCap = 2) {
    this.canvas = canvas
    this.dprCap = dprCap
    try {
      this.init()
    } catch (err) {
      console.warn('[nijinowa] WebGL init failed', err)
      this.failed = true
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.failed = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.init()
        this.failed = false
        this.resize()
      } catch {
        this.failed = true
      }
    })
  }

  private init(): void {
    const opts: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
    }
    const gl = (this.canvas.getContext('webgl', opts) ||
      this.canvas.getContext('experimental-webgl', opts)) as WebGLRenderingContext | null
    if (!gl) throw new Error('no webgl context')
    this.gl = gl

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!prog) throw new Error('program alloc failed')
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`)
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    this.program = prog
    gl.useProgram(prog)

    for (const name of UNIFORM_NAMES) {
      this.loc[name] = gl.getUniformLocation(prog, name)
    }

    // 画面を覆う大きな三角形
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.buffer = buf
  }

  /** CSS ピクセルサイズに合わせてバックバッファを作り直す。 */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap)
    const cssW = this.canvas.clientWidth || window.innerWidth
    const cssH = this.canvas.clientHeight || window.innerHeight
    const w = Math.max(1, Math.round(cssW * dpr))
    const h = Math.max(1, Math.round(cssH * dpr))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    this.width = w
    this.height = h
    this.px = 0.5 * Math.min(w, h)
    this.gl?.viewport(0, 0, w, h)
  }

  draw(u: SceneUniforms): void {
    const gl = this.gl
    if (!gl || this.failed || !this.program) return
    const L = this.loc
    gl.useProgram(this.program)
    gl.uniform2f(L.uRes, this.width, this.height)
    gl.uniform1f(L.uPx, this.px)
    gl.uniform1f(L.uTime, u.time)
    gl.uniform1f(L.uSquash, u.squash)
    gl.uniform2f(L.uPlateC, u.plateCX, u.plateCY)
    gl.uniform2f(L.uPlateH, u.plateHX, u.plateHY)
    gl.uniform2f(L.uCenter, u.centerX, u.centerY)
    gl.uniform1f(L.uLensR, u.lensR)
    gl.uniform1f(L.uLensOn, u.lensOn)
    gl.uniform1f(L.uLight, u.light)
    gl.uniform1f(L.uReveal, u.reveal)
    gl.uniform1f(L.uPress, u.press)
    gl.uniform1f(L.uContact, u.contact)
    gl.uniform1f(L.uK, u.k)
    gl.uniform1f(L.uGhostR, u.ghostR)
    gl.uniform1f(L.uGhostHit, u.ghostHit)
    gl.uniform1f(L.uRingR, u.ringR)
    gl.uniform1f(L.uFlash, u.flash)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    const gl = this.gl
    if (!gl) return
    if (this.buffer) gl.deleteBuffer(this.buffer)
    if (this.program) gl.deleteProgram(this.program)
  }
}

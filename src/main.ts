import './style.css'
import { NoToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three'
import { Game } from './game/game'
import { CASTLE_X, SAND_X, SAND_Z, SOURCE_X, isFastE2E } from './core/config'
import { clamp, now } from './core/util'

const canvas = document.getElementById('gl') as HTMLCanvasElement
const uiRoot = document.getElementById('ui') as HTMLElement

const fast = isFastE2E()

function createRenderer(): WebGLRenderer | null {
  try {
    return new WebGLRenderer({
      canvas,
      antialias: !fast,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
  } catch {
    return null
  }
}

const maybeRenderer = createRenderer()
if (!maybeRenderer) {
  // Nothing here needs words a child has to read, but a grown-up looking at a
  // blank screen deserves to know why.
  uiRoot.innerHTML =
    '<div style="position:absolute;inset:0;display:grid;place-items:center;' +
    'padding:24px;text-align:center;color:#6b4a1e;font-weight:700;' +
    'background:#e6c48e;pointer-events:auto">' +
    'このブラウザでは WebGL がつかえないみたいです。<br>Safari の設定を確認してください。' +
    '</div>'
  throw new Error('WebGL is unavailable')
}
const renderer: WebGLRenderer = maybeRenderer
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = NoToneMapping
renderer.shadowMap.enabled = !fast
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setClearColor(0xbfe4f2, 1)

const game = new Game(renderer, uiRoot)
;(window as unknown as { __sandCfg: unknown }).__sandCfg = { SOURCE_X, CASTLE_X, SAND_X, SAND_Z }

// ---------------------------------------------------------------- viewport

let dpr = 1
// Start close to the device's real resolution and back off only if frames
// come in slow; ramping up from 1 would leave the first seconds looking soft.
let targetDpr = fast ? 1 : Math.min(window.devicePixelRatio || 1, 2)

function readSafeArea() {
  const cs = getComputedStyle(document.documentElement)
  const px = (v: string) => {
    const n = parseFloat(cs.getPropertyValue(v))
    return Number.isFinite(n) ? n : 0
  }
  return {
    top: px('--safe-t'),
    right: px('--safe-r'),
    bottom: px('--safe-b'),
    left: px('--safe-l'),
  }
}

function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport
  const w = Math.round(vv?.width ?? window.innerWidth)
  const h = Math.round(vv?.height ?? window.innerHeight)
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

function resize(): void {
  const { w, h } = viewportSize()
  const maxDpr = fast ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  targetDpr = Math.min(targetDpr || maxDpr, maxDpr)
  dpr = clamp(targetDpr, 0.7, maxDpr)
  renderer.setPixelRatio(dpr)
  renderer.setSize(w, h, false)
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  game.resize(w, h, readSafeArea())
}

window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => {
  // iOS reports the new size a beat after the event.
  resize()
  window.setTimeout(resize, 120)
  window.setTimeout(resize, 400)
})
window.visualViewport?.addEventListener('resize', resize)
resize()

// ---------------------------------------------------------------- input

function localPoint(e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}

canvas.addEventListener(
  'pointerdown',
  (e) => {
    e.preventDefault()
    canvas.setPointerCapture?.(e.pointerId)
    const p = localPoint(e)
    game.onPointerDown(e.pointerId, p.x, p.y)
  },
  { passive: false },
)
canvas.addEventListener(
  'pointermove',
  (e) => {
    e.preventDefault()
    const p = localPoint(e)
    game.onPointerMove(e.pointerId, p.x, p.y)
  },
  { passive: false },
)
const endPointer = (e: PointerEvent) => {
  e.preventDefault()
  game.onPointerUp(e.pointerId)
}
canvas.addEventListener('pointerup', endPointer, { passive: false })
canvas.addEventListener('pointercancel', endPointer, { passive: false })
window.addEventListener('blur', () => game.cancelPointer())

// Safari still fires these for pinch/double-tap zoom; the game never needs them.
for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false })
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false })
document.addEventListener('contextmenu', (e) => e.preventDefault())

// ---------------------------------------------------------------- loop

let running = true
let last = now()
let acc = 0
let frames = 0
let slowFrames = 0
let fastFrames = 0
let rafId = 0

function frame(): void {
  rafId = requestAnimationFrame(frame)
  if (!running) return

  const t = now()
  let dt = (t - last) / 1000
  last = t
  // A tab that was hidden, or a long GC pause, must not teleport the water.
  if (dt > 0.1) dt = 0.1
  if (dt <= 0) dt = 1 / 60

  game.update(dt)
  game.render()

  // Adaptive resolution: keep input latency low before keeping pixels sharp.
  frames++
  acc += dt
  const ms = dt * 1000
  if (ms > 22) slowFrames++
  else if (ms < 13) fastFrames++
  if (frames >= 30) {
    const maxDpr = fast ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    if (slowFrames > 12 && targetDpr > 0.72) {
      targetDpr = Math.max(0.7, targetDpr - 0.2)
      resize()
    } else if (fastFrames > 26 && targetDpr < maxDpr) {
      targetDpr = Math.min(maxDpr, targetDpr + 0.15)
      resize()
    }
    frames = 0
    slowFrames = 0
    fastFrames = 0
    acc = 0
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    running = false
    game.onHidden()
  } else {
    running = true
    last = now()
    game.onVisible()
    resize()
  }
})

window.addEventListener('pagehide', () => {
  running = false
  game.onHidden()
})
window.addEventListener('pageshow', () => {
  running = true
  last = now()
  game.onVisible()
})

renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()
  running = false
})
renderer.domElement.addEventListener('webglcontextrestored', () => {
  running = true
  last = now()
  resize()
})

rafId = requestAnimationFrame(frame)
game.ready()

// ---------------------------------------------------------------- test hook

type TestApi = {
  game: Game
  state: () => ReturnType<Game['debugState']>
  worldToScreen: (x: number, z: number) => { x: number; y: number }
  setPattern: (p: 'gentle' | 'sidepath' | 'ridge' | 'sandbox') => void
  advance: (seconds: number) => void
  stop: () => void
}

const api: TestApi = {
  game,
  state: () => game.debugState(),
  worldToScreen: (x, z) => game.worldToScreen(x, z),
  setPattern: (p) => game.startRound(p, 1),
  advance: (seconds) => {
    const step = 1 / 60
    for (let s = 0; s < seconds; s += step) game.update(step)
  },
  stop: () => {
    running = false
    cancelAnimationFrame(rafId)
  },
}
;(window as unknown as { __sand: TestApi }).__sand = api

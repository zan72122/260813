import * as THREE from 'three'
import { CameraRig } from './camera'
import { Input } from './input'
import { Game } from './game'
import { tweens } from './tween'

const params = new URLSearchParams(location.search)
const FAST = params.get('fast') === '1'

const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: !FAST,
  powerPreference: 'high-performance',
})
// fast mode (E2E) normalizes render cost: long edge capped near 720px
const fastRatio = Math.min(1, 720 / Math.max(window.innerWidth, window.innerHeight))
renderer.setPixelRatio(FAST ? fastRatio : Math.min(window.devicePixelRatio || 1, 2))
renderer.shadowMap.enabled = !FAST
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05

if (FAST) tweens.timescale = 2.6

const rig = new CameraRig()
const input = new Input(canvas)
const game = new Game(rig, input, FAST)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false)
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', () => setTimeout(resize, 60))
resize()

let last = performance.now()
renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min((now - last) / 1000, FAST ? 0.09 : 0.05) * (FAST ? 2.2 : 1)
  last = now
  tweens.update(dt)
  game.frame(dt)
  rig.update(dt, window.innerWidth / Math.max(1, window.innerHeight))
  if (game.world) renderer.render(game.world.scene, rig.camera)
})

void game.start()

// deterministic hooks for automated smoke tests
;(window as any).__tiramisu = {
  version: 1,
  fast: FAST,
  phase: () => game.phaseName,
  step: () => game.step,
  gesture: () => game.gestureFn?.() ?? null,
  game,
  rig,
}

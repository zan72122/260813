import * as THREE from 'three'
import { COLORS, SAND, SAND_COLORS, WORLD } from './core/config'
import { CameraRig, framing } from './core/cameraRig'
import { Input, projectToPlane } from './core/input'
import { settings } from './core/settings'
import { audio } from './core/audio'
import { rng } from './core/rng'
import { SandSystem } from './sand/sandSystem'
import { Emitter } from './sand/emitter'
import { Nozzle } from './sand/nozzle'
import { Environment } from './world/environment'
import { Bubbles } from './world/bubbles'
import { DryGrains } from './world/grains'
import { FishSchool } from './world/fish'
import { PathGuide, makeGateOutline } from './guide/guides'
import {
  GATE,
  GUIDED_ORDER,
  LAYOUT,
  STAGES,
  setVariant,
  type StageId,
} from './guide/stages'
import { Hud } from './ui/hud'

const _p = new THREE.Vector3()
const _p2 = new THREE.Vector3()
const _box = new THREE.Box3()
const _screen = new THREE.Vector3()

type Tool = 'sand' | 'vacuum'

export interface GameDebug {
  stage: StageId
  segments: number
  progress: number
  fps: number
  dpr: number
  tool: Tool
  color: number
}

export class Game {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly rig = new CameraRig()
  readonly sand: SandSystem
  readonly emitter: Emitter
  readonly hud: Hud
  private env: Environment
  private bubbles: Bubbles
  private grains: DryGrains
  private school: FishSchool
  private nozzle = new Nozzle()
  private input: Input

  private stage: StageId = 'title'
  private guide: PathGuide | null = null
  private oldGuides: PathGuide[] = []
  private stageTime = 0
  private stageDone = false
  private diveT = 0
  private crossed = false
  private finaleT = 0
  private finaleStep = 0
  private variant = 0

  private tool: Tool = 'sand'
  private unlocked = [0]
  private strokeStack: number[] = []

  private tip = new THREE.Vector3()
  private tipSmooth = new THREE.Vector3()
  private tipOffsetWorld = 0.55
  private pressing = false
  private idleSince = 0
  private hasPointer = false

  private clock = new THREE.Clock()
  private time = 0
  private frameMs = 16
  private slowFrames = 0
  private fastFrames = 0
  private dpr = 1
  private dprCap = 2
  private quality: 'high' | 'low'
  private hemi: THREE.HemisphereLight
  private dir: THREE.DirectionalLight
  private fog: THREE.FogExp2
  private gateGlow: THREE.Mesh | null = null
  private gateLight: THREE.PointLight
  private paused = false
  private uiBlocked = false
  private lastEmitBubble = 0
  private lastVac = 0
  private ambientBubbleT = 0
  private budgetWarned = false
  private grainT = -1
  private heroDone = true
  private glowUp = 0

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    const dprRaw = Math.min(window.devicePixelRatio || 1, 2)
    const lowTier =
      (navigator.hardwareConcurrency || 4) <= 4 ||
      /iPhone OS (12|13|14)_/.test(navigator.userAgent) ||
      new URLSearchParams(location.search).get('low') === '1'
    this.quality = lowTier ? 'low' : 'high'
    this.dprCap = lowTier ? 1.5 : 2
    this.dpr = Math.min(dprRaw, this.dprCap)

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: dprRaw < 1.6 && !lowTier,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.LinearToneMapping
    this.renderer.toneMappingExposure = 1

    this.fog = new THREE.FogExp2(COLORS.fog.getHex(), 0.004)
    this.scene.fog = this.fog

    this.hemi = new THREE.HemisphereLight(0xdff8ff, 0x3f7f80, 2.0)
    this.scene.add(this.hemi)
    this.dir = new THREE.DirectionalLight(0xfff2cf, 1.45)
    this.dir.position.set(2.4, 9, 5)
    this.scene.add(this.dir)

    this.gateLight = new THREE.PointLight(0xffe3a0, 0, 5.5, 2)
    this.gateLight.position.set(0, GATE.centerY, 0.4)
    this.scene.add(this.gateLight)

    this.env = new Environment({ quality: this.quality })
    this.scene.add(this.env.group)

    this.sand = new SandSystem(
      this.quality === 'high' ? SAND.maxSegmentsHigh : SAND.maxSegmentsLow,
      this.quality
    )
    this.scene.add(this.sand.mesh)
    this.sand.setQuality(this.quality === 'high' ? 0.32 : 0.22, 1)

    this.emitter = new Emitter(this.sand)
    this.emitter.onPlace = (e) => this.handlePlace(e.x, e.y, e.z, e.r, e.landed, e.first)

    this.bubbles = new Bubbles(this.quality === 'high' ? 170 : 90)
    this.scene.add(this.bubbles.points)

    this.grains = new DryGrains(this.quality === 'high' ? 150 : 80)
    this.grains.waterY = WORLD.waterY + 0.05
    this.scene.add(this.grains.points)

    this.school = new FishSchool(this.quality === 'high' ? 5 : 3)
    this.scene.add(this.school.group)

    this.scene.add(this.nozzle.group)
    this.nozzle.group.visible = false

    this.hud = new Hud(uiRoot)
    this.wireHud()

    this.input = new Input(canvas)
    this.input.onDown = (s) => this.pointerDown(s.nx, s.ny)
    this.input.onMove = (s) => this.pointerMove(s.nx, s.ny)
    this.input.onUp = () => this.pointerUp()

    window.addEventListener('resize', this.onResize)
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 220))
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('blur', () => this.input.release())

    this.applySettings()
    this.onResize()
    this.setStage('title', 0.001)
  }

  // ------------------------------------------------------------------ setup
  private wireHud() {
    this.hud.onStart = () => {
      audio.unlock()
      audio.setVolume(settings.volume)
      this.hud.hideTitle()
      this.startIntro()
    }
    this.hud.onNext = () => this.advance()
    this.hud.onPickColor = (i) => {
      this.tool = 'sand'
      this.emitter.setColor(i)
      this.nozzle.setColor(SAND_COLORS[i].hex)
      this.hud.setToolSelection('sand', i)
      audio.chime(false)
    }
    this.hud.onPickTool = (t) => {
      this.tool = t
      this.hud.setToolSelection(t, this.emitter.colorIdx)
      audio.suck()
    }
    this.hud.onUndo = () => {
      const id = this.strokeStack.pop()
      if (id !== undefined) {
        const n = this.sand.removeStroke(id, this.time)
        if (n > 0) audio.suck()
      }
    }
    this.hud.onClearAll = () => {
      this.sand.clear(this.time)
      this.strokeStack.length = 0
      this.bubbles.burst(0, 0.6, 0, 22, 1.3, 2.2)
      audio.suck()
    }
    this.hud.onReplaySame = () => this.restart(this.variant)
    this.hud.onReplayNew = () => this.restart(this.variant + 1)
    this.hud.onFreeMode = () => this.setStage('free')
    this.hud.onNewCastle = () => this.restart(this.variant + 1)
    this.hud.onSettingsChanged = () => this.applySettings()
    this.hud.onPanelToggle = (open) => {
      this.uiBlocked = open
      this.input.enabled = !open
      if (open) this.input.release()
    }
  }

  private applySettings() {
    audio.setVolume(settings.volume)
    const b = settings.brightness
    this.hemi.intensity = 2.0 * b
    this.dir.intensity = 1.45 * b
    this.renderer.toneMappingExposure = 0.82 + b * 0.2
    this.env.setBrightness(b)
    this.env.setMotion(settings.motion)
    this.rig.motion = settings.motion
    this.bubbles.setScale(0.8 + settings.motion * 0.3)
    this.sand.setQuality(this.quality === 'high' ? 0.32 : 0.22, 0.4 + settings.motion * 0.6)
  }

  private onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    this.rig.setViewport(w, h)
    this.input.measure()
    document.body.classList.toggle('portrait', h >= w)
    document.body.classList.toggle('landscape', w > h)
    // keep the current stage framed after a rotation
    const def = STAGES[this.stage]
    if (this.stage === 'finale' || this.stage === 'free') this.rig.goTo(this.revealFraming(), 0.6)
    else this.rig.goTo(def.view(), 0.6)
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.paused = true
      this.input.release()
      audio.emitStop()
      audio.suspend()
    } else {
      this.paused = false
      this.clock.getDelta() // drop the gap
      audio.resume()
    }
  }

  // ------------------------------------------------------------- stage flow
  private setStage(id: StageId, camDur = 1.35) {
    this.stage = id
    this.stageTime = 0
    this.stageDone = false
    this.hud.showNext(false)
    this.hud.hideHand()

    if (this.guide) {
      this.guide.beginFade()
      this.oldGuides.push(this.guide)
      this.guide = null
    }
    const def = STAGES[id]
    const g = def.guide()
    if (g) {
      this.guide = g
      this.scene.add(g.group)
    }
    this.emitter.snap = def.snap
    this.emitter.zSpread = def.zSpread

    const guided = GUIDED_ORDER.indexOf(id)
    if (guided >= 0) this.hud.setPips(GUIDED_ORDER.length, guided)
    else if (id === 'finale') this.hud.setPips(GUIDED_ORDER.length, GUIDED_ORDER.length)
    else this.hud.setPips(0, 0)

    // tools available per stage
    if (id === 'decor') {
      this.unlocked = [0, 1, 2, 3, 4]
      this.hud.setPots(this.unlocked, false)
      this.hud.showUndo(true)
      this.hud.removeClearButton()
    } else if (id === 'free') {
      this.unlocked = [0, 1, 2, 3, 4]
      this.hud.setPots(this.unlocked, true)
      this.hud.showUndo(true)
      this.hud.addClearButton()
      this.hud.addNewCastleButton()
    } else if (id === 'finale' || id === 'title' || id === 'surface' || id === 'dive') {
      this.hud.setPots([], false)
      this.hud.showUndo(false)
      this.hud.removeClearButton()
    } else {
      this.unlocked = [0]
      this.hud.setPots(this.unlocked, false)
      this.hud.showUndo(true)
      this.hud.removeClearButton()
    }
    this.hud.setToolSelection(this.tool, this.emitter.colorIdx)

    if (id === 'foundation') {
      this.heroDone = false
      this.emitter.heroNext = true
    }
    if (id === 'title') {
      this.nozzle.group.visible = true
      this.nozzle.group.position.set(0, WORLD.waterY + 1.15, 0)
      this.hud.showTitle()
    }
    if (id === 'free') {
      this.school.setAllWander()
      this.hud.toast('じゆうに つくろう')
    }
    if (id === 'finale') {
      this.beginFinale()
    }
    if (id === 'decor') {
      this.hud.toast('かざろう！')
      for (let i = 0; i < this.school.fish.length; i++) {
        if (i % 2 === 0) this.school.fish[i].wander()
      }
    }

    if (id === 'finale') this.rig.goTo(this.revealFraming(), 1.9)
    else this.rig.goTo(def.view(), camDur)

    this.hasPointer = false
    this.parkNozzle()
    this.idleSince = 0
  }

  /** Between strokes the nozzle waits over the next thing to build. */
  private parkNozzle() {
    if (!this.canDraw()) return
    this.parkTarget(this.tip)
    this.tipSmooth.copy(this.tip)
    this.nozzle.group.visible = true
    this.nozzle.group.position.copy(this.tipSmooth)
  }

  /** Waiting spot: beside the next checkpoint, never on top of it. */
  private parkTarget(out: THREE.Vector3) {
    const g = this.guide
    const c = g?.nextCell()
    if (!c || !g) {
      out.set(LAYOUT.towerX + 1.0, LAYOUT.towerTop * 0.55, 0.9)
      return
    }
    // step aside from the guide, perpendicular to the direction of travel,
    // so the bag never covers the checkpoints the child is meant to see
    const i = g.cells.indexOf(c)
    const n = g.cells[i + 1] ?? g.cells[i - 1] ?? c
    const tx = Math.abs(n.p.x - c.p.x)
    const ty = Math.abs(n.p.y - c.p.y)
    if (ty > tx) {
      const side = c.p.x >= 0 ? 1 : -1
      out.set(c.p.x + side * 0.66, c.p.y + 0.1, 0.75)
    } else {
      out.set(c.p.x, c.p.y + 0.6, 0.75)
    }
  }

  private startIntro() {
    this.setStage('surface', 1.0)
    audio.startAmbient()
    audio.drySand(1.5)
    this.diveT = 0
    this.crossed = false
    this.nozzle.group.visible = true
    this.nozzle.group.position.set(0, WORLD.waterY + 1.15, 0)
    this.grainT = 0
    setTimeout(() => {
      if (this.stage === 'surface') this.setStage('dive', 2.3)
    }, 1700)
  }

  private advance() {
    const i = GUIDED_ORDER.indexOf(this.stage)
    if (i >= 0 && i < GUIDED_ORDER.length - 1) {
      this.completeStage()
      this.setStage(GUIDED_ORDER[i + 1])
    } else if (this.stage === 'decor') {
      this.completeStage()
      this.setStage('finale')
    }
  }

  private completeStage() {
    audio.chime(true)
    this.hud.flash()
    const g = this.guide
    if (g) {
      const c = g.cells[Math.floor(g.cells.length / 2)]
      this.bubbles.burst(c.p.x, c.p.y, c.p.z, 14, 1.1, 0.7)
    }
  }

  private restart(variant: number) {
    this.variant = ((variant % 3) + 3) % 3
    setVariant(this.variant)
    this.sand.clear(this.time)
    this.strokeStack.length = 0
    this.bubbles.clear()
    this.grains.clear()
    this.school.setAllFar()
    this.tool = 'sand'
    this.emitter.setColor(0)
    this.nozzle.setColor(SAND_COLORS[0].hex)
    this.disposeGateGlow()
    this.setStage('foundation', 1.2)
  }

  // ------------------------------------------------------------- pointer
  private updateTip(nx: number, ny: number) {
    if (!projectToPlane({ nx, ny, cx: 0, cy: 0 }, this.rig.camera, WORLD.buildZ, _p)) return false
    // second sample 84 css px higher, to keep the nozzle tip above the finger
    const dy = (84 / window.innerHeight) * 2
    if (projectToPlane({ nx, ny: ny + dy, cx: 0, cy: 0 }, this.rig.camera, WORLD.buildZ, _p2)) {
      this.tipOffsetWorld = Math.max(0.2, Math.min(1.4, _p2.y - _p.y))
    }
    this.tip.set(
      _p.x,
      Math.min(_p.y + this.tipOffsetWorld, WORLD.waterY - 1.5),
      WORLD.buildZ
    )
    return true
  }

  private canDraw(): boolean {
    if (this.uiBlocked) return false
    return (
      this.stage === 'foundation' ||
      this.stage === 'towerL' ||
      this.stage === 'towerR' ||
      this.stage === 'wall' ||
      this.stage === 'arch' ||
      this.stage === 'decor' ||
      this.stage === 'free'
    )
  }

  private pointerDown(nx: number, ny: number) {
    this.hasPointer = true
    this.idleSince = 0
    this.hud.hideHand()
    audio.unlock()
    if (!this.canDraw()) return
    if (!this.updateTip(nx, ny)) return
    this.tipSmooth.copy(this.tip)
    this.nozzle.group.visible = true
    this.nozzle.group.position.copy(this.tipSmooth)
    this.pressing = true
    if (this.tool === 'sand') {
      this.emitter.begin(this.tipSmooth, this.time)
      this.strokeStack.push(this.emitter.strokeId)
      if (this.strokeStack.length > 40) this.strokeStack.shift()
      audio.emitStart()
    }
  }

  private pointerMove(nx: number, ny: number) {
    this.hasPointer = true
    this.idleSince = 0
    this.rig.setPointer(nx * 0.5, ny * 0.5)
    if (!this.canDraw()) return
    this.updateTip(nx, ny)
  }

  private pointerUp() {
    if (!this.pressing) return
    this.pressing = false
    this.emitter.end()
    audio.emitStop()
    this.idleSince = 0
  }

  private handlePlace(x: number, y: number, z: number, r: number, landed: boolean, first: boolean) {
    if (first || landed) audio.blob(landed ? 0.9 : 1.15)
    // the very first squeeze of a run is the moment the whole game turns on
    if (!this.heroDone && first && this.stage === 'foundation') {
      this.heroDone = true
      audio.chime(false)
      this.bubbles.burst(x, y + r * 1.2, z, 16, 1.15, 0.5)
      this.hud.flash()
    }
    if (this.time - this.lastEmitBubble > 0.14) {
      this.lastEmitBubble = this.time
      this.bubbles.spawn(x, y + r, z, 0.55, 0.12)
      if (rng.next() < 0.22) audio.bubble(0, 0.6)
    }
    if (first) this.bubbles.burst(x, y + r * 0.6, z, 5, 0.7, 0.2)
    void r
  }

  // -------------------------------------------------------------- finale
  private revealFraming() {
    this.sand.bounds(_box)
    if (_box.isEmpty()) return STAGES.finale.view()
    const cx = (_box.min.x + _box.max.x) * 0.5
    const cy = (_box.min.y + _box.max.y) * 0.5 + 0.15
    const halfW = THREE.MathUtils.clamp((_box.max.x - _box.min.x) * 0.5 + 0.9, 2.4, 5.4)
    const halfH = THREE.MathUtils.clamp((_box.max.y - _box.min.y) * 0.5 + 0.95, 1.8, 3.8)
    return framing(cx * 0.6, Math.max(cy, 1.1), halfW, halfH, 12, 0)
  }

  private beginFinale() {
    this.finaleT = 0
    this.finaleStep = 0
    this.disposeGateGlow()
    const glow = makeGateOutline(LAYOUT.gateHalf, LAYOUT.wallTop, LAYOUT.archTop)
    const m = glow.material as THREE.MeshBasicMaterial
    m.opacity = 0
    this.glowUp = 0
    m.color.set(0xffc46a)
    glow.position.z = 0
    this.scene.add(glow)
    this.gateGlow = glow
    this.gateLight.position.set(0, GATE.centerY, 0.5)
    this.school.setAllFar()
  }

  private disposeGateGlow() {
    if (this.gateGlow) {
      this.scene.remove(this.gateGlow)
      this.gateGlow.geometry.dispose()
      ;(this.gateGlow.material as THREE.Material).dispose()
      this.gateGlow = null
    }
    this.gateLight.intensity = 0
  }

  private updateFinale(dt: number) {
    this.finaleT += dt
    const t = this.finaleT
    if (this.gateGlow) {
      const m = this.gateGlow.material as THREE.MeshBasicMaterial
      this.glowUp = Math.min(0.16, this.glowUp + dt * 0.14)
      m.opacity = this.glowUp * (0.8 + 0.2 * Math.sin(t * 2.4))
      this.gateGlow.scale.setScalar(1 + 0.012 * Math.sin(t * 1.7))
    }
    this.gateLight.intensity = Math.min(2.2, this.gateLight.intensity + dt * 1.1)

    const hero = this.school.fish[0]
    const gy = GATE.centerY

    if (this.finaleStep === 0 && t > 1.4) {
      this.finaleStep = 1
      hero.approach(new THREE.Vector3(0, gy, -2.4))
      this.hud.toast('おさかなが きた！')
    } else if (this.finaleStep === 1 && t > 3.6) {
      this.finaleStep = 2
      hero.pause(1.1)
      audio.bubble(0, 0.8)
    } else if (this.finaleStep === 2 && t > 4.9) {
      this.finaleStep = 3
      hero.follow(
        [
          new THREE.Vector3(0, gy, -1.1),
          new THREE.Vector3(0, gy, 0),
          new THREE.Vector3(0, gy, 1.3),
          new THREE.Vector3(1.9, gy + 1.0, 2.6),
        ],
        1.6
      )
      audio.chime(false)
      this.bubbles.burst(0, gy, 0.2, 10, 0.8, 0.35)
    } else if (this.finaleStep === 3 && t > 7.0) {
      this.finaleStep = 4
      audio.chime(true)
      this.hud.toast('とおった！')
      this.bubbles.burst(0, gy + 0.2, 0.4, 18, 1.1, 0.8)
      for (let i = 1; i < this.school.fish.length; i++) {
        this.school.fish[i].orbit(0.9 + i * 0.55, LAYOUT.towerX + 0.9, i * 2.1)
      }
    } else if (this.finaleStep === 4 && t > 8.6) {
      this.finaleStep = 5
      this.rig.setShowcase(true)
      hero.wander()
    } else if (this.finaleStep === 5 && t > 12.4) {
      this.finaleStep = 6
      this.hud.showFinish()
    }
  }

  // ---------------------------------------------------------------- loop
  private updateHint() {
    if (this.uiBlocked || this.pressing) {
      this.hud.hideHand()
      return
    }
    const g = this.guide
    if (!g || this.stageDone) {
      this.hud.hideHand()
      return
    }
    if (this.idleSince < 1.6) {
      this.hud.hideHand()
      return
    }
    const c = g.nextCell()
    if (!c) {
      this.hud.hideHand()
      return
    }
    _screen.copy(c.p).project(this.rig.camera)
    const x = ((_screen.x + 1) / 2) * window.innerWidth
    // the finger goes BELOW the target, because the nozzle tip is above the finger
    const y = ((-_screen.y + 1) / 2) * window.innerHeight + 84
    // arrow points from this cell toward the following one
    const idx = g.cells.indexOf(c)
    let ax = 0
    let ay = -34
    const nxt = g.cells[Math.min(idx + 2, g.cells.length - 1)]
    if (nxt && nxt !== c) {
      _screen.copy(nxt.p).project(this.rig.camera)
      const x2 = ((_screen.x + 1) / 2) * window.innerWidth
      const y2 = ((-_screen.y + 1) / 2) * window.innerHeight + 84
      const dx = x2 - x
      const dy = y2 - y
      const d = Math.hypot(dx, dy) || 1
      ax = (dx / d) * 34
      ay = (dy / d) * 34
    }
    if (x < -60 || x > window.innerWidth + 60 || y < -60 || y > window.innerHeight + 60) {
      this.hud.hideHand()
      return
    }
    this.hud.showHand(x, y, ax, ay)
  }

  private updateStageProgress(dt: number) {
    const def = STAGES[this.stage]
    const g = this.guide
    if (!g) {
      // free-form stage: offer "done" once the child has had a moment to play
      if (this.stage === 'decor' && !this.stageDone) {
        this.hud.showNext(this.stageTime > 4 || this.strokeStack.length > 0)
      }
      return
    }
    if (this.stageDone) return
    const fresh = g.check((x, y, z, r) => this.sand.hasNeighbor(x, y, z, r))
    if (fresh > 0) {
      audio.blob(1.25)
      const c = g.nextCell()
      if (c) this.bubbles.spawn(c.p.x, c.p.y, c.p.z, 0.6, 0.2)
    }
    const p = g.progress
    if (p >= def.soft && !this.stageDone) this.hud.showNext(true)
    const patienceHit = this.stageTime > def.patience && p >= def.soft
    if (p >= def.need || patienceHit) {
      this.stageDone = true
      this.hud.showNext(false)
      this.completeStage()
      const i = GUIDED_ORDER.indexOf(this.stage)
      const next = i >= 0 && i < GUIDED_ORDER.length - 1 ? GUIDED_ORDER[i + 1] : null
      window.setTimeout(() => {
        if (next && this.stage === def.id) this.setStage(next)
      }, 900)
    }
    void dt
  }

  private updateDive(dt: number) {
    this.diveT += dt
    const t = Math.min(1, this.diveT / 2.3)
    const y = THREE.MathUtils.lerp(WORLD.waterY + 1.15, WORLD.waterY - 2.6, t * t * (3 - 2 * t))
    this.nozzle.group.position.set(0, y, 0)
    if (!this.crossed && y <= WORLD.waterY) {
      this.crossed = true
      audio.splash()
      this.bubbles.burst(0, WORLD.waterY - 0.25, 0, 26, 1.25, 0.5)
      this.hud.flash()
    }
    const sub = THREE.MathUtils.clamp((WORLD.waterY - this.rig.camera.position.y + 0.4) / 1.4, 0, 1)
    audio.setSubmersion(sub)
    this.fog.density = THREE.MathUtils.lerp(0.004, 0.0245, sub)
    if (this.diveT > 2.5) this.setStage('foundation', 1.5)
  }

  private updateVacuum(dt: number) {
    if (!this.pressing || this.tool !== 'vacuum') return
    if (this.time - this.lastVac < 0.05) return
    this.lastVac = this.time
    const n = this.sand.removeSphere(
      this.tipSmooth.x,
      this.tipSmooth.y,
      this.tipSmooth.z,
      0.44,
      this.time
    )
    if (n > 0) {
      audio.suck()
      this.bubbles.spawn(this.tipSmooth.x, this.tipSmooth.y, this.tipSmooth.z, 0.7, 0.2)
    }
    void dt
  }

  private updateAdaptiveDpr(ms: number) {
    if (ms > 120) return // tab was hidden / first frame
    this.frameMs = this.frameMs * 0.9 + ms * 0.1
    if (this.frameMs > 23) {
      this.slowFrames++
      this.fastFrames = 0
    } else if (this.frameMs < 13.5) {
      this.fastFrames++
      this.slowFrames = 0
    }
    if (this.slowFrames > 50 && this.dpr > 0.75) {
      this.dpr = Math.max(0.75, this.dpr - 0.15)
      this.renderer.setPixelRatio(this.dpr)
      this.slowFrames = 0
    } else if (this.fastFrames > 260 && this.dpr < this.dprCap) {
      this.dpr = Math.min(this.dprCap, this.dpr + 0.1)
      this.renderer.setPixelRatio(this.dpr)
      this.fastFrames = 0
    }
  }

  tick = () => {
    let dt = this.clock.getDelta()
    if (this.paused) {
      requestAnimationFrame(this.tick)
      return
    }
    dt = Math.min(dt, 0.1)
    this.time += dt

    if (this.stage === 'dive') this.updateDive(dt)
    if (this.stage === 'finale') this.updateFinale(dt)

    this.stageTime += dt
    if (!this.pressing) this.idleSince += dt

    // nozzle follows the finger, tip a little above it
    if (this.canDraw()) {
      if (this.idleSince > 2.2) this.hasPointer = false
      if (!this.hasPointer && !this.pressing) this.parkTarget(this.tip)
      this.tipSmooth.lerp(this.tip, Math.min(1, dt * (this.hasPointer ? 24 : 3)))
      this.nozzle.group.visible = true
      this.nozzle.group.position.copy(this.tipSmooth)
      if (this.pressing && this.tool === 'sand') {
        this.emitter.moveTo(this.tipSmooth, dt)
        this.emitter.update(dt, this.time)
        audio.emitTone(Math.min(1, this.emitter.dragSpeed / 6))
        if (this.emitter.budgetBlocked && !this.budgetWarned) {
          this.budgetWarned = true
          this.hud.toast(this.stage === 'free' ? 'すなが いっぱい！すいとってね' : 'すなが いっぱい！')
        }
      }
      this.updateVacuum(dt)
    } else if (this.stage !== 'title' && this.stage !== 'surface' && this.stage !== 'dive') {
      this.nozzle.group.visible = false
    }
    this.nozzle.update(dt, this.pressing, settings.motion)

    this.updateStageProgress(dt)
    this.updateHint()

    // ambient bubbles
    this.ambientBubbleT -= dt
    if (this.ambientBubbleT <= 0 && this.stage !== 'title' && this.stage !== 'surface') {
      this.ambientBubbleT = rng.range(0.5, 1.5)
      this.bubbles.spawn(rng.range(-7, 7), rng.range(0.1, 1.2), rng.range(-6, 1.5), 0.6, 0.3)
      if (rng.next() < 0.25) audio.bubble(0, 0.35)
    }

    // dry sand trickling out of the pot, above the water, during the intro
    if (this.stage === 'surface' || (this.stage === 'dive' && !this.crossed)) {
      this.grainT -= dt
      if (this.grainT <= 0) {
        this.grainT = 0.022
        const np = this.nozzle.group.position
        for (let i = 0; i < 3; i++) this.grains.spawn(np.x, np.y + 0.06, np.z)
      }
    }
    this.grains.update(dt)

    this.sand.update(this.time)
    this.bubbles.update(dt, this.time, settings.motion)
    this.school.update(dt, this.time, settings.motion)
    this.env.update(this.time, dt, settings.motion)
    this.env.faceCamera(this.rig.camera)
    if (this.guide) this.guide.update(dt, this.time)
    for (let i = this.oldGuides.length - 1; i >= 0; i--) {
      const g = this.oldGuides[i]
      g.update(dt, this.time)
      if (g.faded) {
        this.scene.remove(g.group)
        g.dispose()
        this.oldGuides.splice(i, 1)
      }
    }

    this.rig.update(dt)
    this.renderer.render(this.scene, this.rig.camera)

    this.updateAdaptiveDpr(dt * 1000)
    requestAnimationFrame(this.tick)
  }

  start() {
    const params = new URLSearchParams(location.search)
    const jump = params.get('stage') as StageId | null
    if (jump && STAGES[jump]) {
      audio.unlock()
      this.hud.hideTitle()
      this.fog.density = 0.0245
      audio.setSubmersion(1)
      if (params.get('build') === '1') this.autoBuild()
      this.setStage(jump, 0.4)
    }
    this.clock.start()
    requestAnimationFrame(this.tick)
  }

  /** Fills in the castle so later stages can be inspected without playing. */
  autoBuild() {
    const put = (x: number, y: number, z: number) => {
      const c = new THREE.Color(SAND_COLORS[0].hex)
      this.sand.add(x, y, z, SAND.radius, c, 0.35, -1, -5)
    }
    for (let x = -LAYOUT.foundationRX; x <= LAYOUT.foundationRX; x += 0.16) {
      for (let z = -0.55; z <= 0.55; z += 0.28) put(x, 0.2, z)
    }
    for (const sx of [-1, 1]) {
      for (let y = 0.3; y <= LAYOUT.towerTop; y += 0.15) {
        put(sx * LAYOUT.towerX, y, 0)
        put(sx * LAYOUT.towerX, y, 0.3)
        put(sx * LAYOUT.towerX, y, -0.3)
      }
    }
    for (const sx of [-1, 1]) {
      for (let x = LAYOUT.gateHalf + 0.2; x <= LAYOUT.towerX; x += 0.15) {
        for (let y = 0.4; y <= LAYOUT.wallTop; y += 0.18) {
          put(sx * x, y, 0)
          put(sx * x, y, 0.28)
        }
      }
    }
    const n = 14
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI
      const x = -Math.cos(a) * (LAYOUT.gateHalf + 0.1)
      const y = LAYOUT.wallTop + Math.sin(a) * (LAYOUT.archTop - LAYOUT.wallTop)
      put(x, y, 0)
      put(x, y, 0.28)
      put(x, y, -0.28)
    }
  }

  get debugLayout() {
    return { ...LAYOUT, variant: this.variant }
  }

  get debug(): GameDebug {
    return {
      stage: this.stage,
      segments: this.sand.count,
      progress: this.guide ? this.guide.progress : 1,
      fps: Math.round(1000 / Math.max(this.frameMs, 0.01)),
      dpr: this.dpr,
      tool: this.tool,
      color: this.emitter.colorIdx,
    }
  }

  /**
   * Test hook: the path a finger should trace to satisfy the current guide,
   * in normalised (0..1) screen coordinates, already offset for the fact that
   * the nozzle tip sits above the fingertip.
   */
  guideFingerPath(): { x: number; y: number }[] {
    const g = this.guide
    if (!g) return []
    const w = window.innerWidth
    const h = window.innerHeight
    return g.cells.map((c) => {
      _screen.copy(c.p).project(this.rig.camera)
      return {
        x: ((_screen.x + 1) / 2 * w) / w,
        y: (((-_screen.y + 1) / 2) * h + 84) / h,
      }
    })
  }

  /** Test hook: draw a stroke in normalised screen coords. */
  simulateStroke(pts: { nx: number; ny: number }[], holdMs = 0) {
    if (!pts.length) return
    this.pointerDown(pts[0].nx, pts[0].ny)
    for (let i = 1; i < pts.length; i++) this.pointerMove(pts[i].nx, pts[i].ny)
    void holdMs
  }
  simulateRelease() {
    this.pointerUp()
  }
}

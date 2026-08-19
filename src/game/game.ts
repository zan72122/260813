import { Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three'
import {
  CASTLE_X,
  CASTLE_Z,
  MOAT_OUTER,
  SAND_X,
  SAND_Z,
  SOURCE_X,
  SOURCE_Z,
  isFastE2E,
} from '../core/config'
import { Settings, loadSettings, saveSettings } from '../core/settings'
import { clamp, lerp, smoothstep } from '../core/util'
import { Audio } from '../audio/audio'
import { CameraRig, Orientation } from '../render/cameraRig'
import { Environment } from '../render/environment'
import { Particles } from '../render/particles'
import { SandMesh } from '../render/sandMesh'
import { WaterMesh } from '../render/waterMesh'
import { HintPath, WorldTool } from '../render/worldTool'
import { ToolTray } from '../render/toolTray'
import { ToolId } from '../render/toolModels'
import { Overlay, MenuChoice } from '../ui/overlay'
import { Castle } from './castle'
import { Terrain, TerrainPatternId } from './terrain'
import { Water } from './water'

export type Phase =
  | 'intro'
  | 'dig'
  | 'invitePour'
  | 'flow'
  | 'repair'
  | 'fill'
  | 'reveal'
  | 'menu'

type Safe = { top: number; right: number; bottom: number; left: number }

const PATTERN_ROTATION: TerrainPatternId[] = ['gentle', 'sidepath', 'ridge']

const GATE_X = CASTLE_X - MOAT_OUTER

export class Game {
  readonly scene = new Scene()
  readonly terrain = new Terrain()
  readonly water = new Water()
  readonly rig = new CameraRig()
  readonly audio = new Audio()

  private readonly sandMesh: SandMesh
  private readonly waterMesh: WaterMesh
  private readonly castle = new Castle()
  private readonly env: Environment
  private readonly particles: Particles
  private readonly worldTool: WorldTool
  private readonly hintPath: HintPath
  readonly tray = new ToolTray()
  private readonly overlay: Overlay
  private readonly raycaster = new Raycaster()

  settings: Settings = loadSettings()
  phase: Phase = 'intro'
  private patternIndex = 0
  private seed = 1
  private currentPattern: TerrainPatternId = 'gentle'

  // input
  private activePointer: number | null = null
  private pointerDown = false
  private lastX = 0
  private lastZ = 0
  private hasLast = false
  private idleTime = 0
  private strokeDist = 0
  private moundTimer = 0
  private moundDist = 0
  private pourTime = 0

  // progress
  private totalDug = 0
  private totalPoured = 0
  private hasPoured = false
  private moatTouched = false
  private revealTime = 0
  private stallTime = 0
  private bestFrontX = -99
  private repairX = 0
  private repairZ = 0
  private wheelStarted = false
  private bridgeDone = false
  private time = 0
  private lastToolChangeHint = 0

  // viewport
  private vw = 1
  private vh = 1
  private safe: Safe = { top: 0, right: 0, bottom: 0, left: 0 }
  private orientation: Orientation = 'landscape'

  constructor(private readonly renderer: WebGLRenderer, uiRoot: HTMLElement) {
    this.env = new Environment(this.scene)
    this.sandMesh = new SandMesh(this.terrain)
    this.scene.add(this.sandMesh.mesh)
    this.waterMesh = new WaterMesh(this.terrain)
    this.scene.add(this.waterMesh.mesh)
    this.scene.add(this.castle.group)
    this.particles = new Particles(this.scene, isFastE2E() ? 120 : 460)
    this.worldTool = new WorldTool(this.scene)
    this.hintPath = new HintPath(this.scene, this.terrain)

    this.overlay = new Overlay(uiRoot, {
      onChoice: (c) => this.chooseMenu(c),
      onVolume: (v) => {
        this.settings.volume = v
        saveSettings(this.settings)
        this.audio.setVolume(v)
      },
      onMotion: (calm) => {
        this.settings.calmMotion = calm
        saveSettings(this.settings)
      },
      onHome: () => this.openMenu(false),
      onAnyTap: () => {
        this.audio.unlock()
        this.audio.setVolume(this.settings.volume)
        this.audio.tap()
      },
    })
    this.overlay.setVolume(this.settings.volume)
    this.overlay.setCalm(this.settings.calmMotion)

    this.startRound('gentle', 1)
  }

  // ------------------------------------------------------------ lifecycle

  ready(): void {
    this.overlay.hideLoading()
  }

  startRound(pattern: TerrainPatternId, seed: number): void {
    this.currentPattern = pattern
    this.seed = seed
    this.terrain.build(pattern, seed)
    this.water.reset()
    this.waterMesh.reset()
    this.castle.reset()
    this.particles.clear()
    this.sandMesh.update()
    this.waterMesh.update(this.water)

    this.phase = 'intro'
    this.totalDug = 0
    this.totalPoured = 0
    this.hasPoured = false
    this.moatTouched = false
    this.revealTime = 0
    this.stallTime = 0
    this.bestFrontX = -99
    this.wheelStarted = false
    this.bridgeDone = false
    this.idleTime = 0
    this.tray.selected = 'dig'
    this.tray.hinted = 'dig'
    this.tray.visible = true
    this.worldTool.setTool('dig')
    this.worldTool.release()
    this.hintPath.setVisible(true)
    this.env.setSourceHint(false)
    this.overlay.setControlsVisible(true)

    this.rig.focus(0.1, 0, 1)
    this.rig.snap()
  }

  private chooseMenu(c: MenuChoice): void {
    if (c === 'same') {
      this.startRound(this.currentPattern, this.seed)
    } else if (c === 'new') {
      this.patternIndex = (this.patternIndex + 1) % PATTERN_ROTATION.length
      const p = PATTERN_ROTATION[this.patternIndex]
      this.startRound(p, this.seed + 1)
    } else {
      this.startRound('sandbox', this.seed + 7)
    }
  }

  openMenu(celebrate: boolean): void {
    this.phase = 'menu'
    this.overlay.showMenu(celebrate)
    this.tray.visible = false
    this.worldTool.release()
    this.audio.setPour(0)
  }

  // ------------------------------------------------------------ viewport

  resize(w: number, h: number, safe: Safe): void {
    this.vw = w
    this.vh = h
    this.safe = safe
    const o: Orientation = h >= w ? 'portrait' : 'landscape'
    const changed = o !== this.orientation
    this.orientation = o
    this.rig.setOrientation(o, changed && this.time < 0.5)
    this.tray.layout(w, h, safe)
    this.rig.resize(w, h, this.tray.reserve(safe))
    this.particles.setPixelScale(h)
  }

  // ------------------------------------------------------------ picking

  /**
   * March the camera ray against the height field. The contact point is lifted
   * slightly up-screen so the child's fingertip never covers the shovel tip.
   */
  private pickSand(px: number, py: number, lift = true): { x: number; z: number } | null {
    const liftPx = lift ? Math.min(this.vw, this.vh) * 0.085 : 0
    const ndc = new Vector2(
      (px / this.vw) * 2 - 1,
      -(((py - liftPx) / this.vh) * 2 - 1),
    )
    this.raycaster.setFromCamera(ndc, this.rig.camera)
    const ro = this.raycaster.ray.origin
    const rd = this.raycaster.ray.direction
    if (rd.y >= -1e-4) return null

    const tTop = (1.6 - ro.y) / rd.y
    const tBottom = (-0.2 - ro.y) / rd.y
    const t0 = Math.max(0, Math.min(tTop, tBottom))
    const t1 = Math.max(tTop, tBottom)
    if (!(t1 > t0)) return null

    const steps = 56
    let prevT = t0
    let prevDiff = ro.y + rd.y * t0 - this.terrain.heightAt(ro.x + rd.x * t0, ro.z + rd.z * t0)
    let hitT = -1
    for (let i = 1; i <= steps; i++) {
      const t = t0 + ((t1 - t0) * i) / steps
      const x = ro.x + rd.x * t
      const z = ro.z + rd.z * t
      const diff = ro.y + rd.y * t - this.terrain.heightAt(x, z)
      if (prevDiff > 0 && diff <= 0) {
        // binary refine
        let a = prevT
        let b = t
        for (let k = 0; k < 8; k++) {
          const m = (a + b) / 2
          const d = ro.y + rd.y * m - this.terrain.heightAt(ro.x + rd.x * m, ro.z + rd.z * m)
          if (d > 0) a = m
          else b = m
        }
        hitT = (a + b) / 2
        break
      }
      prevT = t
      prevDiff = diff
    }
    if (hitT < 0) {
      // Fall back to the flat plane at the average sand height.
      const t = (0.62 - ro.y) / rd.y
      if (t <= 0) return null
      hitT = t
    }
    const limX = SAND_X / 2 - 0.1
    const limZ = SAND_Z / 2 - 0.1
    const x = clamp(ro.x + rd.x * hitT, -limX, limX)
    const z = clamp(ro.z + rd.z * hitT, -limZ, limZ)
    return { x, z }
  }

  // ------------------------------------------------------------ input

  onPointerDown(id: number, px: number, py: number): void {
    if (this.activePointer !== null) return
    this.audio.unlock()
    this.audio.setVolume(this.settings.volume)
    this.overlay.closePopups()
    if (this.phase === 'menu') return

    this.idleTime = 0
    const tool = this.tray.hitTest(px, py)
    if (tool) {
      this.activePointer = id
      this.pointerDown = false
      if (tool !== this.tray.selected) {
        this.tray.selected = tool
        this.worldTool.setTool(tool)
        this.tray.hinted = null
        this.lastToolChangeHint = this.time
      }
      this.tray.press(tool)
      this.audio.tap()
      return
    }

    const hit = this.pickSand(px, py)
    if (!hit) return
    this.activePointer = id
    this.pointerDown = true
    this.rig.hold = true
    this.hasLast = true
    this.lastX = hit.x
    this.lastZ = hit.z
    this.strokeDist = 0
    this.pourTime = 0
    this.applyTool(hit.x, hit.z, 0, true)
  }

  onPointerMove(id: number, px: number, py: number): void {
    if (id !== this.activePointer || !this.pointerDown) return
    this.idleTime = 0
    const hit = this.pickSand(px, py)
    if (!hit) return
    const dx = hit.x - this.lastX
    const dz = hit.z - this.lastZ
    const dist = Math.hypot(dx, dz)
    this.strokeDist += dist
    this.applyTool(hit.x, hit.z, dist, false)
    this.lastX = hit.x
    this.lastZ = hit.z
  }

  onPointerUp(id: number): void {
    if (id !== this.activePointer) return
    this.activePointer = null
    this.rig.hold = false
    if (!this.pointerDown) return
    this.pointerDown = false
    this.hasLast = false
    this.worldTool.release()
    this.audio.setPour(0)
  }

  cancelPointer(): void {
    this.activePointer = null
    this.rig.hold = false
    this.pointerDown = false
    this.hasLast = false
    this.worldTool.release()
    this.audio.setPour(0)
  }

  private applyTool(x: number, z: number, segLen: number, first: boolean): void {
    const tool = this.tray.selected
    const dirX = this.hasLast ? x - this.lastX : 0
    const dirZ = this.hasLast ? z - this.lastZ : 0

    if (tool === 'dig') {
      const radius = 0.5
      const push = clamp(0.34 + segLen / (radius * 1.6), 0.34, 1.5)
      const fb = this.terrain.dig(
        first ? x : this.lastX,
        first ? z : this.lastZ,
        x,
        z,
        radius,
        0.085 * push,
      )
      this.totalDug += fb.moved
      this.sandMesh.update()
      this.worldTool.place(x, fb.height, z, dirX, dirZ)
      if (!this.settings.calmMotion || Math.random() < 0.4) {
        this.particles.spawnSand(x, fb.height, z, segLen > 0.05 ? 5 : 2, dirX * 6, dirZ * 6)
      }
      this.audio.dig(clamp(segLen * 6, 0.15, 1))
      if (this.phase === 'intro') {
        this.phase = 'dig'
        this.hintPath.setVisible(false)
      }
    } else if (tool === 'mound') {
      // Gate on real time and real distance, not on event count, so the
      // amount of sand dropped does not depend on the frame rate.
      this.moundDist += segLen
      if (!first && this.moundTimer > 0 && this.moundDist < 0.16) return
      this.moundTimer = 0.07
      this.moundDist = 0
      const snapped = this.snapMound(x, z)
      const fb = this.terrain.mound(snapped.x, snapped.z, 0.6, 0.045)
      this.totalDug += fb.moved * 0.2
      this.sandMesh.update()
      this.worldTool.place(snapped.x, fb.height, snapped.z, dirX, dirZ)
      this.particles.spawnSand(snapped.x, fb.height + 0.05, snapped.z, 2, dirX * 3, dirZ * 3)
      this.audio.mound(clamp(segLen * 5, 0.2, 1))
    } else {
      const h = this.terrain.heightAt(x, z)
      this.worldTool.place(x, h, z, dirX, dirZ)
      if (first) {
        this.hasPoured = true
        this.env.setSourceHint(false)
        this.hintPath.setVisible(false)
        if (this.phase === 'intro' || this.phase === 'dig' || this.phase === 'invitePour') {
          this.phase = 'flow'
        }
      }
    }
  }

  /**
   * Gentle magnetism for the mounding scoop: if the child drops sand near
   * running water, nudge it onto the strongest nearby flow. Four-year-olds
   * should not have to aim.
   */
  private snapMound(x: number, z: number): { x: number; z: number } {
    const t = this.terrain
    const w = this.water
    const R = 0.85
    let bestScore = 0
    let bx = x
    let bz = z
    const i0 = Math.max(1, Math.floor(t.gi(x - R)))
    const i1 = Math.min(t.w - 2, Math.ceil(t.gi(x + R)))
    const j0 = Math.max(1, Math.floor(t.gj(z - R)))
    const j1 = Math.min(t.h - 2, Math.ceil(t.gj(z + R)))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * t.w + i
        const d = w.depth[k]
        if (d < 0.004) continue
        const wx = t.wx(i)
        const wz = t.wz(j)
        const dist = Math.hypot(wx - x, wz - z)
        if (dist > R) continue
        const speed = Math.hypot(w.velX[k], w.velZ[k])
        const score = (speed * 40 + d * 8) * (1 - dist / R)
        if (score > bestScore) {
          bestScore = score
          bx = wx
          bz = wz
        }
      }
    }
    if (bestScore <= 0) return { x, z }
    return { x: lerp(x, bx, 0.45), z: lerp(z, bz, 0.45) }
  }

  // ------------------------------------------------------------ tick

  update(dt: number): void {
    this.time += dt
    this.idleTime += dt
    if (this.moundTimer > 0) this.moundTimer = Math.max(0, this.moundTimer - dt)

    if (this.pointerDown && this.tray.selected === 'pour' && this.phase !== 'menu') {
      this.pourTime += dt
      const rate = 0.1
      const ramp = smoothstep(0, 0.18, this.pourTime)
      const vol = rate * ramp * dt
      const h = this.terrain.heightAt(this.lastX, this.lastZ)
      this.water.add(this.terrain, this.lastX, this.lastZ, 0.34, vol)
      this.totalPoured += vol
      this.audio.setPour(0.55 + ramp * 0.45)
      const n = this.settings.calmMotion ? 1 : 2
      this.particles.spawnDrop(this.lastX, h + 0.5, this.lastZ, n)
    } else if (!this.pointerDown) {
      this.audio.setPour(0)
    }

    // The solver is explicit, so the sub-step has to stay near 8 ms whatever
    // the frame rate. A very slow frame runs the water slightly slow rather
    // than exploding it.
    const sub = clamp(Math.ceil(dt / 0.0085), 2, 4)
    const sdt = Math.min(dt, 0.034) / sub
    for (let s = 0; s < sub; s++) this.water.step(this.terrain, sdt)

    const rect = this.water.renderRect()
    this.terrain.dryOut(dt, rect)
    this.sandMesh.update(rect)
    this.waterMesh.update(this.water)
    this.waterMesh.setTime(this.time, this.rig.camera.position)

    this.castle.activation = this.water.moatFill
    this.castle.update(dt, this.settings.calmMotion)
    this.env.update(dt, this.settings.calmMotion)
    this.particles.update(dt)
    this.worldTool.update(dt, this.terrain, this.settings.calmMotion, this.rig.camera.position)
    this.hintPath.update(dt, this.settings.calmMotion)
    this.tray.update(dt, this.settings.calmMotion)

    this.updateAudioBed()
    this.updatePhase(dt)
    this.updateCamera()
    this.rig.update(dt, this.settings.calmMotion)
  }

  private updateAudioBed(): void {
    const e = this.water.flowEnergy
    const level = clamp(e * 22, 0, 1)
    this.audio.setStream(level, clamp(e * 30, 0, 1))
  }

  private updatePhase(dt: number): void {
    const w = this.water
    const fill = w.moatFill

    // First water in the moat.
    if (!this.moatTouched && fill > 0.012) {
      this.moatTouched = true
      this.audio.splash()
      this.rig.pulse(0.6)
      if (this.phase !== 'reveal') this.phase = 'fill'
    }
    if (this.phase === 'fill' && fill < 1) {
      if (w.moatGainRate > 0.0002) this.audio.fillTick(fill)
    }
    if (!this.wheelStarted && fill > 0.12) {
      this.wheelStarted = true
      this.audio.clank(1.15)
    }
    if (!this.bridgeDone && fill > 0.9) {
      this.bridgeDone = true
      this.audio.clank(0.8)
    }

    if (fill >= 0.985 && this.phase !== 'reveal' && this.phase !== 'menu') {
      this.phase = 'reveal'
      this.revealTime = 0
      this.audio.fanfare()
      this.tray.hinted = null
      this.env.setSourceHint(false)
    }

    if (this.phase === 'reveal') {
      this.revealTime += dt
      // Let the child simply look at what they made before anything appears.
      if (this.revealTime > 6.5) this.openMenu(true)
      return
    }
    if (this.phase === 'menu') return

    // Stall / stray detection — the "the water went somewhere else" beat.
    const front = w.frontX
    if (w.totalVolume > 0.06) {
      if (front > this.bestFrontX + 0.12) {
        this.bestFrontX = front
        this.stallTime = 0
      } else {
        this.stallTime += dt
      }
    } else {
      this.stallTime = 0
    }

    if (
      this.hasPoured &&
      fill < 0.02 &&
      w.totalVolume > 0.08 &&
      this.stallTime > 2.6 &&
      this.phase !== 'repair'
    ) {
      this.phase = 'repair'
      this.repairX = w.centroidX
      this.repairZ = w.centroidZ
      this.rig.pulse(0.35)
      this.audio.droplet()
      // Offer the tool that actually helps: a dam if the water wandered
      // sideways, a deeper groove if it simply stopped short.
      const strayed = Math.abs(w.centroidZ - CASTLE_Z) > 1.5
      this.tray.hinted = strayed ? 'mound' : 'dig'
    }
    if (this.phase === 'repair' && (this.stallTime < 0.6 || fill > 0.02)) {
      this.phase = 'flow'
      this.tray.hinted = null
    }

    // Invite the pour once there is a groove worth filling.
    if (
      !this.hasPoured &&
      this.phase === 'dig' &&
      (this.totalDug > 6 || this.idleTime > 3.2)
    ) {
      this.phase = 'invitePour'
    }
    if (this.phase === 'invitePour') {
      this.tray.hinted = 'pour'
      this.env.setSourceHint(true)
      if (this.idleTime > 4.5 && Math.random() < dt * 0.5) this.audio.droplet()
    }

    // Idle nudges.
    if (this.phase === 'intro') {
      this.tray.hinted = 'dig'
      this.hintPath.setVisible(true)
    } else if (
      this.phase === 'dig' &&
      this.idleTime > 3.5 &&
      this.time - this.lastToolChangeHint > 2
    ) {
      this.tray.hinted = this.tray.selected === 'dig' ? 'pour' : 'dig'
    } else if (this.phase === 'flow' && this.idleTime > 4 && !this.pointerDown) {
      this.tray.hinted = w.totalVolume < 0.05 ? 'pour' : null
    }

    // The duck's gaze is the quietest hint we have.
    if (this.phase === 'intro') this.env.lookAt(SOURCE_X, 1.2, SOURCE_Z)
    else if (this.phase === 'invitePour') this.env.lookAt(SOURCE_X, 1.2, SOURCE_Z)
    else if (this.phase === 'repair') this.env.lookAt(this.repairX, 0.8, this.repairZ)
    else if (w.totalVolume > 0.03) this.env.lookAt(w.frontX, 0.7, w.frontZ)
    else this.env.lookAt(CASTLE_X, 1.4, CASTLE_Z)
  }

  private updateCamera(): void {
    const w = this.water
    let fx = 0.1
    let fz = 0
    let zoom = 1

    switch (this.phase) {
      case 'intro':
        fx = 0.1
        fz = 0
        zoom = 1
        break
      case 'dig':
      case 'invitePour':
        fx = lerp(0.1, this.lastX, 0.4)
        fz = lerp(0, this.lastZ, 0.4)
        zoom = 0.93
        break
      case 'flow': {
        // Ride with the leading edge, but never lose the castle.
        const t = clamp((w.frontX - SOURCE_X) / (GATE_X - SOURCE_X), 0, 1)
        const tx = w.totalVolume > 0.03 ? lerp(w.centroidX, w.frontX, 0.65) : this.lastX
        const tz = w.totalVolume > 0.03 ? lerp(w.centroidZ, w.frontZ, 0.65) : this.lastZ
        fx = lerp(tx, (tx + CASTLE_X) / 2, t * 0.5)
        fz = lerp(tz, (tz + CASTLE_Z) / 2, t * 0.5)
        zoom = 0.95
        break
      }
      case 'repair':
        fx = lerp(this.repairX, 0.1, 0.2)
        fz = lerp(this.repairZ, 0, 0.2)
        zoom = 0.82
        break
      case 'fill': {
        const f = w.moatFill
        fx = lerp(lerp(w.centroidX, CASTLE_X, 0.55), CASTLE_X - 0.6, f)
        fz = lerp(w.centroidZ * 0.5, CASTLE_Z, f)
        zoom = lerp(0.9, 0.96, f)
        break
      }
      case 'reveal': {
        const t = smoothstep(0, 2.2, this.revealTime)
        fx = lerp(CASTLE_X - 0.5, 0.7, t)
        fz = lerp(CASTLE_Z, 0, t)
        zoom = lerp(0.86, 1.0, t)
        break
      }
      case 'menu':
        fx = 1.2
        fz = 0
        zoom = 1.0
        break
    }
    this.rig.focus(fx, fz, zoom)
  }

  render(): void {
    this.renderer.autoClear = true
    this.renderer.render(this.scene, this.rig.camera)
    this.renderer.autoClear = false
    this.renderer.clearDepth()
    this.tray.render(this.renderer)
    this.renderer.autoClear = true
  }

  // ------------------------------------------------------------ misc

  onHidden(): void {
    this.cancelPointer()
    this.audio.suspend()
  }

  onVisible(): void {
    this.audio.resume()
    this.audio.setVolume(this.settings.volume)
  }

  /** Test/debug surface. */
  debugState() {
    return {
      phase: this.phase,
      revealTime: this.revealTime,
      pattern: this.currentPattern,
      moatFill: this.water.moatFill,
      waterVolume: this.water.totalVolume,
      totalDug: this.totalDug,
      totalPoured: this.totalPoured,
      frontX: this.water.frontX,
      orientation: this.orientation,
      menuVisible: this.overlay.menuVisible,
      selectedTool: this.tray.selected as ToolId,
      safe: this.safe,
      viewport: { w: this.vw, h: this.vh },
    }
  }

  dispose(): void {
    this.sandMesh.dispose()
    this.waterMesh.dispose()
    this.castle.dispose()
    this.env.dispose()
    this.particles.dispose()
    this.worldTool.dispose()
    this.hintPath.dispose()
    this.tray.dispose()
  }

  /** Used by tests: aim at a world point and return screen pixels. */
  worldToScreen(x: number, z: number): { x: number; y: number } {
    const y = this.terrain.heightAt(x, z)
    const v = new Vector3(x, y, z).project(this.rig.camera)
    const liftPx = Math.min(this.vw, this.vh) * 0.085
    return {
      x: ((v.x + 1) / 2) * this.vw,
      y: ((1 - v.y) / 2) * this.vh + liftPx,
    }
  }
}

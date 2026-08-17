import * as THREE from 'three'
import { World, Biscuit } from './world'
import { CameraRig } from './camera'
import { Input } from './input'
import { tweens, easeInOut, easeOutCubic, easeInCubic, easeOutBack, clamp, lerp } from './tween'
import { sfx } from './audio'
import { hint, GestureSpec } from './hint'
import { ui, ReplayChoice } from './ui'
import {
  TRAY_POS,
  TRAY_R,
  COFFEE_Y,
  RIM_Y,
  INNER_X,
  INNER_Z,
  biscuitTopY,
  CONTENT_TOP,
  CUT_X,
  SLOTS,
} from './metrics'
import { DISH_TINTS } from './materials'

export type PhaseName =
  | 'boot'
  | 'title'
  | 'dip'
  | 'place'
  | 'cream'
  | 'smooth'
  | 'layers'
  | 'cocoa'
  | 'chill'
  | 'cut'
  | 'reveal'
  | 'replay'

const SAVE_KEY = 'tiramisu-save-v1'

export class Game {
  world!: World
  phaseName: PhaseName = 'boot'
  step = 0
  tempo = 1
  gestureFn: (() => GestureSpec | null) | null = null

  private updateFn: ((dt: number) => void) | null = null
  private idleTime = 0
  private tintIndex = 0
  private plays = 0

  constructor(
    public rig: CameraRig,
    public input: Input,
    private fast: boolean,
  ) {
    try {
      const raw = localStorage.getItem(SAVE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        this.tintIndex = (s.tint ?? 0) % DISH_TINTS.length
        this.plays = s.plays ?? 0
      }
    } catch {
      /* private mode */
    }
  }

  private save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ tint: this.tintIndex, plays: this.plays }))
    } catch {
      /* private mode */
    }
  }

  // ----------------------------------------------------------------
  async start() {
    let showTitle = true
    for (;;) {
      this.world?.dispose()
      this.world = new World(this.tintIndex, this.fast)
      if (showTitle) {
        this.phaseName = 'title'
        this.step++
        this.rig.snap('title')
        this.rig.swayAmp = 0.18
        this.gestureFn = () => {
          const r = ui.titleButtonRect()
          return r ? { type: 'tap', points: [r] } : null
        }
        await ui.showTitle()
        this.rig.swayAmp = 0
      }
      const choice = await this.playRound()
      this.plays++
      if (choice === 'dish') this.tintIndex = (this.tintIndex + 1) % DISH_TINTS.length
      this.save()
      showTitle = choice === 'home'
    }
  }

  private async playRound(): Promise<ReplayChoice> {
    this.tempo = 1
    for (let layer = 0; layer < 2; layer++) {
      for (let slot = 0; slot < 4; slot++) {
        const b = await this.dipPhase()
        await this.placePhase(b, layer, slot)
      }
      await this.creamPhase(layer)
      await this.smoothPhase(layer)
      if (layer === 0) {
        await this.layersBeat()
        this.tempo = 1.4 // second layer plays snappier
      }
    }
    await this.cocoaPhase()
    await this.chillPhase()
    await this.cutPhase()
    await this.revealPhase()
    return this.replayPhase()
  }

  private beginPhase(name: PhaseName) {
    this.phaseName = name
    this.step++
    this.idleTime = 0
    hint.stop()
    this.input.clearHandlers()
    this.input.invalidateStroke() // each step starts with a fresh touch
    this.updateFn = null
    this.gestureFn = null
  }

  private scr(v: THREE.Vector3) {
    // clamped into the viewport: gestures/hints must always be reachable
    const p = this.world.toScreen(v, this.rig.camera)
    return {
      x: clamp(p.x, 16, window.innerWidth - 16),
      y: clamp(p.y, 16, window.innerHeight - 16),
    }
  }

  // ----------------------------------------------------------------
  private async dipPhase(): Promise<Biscuit> {
    this.beginPhase('dip')
    const w = this.world
    const b = w.spawnBiscuit()
    const hover = new THREE.Vector3(TRAY_POS.x + 0.1, 1.55, TRAY_POS.z + 0.3)
    b.mesh.position.copy(hover).add(new THREE.Vector3(0, 0.6, 0))
    void tweens.to({
      dur: 0.5 / this.tempo,
      ease: easeOutCubic,
      update: (v) => b.mesh.position.lerpVectors(hover.clone().add(new THREE.Vector3(0, 0.6, 0)), hover, v),
    })
    await this.rig.go('dip', 0.9 / this.tempo)

    let state: 'hover' | 'held' | 'coffee' | 'lifted' = 'hover'
    let soak = 0
    let coffeeTime = 0
    let rippleTimer = 0
    let bob = 0
    let fingerY = 2 // raw picked height of the finger, offset-free
    const target = hover.clone()
    const camPlane = new THREE.Plane()
    const hit = new THREE.Vector3()
    const camDir = new THREE.Vector3()

    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    const lift = async () => {
      if (state === 'lifted') return
      state = 'lifted'
      this.input.clearHandlers()
      const from = b.mesh.position.clone()
      const to = hover.clone()
      sfx.sa()
      void tweens.to({
        dur: 0.45,
        ease: easeOutCubic,
        update: (v) => {
          b.mesh.position.lerpVectors(from, to, v)
          w.setBend(b, b.soak * 0.55 * v)
        },
      })
      // coffee drips, more of them for a longer dip
      const n = Math.round(2 + b.soak * 5)
      for (let i = 0; i < n; i++) {
        await tweens.wait(0.1 + i * 0.02)
        const p = b.mesh.position
        w.dripAt(p.x + (Math.random() - 0.5) * 1.1, p.y - 0.15, p.z + (Math.random() - 0.5) * 0.3)
      }
      await tweens.wait(0.35)
      resolveDone()
    }

    this.input.onDown = () => {
      if (state === 'hover') state = 'held'
    }
    this.input.onMove = (p) => {
      if (state !== 'held' && state !== 'coffee') return
      const cam = this.rig.camera
      cam.getWorldDirection(camDir)
      camPlane.setFromNormalAndCoplanarPoint(
        camDir.clone().negate(),
        new THREE.Vector3(TRAY_POS.x, 0.7, TRAY_POS.z),
      )
      if (!w.pickPlane(cam, p.x, p.y, camPlane, hit)) return
      fingerY = hit.y
      target.set(
        clamp(hit.x, TRAY_POS.x - 1.7, TRAY_POS.x + 1.9),
        clamp(hit.y + 0.42, COFFEE_Y + 0.02, 2.3),
        clamp(hit.z + 0.15, TRAY_POS.z - 1.2, TRAY_POS.z + 1.5),
      )
    }
    this.input.onUp = () => {
      if (state === 'coffee') void lift()
      else if (state === 'held') state = 'hover'
    }

    this.updateFn = (dt) => {
      bob += dt
      if (state === 'hover') {
        b.mesh.position.y = hover.y + Math.sin(bob * 2.2) * 0.05
      } else if (state === 'held') {
        b.mesh.position.lerp(target, 0.3)
        const dx = b.mesh.position.x - TRAY_POS.x
        const dz = b.mesh.position.z - TRAY_POS.z
        // judged on the finger itself so the visual offset never blocks the dunk
        if (fingerY < COFFEE_Y + 0.42 && Math.hypot(dx, dz) < TRAY_R * 0.95) {
          state = 'coffee'
          sfx.sa()
          sfx.juwa()
          w.ripple(b.mesh.position.x, b.mesh.position.z)
        }
      } else if (state === 'coffee') {
        coffeeTime += dt
        rippleTimer += dt
        // float in the coffee, following the finger sideways
        b.mesh.position.x = lerp(b.mesh.position.x, clamp(target.x, TRAY_POS.x - 0.6, TRAY_POS.x + 0.6), 0.15)
        b.mesh.position.z = lerp(b.mesh.position.z, clamp(target.z, TRAY_POS.z - 0.45, TRAY_POS.z + 0.45), 0.15)
        b.mesh.position.y = lerp(b.mesh.position.y, COFFEE_Y + 0.07 + Math.sin(bob * 5) * 0.012, 0.3)
        soak = clamp(soak + dt / 2.4, 0, 1)
        w.setSoak(b, 0.16 + soak * 0.84)
        if (rippleTimer > 0.45) {
          rippleTimer = 0
          w.ripple(b.mesh.position.x, b.mesh.position.z)
          sfx.juwa()
        }
        if (fingerY > COFFEE_Y + 0.95 || coffeeTime > 3.2) void lift()
      }
    }

    this.gestureFn = () => {
      const from = this.scr(b.mesh.position)
      const to = this.scr(new THREE.Vector3(TRAY_POS.x, COFFEE_Y, TRAY_POS.z))
      return { type: 'drag', points: [from, to], holdMs: 800 }
    }

    await done
    this.updateFn = null
    return b
  }

  // ----------------------------------------------------------------
  private async placePhase(b: Biscuit, layer: number, slot: number) {
    this.beginPhase('place')
    const w = this.world
    const hoverY = RIM_Y + 0.5
    const parkPos = new THREE.Vector3(-1.35, hoverY, 0.8)
    const from = b.mesh.position.clone()
    const fromRot = b.mesh.rotation.y
    void tweens.to({
      dur: 0.8 / this.tempo,
      ease: easeInOut,
      update: (v) => {
        b.mesh.position.lerpVectors(from, parkPos, v)
        b.mesh.rotation.y = lerp(fromRot, Math.PI / 2, v)
        w.setBend(b, b.soak * 0.55 * (1 - v * 0.5))
      },
    })
    await this.rig.go('top', 0.9 / this.tempo)
    w.showSlotGhost(layer, slot, true)

    const slotP = w.slotPos(layer, slot)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hoverY)
    const hit = new THREE.Vector3()
    const target = parkPos.clone()
    let grabbed = false
    let placed = false

    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    this.input.onDown = () => {
      grabbed = true
    }
    this.input.onMove = (p) => {
      if (!grabbed || placed) return
      if (!w.pickPlane(this.rig.camera, p.x, p.y, plane, hit)) return
      const upWorld = w.screenUpOnGround(this.rig.camera)
      hit.addScaledVector(upWorld, 0.45) // keep the biscuit above the finger
      target.set(clamp(hit.x, -2.3, 2.3), hoverY, clamp(hit.z, -1.5, 1.7))
    }
    this.input.onUp = () => {
      grabbed = false
    }

    const commit = () => {
      placed = true
      this.input.clearHandlers()
      this.updateFn = null
      w.showSlotGhost(layer, slot, false)
      const dropFrom = b.mesh.position.clone()
      const dropTo = slotP.clone()
      void tweens
        .to({
          dur: 0.3,
          ease: easeInCubic,
          update: (v) => b.mesh.position.lerpVectors(dropFrom, dropTo, v),
        })
        .then(async () => {
          sfx.koton()
          w.adoptBiscuit(b, layer, slot)
          // tiny settle bounce
          await tweens.to({
            dur: 0.22,
            ease: easeOutBack,
            update: (v) => {
              b.mesh.scale.y = 1 - 0.25 * Math.sin(v * Math.PI)
            },
          })
          b.mesh.scale.y = 1
          resolveDone()
        })
    }

    this.updateFn = () => {
      if (placed) return
      const dx = target.x - slotP.x
      const dz = target.z - slotP.z
      const dist = Math.hypot(dx, dz)
      // magnet: within range the biscuit is pulled onto the slot
      const pull = dist < 0.6 ? 0.5 : 0.28
      b.mesh.position.x = lerp(b.mesh.position.x, dist < 0.6 ? slotP.x : target.x, pull)
      b.mesh.position.z = lerp(b.mesh.position.z, dist < 0.6 ? slotP.z : target.z, pull)
      b.mesh.position.y = lerp(b.mesh.position.y, hoverY, 0.3)
      const bx = b.mesh.position.x - slotP.x
      const bz = b.mesh.position.z - slotP.z
      // settles whenever the magnet has captured it, even after letting go
      if (dist < 0.45 && Math.hypot(bx, bz) < 0.12) commit()
    }

    this.gestureFn = () => {
      const fromS = this.scr(b.mesh.position)
      const toS = this.scr(slotP.clone().setY(hoverY))
      return { type: 'drag', points: [fromS, toS] }
    }

    await done
  }

  // ----------------------------------------------------------------
  private async creamPhase(layer: number) {
    this.beginPhase('cream')
    const w = this.world
    const cl = w.creamLayers[layer]
    cl.activate()
    const surfY = biscuitTopY(layer)
    void this.rig.go('cream', 1 / this.tempo)

    w.bag.visible = true
    w.bag.position.set(0, surfY + 1.6, 0.4)
    const bagTarget = w.bag.position.clone()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -surfY)
    const hit = new THREE.Vector3()
    let piped = 0
    let metricTimer = 0
    let finishing = false
    const lastPipe = new THREE.Vector3(999, 0, 999)

    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    this.input.onMove = (p) => {
      if (!w.pickPlane(this.rig.camera, p.x, p.y, plane, hit)) return
      bagTarget.set(clamp(hit.x, -1.35, 1.35), surfY + 0.72, clamp(hit.z, -1.0, 1.1))
    }
    this.input.onDown = this.input.onMove

    this.updateFn = (dt) => {
      w.bag.position.lerp(bagTarget, 0.35)
      const pressed = this.input.down && performance.now() - this.input.downTime > 140
      if (pressed && !finishing) {
        const px = clamp(w.bag.position.x, -INNER_X / 2 + 0.06, INNER_X / 2 - 0.06)
        const pz = clamp(w.bag.position.z - 0.12, -INNER_Z / 2 + 0.06, INNER_Z / 2 - 0.06)
        const cur = new THREE.Vector3(px, 0, pz)
        const d = cur.distanceTo(lastPipe)
        const steps = d > 0.4 ? 1 : Math.max(1, Math.ceil(d / 0.06))
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          cl.pipeAt(
            d > 0.4 ? px : lerp(lastPipe.x, px, t),
            d > 0.4 ? pz : lerp(lastPipe.z, pz, t),
          )
        }
        lastPipe.copy(cur)
        piped += dt
        sfx.munyu()
        // squeeze animation
        w.bag.scale.y = 0.94 + Math.sin(performance.now() * 0.02) * 0.03
      } else {
        w.bag.scale.y = lerp(w.bag.scale.y, 1, 0.2)
      }
      metricTimer += dt
      if (metricTimer > 0.35 && !finishing) {
        metricTimer = 0
        const m = cl.computeMetrics()
        if ((m.coverage > 0.45 && piped > 1.0) || piped > 4.5) {
          finishing = true
          this.input.clearHandlers()
          const from = w.bag.position.clone()
          void tweens
            .to({
              dur: 0.5,
              ease: easeInCubic,
              update: (v) => {
                w.bag.position.copy(from)
                w.bag.position.y = from.y + v * 1.6
              },
            })
            .then(() => {
              w.bag.visible = false
              resolveDone()
            })
        }
      }
    }

    this.gestureFn = () => {
      const pts = []
      for (const [x, z] of [
        [-0.85, -0.5],
        [0.85, -0.5],
        [0.85, 0.1],
        [-0.85, 0.1],
        [-0.85, 0.55],
        [0.85, 0.55],
      ]) {
        pts.push(this.scr(new THREE.Vector3(x, surfY + 0.1, z)))
      }
      return { type: 'drag', points: pts, holdMs: 300 }
    }

    await done
    this.updateFn = null
  }

  // ----------------------------------------------------------------
  private async smoothPhase(layer: number) {
    this.beginPhase('smooth')
    const w = this.world
    const cl = w.creamLayers[layer]
    const surfY = biscuitTopY(layer)

    w.spatula.visible = true
    w.spatula.position.set(1.6, surfY + 0.6, 0.3)
    w.spatula.rotation.z = -0.16
    const spatTarget = w.spatula.position.clone()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(surfY + 0.16))
    const hit = new THREE.Vector3()
    const last = new THREE.Vector3(999, 0, 999)
    let strokeLen = 0
    let metricTimer = 0
    let finishing = false

    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    const finish = async (force: boolean) => {
      if (finishing) return
      finishing = true
      this.input.clearHandlers()
      // always end with an even, wall-to-wall surface
      await cl.finishFlatten()
      const from = w.spatula.position.clone()
      await tweens.to({
        dur: 0.45,
        ease: easeInCubic,
        update: (v) => {
          w.spatula.position.set(from.x + v * 1.6, from.y + v * 0.6, from.z)
        },
      })
      w.spatula.visible = false
      resolveDone()
    }

    this.input.onMove = (p) => {
      if (finishing) return
      if (!w.pickPlane(this.rig.camera, p.x, p.y, plane, hit)) return
      spatTarget.set(clamp(hit.x, -1.5, 1.5), surfY + 0.17, clamp(hit.z, -1.1, 1.2))
      if (this.input.down) {
        const px = clamp(spatTarget.x, -INNER_X / 2, INNER_X / 2)
        const pz = clamp(spatTarget.z, -INNER_Z / 2, INNER_Z / 2)
        if (last.x > 100) last.set(px, 0, pz)
        const d = Math.hypot(px - last.x, pz - last.z)
        if (d > 0.03) {
          cl.smoothStroke(last.x, last.z, px, pz)
          strokeLen += d
          sfx.suu()
          last.set(px, 0, pz)
        }
      }
    }
    this.input.onDown = (p) => {
      last.set(999, 0, 999)
      this.input.onMove?.(p)
    }
    this.input.onUp = () => {
      last.set(999, 0, 999)
    }

    this.updateFn = (dt) => {
      w.spatula.position.lerp(spatTarget, 0.4)
      metricTimer += dt
      if (metricTimer > 0.3 && !finishing) {
        metricTimer = 0
        const m = cl.computeMetrics()
        if (m.flatness > 0.8 && m.coverage > 0.7) void finish(false)
        else if (strokeLen > 10) void finish(true) // always comes out beautiful
      }
    }

    this.gestureFn = () => {
      const a = this.scr(new THREE.Vector3(-1.1, surfY + 0.2, 0.1))
      const b = this.scr(new THREE.Vector3(1.1, surfY + 0.2, 0.1))
      return { type: 'drag', points: [a, b] }
    }

    await done
    this.updateFn = null
  }

  // ----------------------------------------------------------------
  private async layersBeat() {
    this.beginPhase('layers')
    await this.rig.go('layers', 1.0)
    sfx.chime()
    this.world.burstSparkles(new THREE.Vector3(0, 0.6, 1.2))
    await tweens.wait(1.2)
  }

  // ----------------------------------------------------------------
  private async cocoaPhase() {
    this.beginPhase('cocoa')
    const w = this.world
    void this.rig.go('cocoa', 1 / this.tempo)
    w.sieve.visible = true
    w.sieve.position.set(0, 1.8, 0.1)
    const sieveTarget = w.sieve.position.clone()
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.6)
    const hit = new THREE.Vector3()
    let vx = 0
    let metricTimer = 0
    let finishing = false
    let emitAcc = 0

    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    this.input.onMove = (p) => {
      if (finishing) return
      if (!w.pickPlane(this.rig.camera, p.x, p.y, plane, hit)) return
      const nx = clamp(hit.x, -0.85, 0.85)
      const nz = clamp(hit.z, -0.6, 0.7)
      vx = nx - sieveTarget.x
      sieveTarget.set(nx, 1.8, nz)
    }
    this.input.onDown = this.input.onMove
    this.input.onUp = (p) => {
      // light tap = a puff of cocoa
      if (performance.now() - this.input.downTime < 260) {
        w.emitCocoa(sieveTarget.x, sieveTarget.z, 60)
        sfx.sara()
      }
    }

    this.updateFn = (dt) => {
      w.sieve.position.lerp(sieveTarget, 0.3)
      w.sieve.rotation.z = clamp(vx * 4, -0.35, 0.35)
      vx *= 0.8
      if (this.input.down && !finishing) {
        // gentle trickle while held, much more while shaking
        const shake = Math.abs(vx) > 0.01 ? clamp(Math.abs(vx) * 30, 0.4, 1.6) : 0
        emitAcc += dt * (28 + 130 * shake)
        const n = Math.floor(emitAcc)
        if (n > 0) {
          emitAcc -= n
          w.emitCocoa(w.sieve.position.x, w.sieve.position.z, n)
          sfx.sara()
        }
      }
      metricTimer += dt
      if (metricTimer > 0.4 && !finishing) {
        metricTimer = 0
        if (w.cocoaSurface.computeCoverage() > 0.55) {
          finishing = true
          this.input.clearHandlers()
          void w.cocoaSurface.finishDust() // even out while the last grains fall
          const from = w.sieve.position.clone()
          void tweens
            .to({
              dur: 0.6,
              ease: easeInCubic,
              update: (v) => {
                w.sieve.position.set(from.x + v * 2.0, from.y + v * 0.8, from.z)
              },
            })
            .then(() => {
              w.sieve.visible = false
              resolveDone()
            })
        }
      }
    }

    this.gestureFn = () => {
      const pts = []
      for (const [x, z] of [
        [-0.8, -0.4],
        [0.8, -0.4],
        [-0.8, 0.5],
        [0.8, 0.5],
      ]) {
        pts.push(this.scr(new THREE.Vector3(x, 1.7, z)))
      }
      return { type: 'drag', points: pts }
    }

    await done
    this.updateFn = null
  }

  // ----------------------------------------------------------------
  private async chillPhase() {
    this.beginPhase('chill')
    const w = this.world
    w.wobbleAmp = 0.016 // soft, unset tiramisu
    w.fridge.visible = true
    await this.rig.go('chill', 1.1 / this.tempo)

    let progress = 0
    let committed = false
    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    const railFrom = new THREE.Vector3(0, 0, 0)
    const railTo = new THREE.Vector3()

    const commit = async () => {
      if (committed) return
      committed = true
      this.input.clearHandlers()
      this.updateFn = null
      // door opens, dish slides in
      await tweens.to({ dur: 0.35, update: (v) => w.setFridgeDoor(v) })
      const inside = w.fridgeInsidePos()
      const cur = w.containerGroup.position.clone()
      sfx.suu()
      await tweens.to({
        dur: 0.6,
        ease: easeInOut,
        update: (v) => w.containerGroup.position.lerpVectors(cur, inside, v),
      })
      await tweens.to({ dur: 0.3, update: (v) => w.setFridgeDoor(1 - v) })
      // time-lapse: spinning clock + hum, no real waiting
      sfx.hum(1.6)
      ui.startClock()
      w.burstSparkles(w.fridge.position.clone().add(new THREE.Vector3(0, 2.2, 0.7)))
      await tweens.wait(1.6)
      ui.stopClock()
      await tweens.to({ dur: 0.3, update: (v) => w.setFridgeDoor(v) })
      const back = w.containerGroup.position.clone()
      await tweens.to({
        dur: 0.65,
        ease: easeInOut,
        update: (v) => w.containerGroup.position.lerpVectors(back, railFrom, v),
      })
      await tweens.to({ dur: 0.3, update: (v) => w.setFridgeDoor(1 - v) })
      // now firm: the wobble settles
      const amp0 = w.wobbleAmp
      await tweens.to({ dur: 0.7, update: (v) => (w.wobbleAmp = amp0 * (1 - v)) })
      w.wobbleAmp = 0
      sfx.chime()
      w.burstSparkles(new THREE.Vector3(0, 1.1, 0.4))
      await tweens.wait(0.3)
      resolveDone()
    }

    this.input.onMove = (p) => {
      if (committed || !this.input.down) return
      // progress along the on-screen direction toward the fridge
      const a = this.scr(new THREE.Vector3(0, 0.6, 0))
      const fb = this.scr(w.fridge.position.clone().add(new THREE.Vector3(0, 1.2, 0)))
      const dirX = fb.x - a.x
      const dirY = fb.y - a.y
      const len = Math.hypot(dirX, dirY) || 1
      progress = clamp(progress + (p.dx * dirX + p.dy * dirY) / (len * len) * 1.6, 0, 1)
    }
    this.input.onUp = () => {
      if (!committed && progress < 0.5) {
        // spring back
        const p0 = progress
        void tweens.to({ dur: 0.3, update: (v) => (progress = p0 * (1 - v)) })
      }
    }

    railTo.copy(w.fridge.position).multiplyScalar(0.42).setY(0)

    this.updateFn = () => {
      if (committed) return
      w.containerGroup.position.lerpVectors(railFrom, railTo, progress)
      w.setFridgeDoor(clamp((progress - 0.15) * 1.6, 0, 1) * 0.7)
      if (progress > 0.52) void commit()
    }

    this.gestureFn = () => {
      const a = this.scr(new THREE.Vector3(0, 0.7, 0))
      const b = this.scr(w.fridge.position.clone().add(new THREE.Vector3(0, 1.0, 0.4)))
      return { type: 'drag', points: [a, b] }
    }

    await done
  }

  // ----------------------------------------------------------------
  private async cutPhase() {
    this.beginPhase('cut')
    const w = this.world
    w.fridge.visible = false
    w.prepareSlice()
    await this.rig.go('cut', 1.1 / this.tempo)

    w.knife.visible = true
    w.knife.position.set(CUT_X, 1.7, INNER_Z / 2 + 0.28)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(INNER_Z / 2 + 0.28))
    const hit = new THREE.Vector3()
    let progress = 0
    let finishing = false

    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    let lastTick = 0
    this.input.onMove = (p) => {
      if (finishing || !this.input.down) return
      if (!w.pickPlane(this.rig.camera, p.x, p.y, plane, hit)) return
      const newP = Math.max(progress, clamp((1.35 - hit.y) / 1.25, 0, 1))
      if (newP > progress) {
        progress = newP
        w.setSeamProgress(progress)
        if (progress - lastTick > 0.2) {
          lastTick = progress
          sfx.sa()
        }
      }
      if (progress >= 0.97 && !finishing) {
        finishing = true
        this.input.clearHandlers()
        void (async () => {
          sfx.spa()
          w.openSliceGap()
          const from = w.knife.position.clone()
          await tweens.to({
            dur: 0.5,
            ease: easeInCubic,
            update: (v) => {
              w.knife.position.set(from.x + v * 1.4, from.y + v * 1.0, from.z)
            },
          })
          w.knife.visible = false
          resolveDone()
        })()
      }
    }
    this.input.onDown = this.input.onMove

    this.updateFn = () => {
      w.knife.position.y = lerp(w.knife.position.y, 1.72 - progress * 0.9, 0.3)
    }

    this.gestureFn = () => {
      const a = this.scr(new THREE.Vector3(CUT_X, 1.35, INNER_Z / 2 + 0.28))
      const b = this.scr(new THREE.Vector3(CUT_X, 0.0, INNER_Z / 2 + 0.28))
      return { type: 'drag', points: [a, b] }
    }

    await done
    this.updateFn = null
  }

  // ----------------------------------------------------------------
  private async revealPhase() {
    this.beginPhase('reveal')
    const w = this.world
    await this.rig.go('reveal', 0.9)

    // cake server glides under the slice
    w.server.visible = true
    w.server.position.set(2.7, 0.05, 1.9)
    const under = new THREE.Vector3(0.883, 0.045, 0.435)
    sfx.suu()
    const sFrom = w.server.position.clone()
    await tweens.to({
      dur: 0.7,
      ease: easeInOut,
      update: (v) => w.server.position.lerpVectors(sFrom, under, v),
    })
    w.sliceGroup.attach(w.server)

    let upPx = 0
    let committed = false
    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))

    const commit = async () => {
      if (committed) return
      committed = true
      this.input.clearHandlers()
      this.updateFn = null
      sfx.paka()
      const from = w.sliceGroup.position.clone()
      const to = from.clone().add(new THREE.Vector3(0.5, 1.05, 0.55))
      void this.rig.go('hero', 1.25)
      await tweens.to({
        dur: 1.0,
        ease: easeInOut,
        update: (v) => {
          w.sliceGroup.position.lerpVectors(from, to, v)
          w.sliceGroup.rotation.y = -0.18 * v
          w.sliceGroup.rotation.z = 0.05 * Math.sin(v * Math.PI)
        },
      })
      w.burstSparkles(w.sliceGroup.position.clone().add(new THREE.Vector3(0.85, 0.9, 0.4)))
      sfx.tada()
      await tweens.wait(2.0)
      resolveDone()
    }

    this.input.onMove = (p) => {
      if (committed || !this.input.down) return
      upPx += Math.max(0, -p.dy)
      if (upPx > 130) void commit()
    }
    this.input.onUp = () => {
      if (!committed && upPx < 130) {
        upPx = 0
        w.sliceGroup.position.y = 0
      }
    }

    this.updateFn = () => {
      if (!committed) {
        w.sliceGroup.position.y = lerp(w.sliceGroup.position.y, Math.min(upPx * 0.002, 0.28), 0.3)
      }
    }

    this.gestureFn = () => {
      const base = this.scr(new THREE.Vector3(0.883, 0.5, 0.435))
      return { type: 'drag', points: [base, { x: base.x, y: base.y - 220 }] }
    }

    await done
  }

  // ----------------------------------------------------------------
  private async replayPhase(): Promise<ReplayChoice> {
    this.beginPhase('replay')
    this.gestureFn = () => {
      const r = ui.replayButtonRect()
      return r ? { type: 'tap', points: [r] } : null
    }
    const choice = await ui.showReplay(this.tintIndex + 1)
    return choice
  }

  // ----------------------------------------------------------------
  frame(dt: number) {
    this.updateFn?.(dt)
    this.world?.update(dt)

    // wordless idle hint
    if (this.input.down) {
      this.idleTime = 0
      hint.stop()
    } else if (this.gestureFn) {
      this.idleTime += dt
      const delay = (this.fast ? 2.0 : 4.0) / this.tempo
      if (this.idleTime > delay) {
        hint.play(() => this.gestureFn?.() ?? null)
      }
    }
  }
}

import { Game, Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { frame } from '../game/framing'
import { sfx, setAmbientWind } from '../core/audio'
import { clamp, clamp01 } from '../core/math'
import { drawButton, bigText, Btn } from '../game/ui'
import { drawFurin, drawPinwheel, drawStrips, Leaves, drawWindStreaks } from '../game/props'

let wind = 0
let windDir = 1
let rot = 0
let rotV = 0
let spin = 0
let sway = 0
let swayV = 0
let stripPhase = 0
let fanned = 0
let chimeCool = 0
let pataCool = 0
let menuT = 0
let arrivedT = 0
const leaves = new Leaves()

function cam(g: Game) {
  const L = g.layout
  return L.portrait
    ? frame({
        center: { x: 0, y: 0.42, z: 0 },
        halfW: 1.78, halfH: 2.25, dist: 6.6, yaw: 0.06, pitch: 0.05,
        screenY: 0.46
      }, L)
    : frame({
        center: { x: 0, y: 0.12, z: 0 },
        halfW: 2.7, halfH: 1.82, dist: 6.6, yaw: 0.06, pitch: 0.05,
        screenY: 0.48, screenX: 0.5
      }, L)
}

/** where the wind-reactive props live, per orientation */
function propSpots(g: Game) {
  return g.layout.portrait
    ? {
        furin: { x: 1.28, y: 2.32, z: -0.5 },
        strips: { x: -1.32, y: 2.30, z: -0.7 },
        wheel: { x: -1.48, y: -1.18, z: 0.9 }
      }
    : {
        furin: { x: 2.42, y: 1.62, z: -0.5 },
        strips: { x: -2.35, y: 1.70, z: -0.7 },
        wheel: { x: 2.30, y: -1.15, z: 0.9 }
      }
}

/** MODULE 11 — the uchiwa you made actually moves the air */
export const finishStage: Stage = {
  id: 'finish',
  enter(g, from) {
    wind = 0; rot = 0; rotV = 0; spin = 0; sway = 0; swayV = 0
    stripPhase = 0; chimeCool = 0; pataCool = 0
    arrivedT = 0
    menuT = from === 'finish-free' ? 0.01 : 0
    fanned = from === 'finish-free' ? 3 : 0
    leaves.clear()
    g.stageIndex = 10
    g.hintDelay = 2.0
    g.u.xf.y = 0.18
    if (g.made.length === 0 || g.made[g.made.length - 1] !== g.u.paperPattern) g.made.push(g.u.paperPattern)
    g.setCam(cam(g), 2.2)
    if (from !== 'finish') { sfx.done() }
  },
  update(g, dt) {
    g.setCam(cam(g), 2.4)
    const L = g.layout
    const p = g.input.p
    const u = g.u
    arrivedT += dt
    g.buttons = []

    // ---- waving the uchiwa ----
    let target = 0
    if (p.down) {
      target = clamp((p.x - L.w * 0.5) / (L.w * 0.42), -1, 1) * 0.62
    }
    const prevV = rotV
    rotV += (target - rot) * 46 * dt - rotV * 7.5 * dt
    rot += rotV * dt
    rot = clamp(rot, -0.85, 0.85)
    u.xf.rotZ = rot
    u.xf.rotY = rot * 0.5
    u.xf.x = -rot * 0.42

    const speed = Math.abs(rotV)
    wind = Math.max(wind * Math.exp(-2.1 * dt), clamp01(speed * 0.42))
    if (Math.abs(rotV) > 0.15) windDir = rotV > 0 ? 1 : -1
    fanned += clamp01(speed * 0.5) * dt

    // pata sound at each direction change of a real swing
    pataCool -= dt
    if (prevV * rotV < 0 && Math.abs(prevV) > 0.9 && pataCool <= 0) {
      pataCool = 0.12
      sfx.pata(clamp01(Math.abs(prevV) * 0.35))
      g.particles.dust(L.w * 0.5, L.h * 0.5, 3, 0.8)
    }

    // ---- props react ----
    spin += (0.6 + wind * 22) * dt * windDir
    const swayTarget = windDir * wind * 0.85
    swayV += (swayTarget - sway) * 26 * dt - swayV * 4.6 * dt
    sway += swayV * dt
    stripPhase += dt * (0.7 + wind * 3.4)
    leaves.update(g, dt, wind, windDir)
    setAmbientWind(clamp01(wind))

    chimeCool -= dt
    if (Math.abs(swayV) > 1.5 && chimeCool <= 0) {
      chimeCool = 0.55
      sfx.chirin(0.92 + Math.random() * 0.22)
    }

    if (wind > 0.55 && Math.random() < dt * 2.2) {
      g.say(['かぜ！', 'ふわっ！', 'すずしい！'][Math.floor(Math.random() * 3)],
        L.w * (0.3 + Math.random() * 0.4), L.h * 0.24, 0.85)
    }

    // ---- replay choices ----
    if (fanned > 1.1 || arrivedT > 9) menuT += dt
    if (menuT > 0) {
      const r = Math.min(L.w, L.h) * (L.portrait ? 0.108 : 0.1)
      const y = L.portrait
        ? L.h - Math.max(r * 1.85, L.safeBottom + r * 1.7)
        : L.h - Math.max(r * 1.8, L.safeBottom + r * 1.6)
      const gap = r * 2.7
      g.addButton({ id: 'again', x: L.w * 0.5 - gap, y, r, icon: 'again', label: 'もういっかい', tint: '#ffe8bd' })
      g.addButton({ id: 'para', x: L.w * 0.5, y, r, icon: 'para', label: 'パラパラだけ', tint: '#dff0c8' })
      g.addButton({ id: 'wind', x: L.w * 0.5 + gap, y, r, icon: 'wind', label: 'あおぐ', tint: '#cfe8f4', selected: true })
      const b = g.pickButton()
      if (b) {
        sfx.tap()
        if (b.id === 'again') { g.u.reset(g.newUchiwaSeed()); g.goto('intro') }
        else if (b.id === 'para') g.goto('fluff-free')
        else { menuT = 0.01; fanned = 0; arrivedT = 0; g.say('あおごう！', L.w * 0.5, L.h * 0.22) }
      }
    }

    g.hint = menuT > 1.2 ? { kind: 'none', x: 0, y: 0 }
      : { kind: 'swipeH', x: L.w * 0.5, y: L.h * (L.portrait ? 0.63 : 0.66), dx: 1, dy: 0 }
  },
  draw(g) {
    const L = g.layout
    const ctx = g.ctx
    const spots = propSpots(g)
    drawWorld(g, { props: false })

    // props sit in the same 3D space, so they scale with the camera
    const unit = Math.min(L.w, L.h)
    const ps = g.cam.project(spots.strips)
    if (ps.ok) drawStrips(ctx, ps.x, ps.y, ps.s * 0.2, stripPhase, 0.25 + wind)
    const pf = g.cam.project(spots.furin)
    if (pf.ok) drawFurin(ctx, pf.x, pf.y, pf.s * 0.2, sway, g.u.paperPattern)
    const pw = g.cam.project(spots.wheel)
    if (pw.ok) drawPinwheel(ctx, pw.x, pw.y, pw.s * 0.22, spin)

    leaves.draw(ctx)
    drawWindStreaks(ctx, g, wind, windDir)
    drawHint(g)
    for (const b of g.buttons) drawButton(ctx, b as Btn, g.time)
    if (menuT <= 0 && arrivedT > 1.0) {
      bigText(ctx, 'できた！ あおいでみて', L.w * 0.5, L.h * (L.portrait ? 0.12 : 0.11), unit * 0.055,
        clamp01((arrivedT - 1.0) * 2) * (0.55 + 0.25 * Math.sin(g.time * 2)))
    }
  }
}

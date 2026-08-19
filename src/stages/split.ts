import { Game, Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { frame } from '../game/framing'
import { drawSplitter } from '../game/tools'
import { sfx } from '../core/audio'
import { clamp01, lerp } from '../core/math'

let lastShu = 0
let doneT = -1

function cam(g: Game) {
  const L = g.layout
  return frame({
    center: { x: 0, y: 0.24, z: 0 },
    halfW: 0.52, halfH: 1.30,
    dist: 5.2, yaw: 0.38, pitch: 0.12,
    screenY: L.portrait ? 0.42 : 0.5,
    screenX: L.portrait ? 0.5 : 0.44
  }, L)
}

/** MODULE 2 — slide the tool down the pole and the notches appear */
export const splitStage: Stage = {
  id: 'split',
  enter(g) {
    lastShu = 0
    doneT = -1
    g.stageIndex = 1
    g.setCam(cam(g), 3.0)
    g.hintDelay = 2.6
  },
  update(g, dt) {
    g.setCam(cam(g), 3.0)
    const s = g.scene
    const L = g.layout
    const top = s.cam.project(g.u.toWorld({ x: 0, y: g.u.L * 0.98, z: 0 }))
    const bot = s.cam.project(g.u.toWorld({ x: 0, y: 0.06, z: 0 }))
    const span = Math.max(40, Math.hypot(top.x - bot.x, top.y - bot.y))

    const p = g.input.p
    if (p.down && doneT < 0) {
      // any downward-ish motion cuts; sideways counts a little too (no failure)
      const along = (p.dy * (bot.y - top.y) + p.dx * (bot.x - top.x)) / span
      const gain = Math.max(0, along) + Math.abs(p.dx) * 0.22
      if (gain > 0) {
        g.u.notch = clamp01(g.u.notch + gain / span)
        lastShu += gain
        if (lastShu > span / 9) {
          lastShu = 0
          sfx.shu(g.u.notch)
          const tip = tipPoint(g)
          g.particles.burstChips(tip.x, tip.y, 3, 0.7, '#efe0b4')
        }
      }
    }
    if (g.u.notch >= 0.985 && doneT < 0) {
      doneT = 0
      sfx.ok(2)
      g.say('シュッ！', L.w * 0.5, L.h * 0.2)
      g.flash = 0.35
    }
    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.1) g.goto('fluff')
    }
    const hy = lerp(top.y, bot.y, clamp01(g.u.notch))
    const hx = lerp(top.x, bot.x, clamp01(g.u.notch))
    g.hint = { kind: 'trace', x: hx, y: hy, dx: bot.x - top.x, dy: bot.y - top.y }
  },
  draw(g) {
    drawWorld(g)
    drawHint(g)
    const p = g.input.p
    const unit = Math.min(g.layout.w, g.layout.h)
    if (p.down && doneT < 0) {
      const t = tipPoint(g)
      drawSplitter(g.ctx, t.x, t.y, unit * 0.0034, 0.5)
    } else if (doneT < 0) {
      // tool waits at the top of the pole
      const s = g.scene
      const top = s.cam.project(g.u.toWorld({ x: 0.10, y: g.u.L * (0.99 - g.u.notch * 0.95), z: 0.10 }))
      drawSplitter(g.ctx, top.x, top.y, unit * 0.0034, 0.5 + Math.sin(g.time * 2) * 0.06)
    }
  }
}

function tipPoint(g: Game) {
  const off = g.tipOffset()
  return { x: g.input.p.x - off * 0.18, y: g.input.p.y - off }
}

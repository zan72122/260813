import { Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { sfx } from '../core/audio'
import { clamp01 } from '../core/math'
import { fanScreen } from '../game/fanmap'
import { fanCam } from './bow'
import { drawRoller } from '../game/tools'

type Phase = 'edge' | 'roll' | 'done'
let phase: Phase = 'edge'
let doneT = -1
let acc = 0
let soundAcc = 0

/** MODULE 10 — the rim strip, then the roller that lifts the ribs into view */
export const edgeStage: Stage = {
  id: 'edge',
  enter(g) {
    phase = 'edge'
    doneT = -1
    acc = 0
    soundAcc = 0
    g.stageIndex = 9
    g.hintDelay = 2.4
    g.u.edge = 0
    g.u.roller = 0
    g.setCam(fanCam(g, 0.2), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.2), 2.6)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    const unit = Math.min(L.w, L.h)

    if (phase === 'edge') {
      // trace anywhere near the rim; the strip snaps to the outline itself
      const head = fanScreen(g, clamp01(u.edge * 1.28), 1.0)
      if (p.down) {
        const d = Math.hypot(p.x - head.x, p.y - head.y)
        const slack = unit * 0.34
        const gain = d < slack ? p.moveDist : p.moveDist * 0.35
        u.edge = clamp01(u.edge + gain / (unit * 2.1))
        soundAcc += gain
        if (soundAcc > unit * 0.12) { soundAcc = 0; sfx.sara(0.7) }
      }
      if (u.edge >= 0.99) {
        u.edge = 1
        phase = 'roll'
        sfx.ok(1)
        g.say('へり ついた！', L.w * 0.5, L.h * 0.18, 0.9)
      }
      const nxt = fanScreen(g, clamp01(u.edge * 1.28 + 0.1), 1.0)
      g.hint = { kind: 'trace', x: head.x, y: head.y, dx: nxt.x - head.x, dy: nxt.y - head.y }
    } else if (phase === 'roll') {
      const top = fanScreen(g, 0.5, 0.95)
      const bot = fanScreen(g, 0.5, 0.2)
      const span = Math.max(60, Math.hypot(bot.x - top.x, bot.y - top.y))
      if (p.down) {
        const along = (p.dy * (bot.y - top.y) + p.dx * (bot.x - top.x)) / span
        if (along !== 0) {
          acc = clamp01(acc + Math.abs(along) / span)
          u.roller = acc
          soundAcc += Math.abs(along)
          if (soundAcc > span / 6) { soundAcc = 0; sfx.koro(0.9) }
        }
      }
      if (acc >= 0.985 && doneT < 0) {
        u.roller = 1
        doneT = 0
        phase = 'done'
        sfx.ok(5)
        sfx.done()
        g.flash = 0.4
        g.say('すじが でた！', L.w * 0.5, L.h * 0.18, 0.95)
        for (let i = 0; i < u.N; i += 2) {
          const q = g.cam.project(u.ribPoint(i, 0.8))
          if (q.ok) g.particles.burstSpark(q.x, q.y, 2, 0.8)
        }
      }
      g.hint = doneT >= 0 ? { kind: 'none', x: 0, y: 0 }
        : { kind: 'swipeV', x: top.x, y: top.y, dx: bot.x - top.x, dy: bot.y - top.y }
    }

    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.6) g.goto('finish')
    }
  },
  draw(g) {
    drawWorld(g)
    drawHint(g)
    const L = g.layout
    const unit = Math.min(L.w, L.h)
    const p = g.input.p
    if (phase === 'roll' && doneT < 0) {
      const anchor = fanScreen(g, 0.5, 0.95 - 0.75 * g.u.roller)
      const x = p.down ? p.x : anchor.x
      const y = p.down ? p.y - g.tipOffset() : anchor.y
      drawRoller(g.ctx, x, y, unit * 0.0034, 0)
    }
  }
}

import { Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { sfx } from '../core/audio'
import { clamp01 } from '../core/math'
import { fanScreen } from '../game/fanmap'
import { fanCam } from './bow'
import { drawMallet } from '../game/tools'
import { drawTrimGuide } from '../game/render'

const TAPS = 6
let taps = 0
let doneT = -1
let swing = 0

/** MODULE 9 — tap the mallet and the outline settles into an uchiwa shape */
export const hammerStage: Stage = {
  id: 'hammer',
  enter(g) {
    taps = 0
    doneT = -1
    swing = 0
    g.stageIndex = 8
    g.hintDelay = 2.2
    g.u.trim = 0
    g.setCam(fanCam(g, 0.3), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.3), 2.6)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    swing = Math.max(0, swing - dt * 4)

    if (p.justDown && doneT < 0) {
      taps++
      swing = 1
      sfx.ton()
      u.trim = clamp01(taps / TAPS)
      g.flash = 0.12
      const f = 0.5 + (taps % 2 ? 0.32 : -0.32) * (taps / TAPS)
      const q = fanScreen(g, clamp01(f), 0.97)
      g.particles.burstChips(q.x, q.y, 5, 0.9, '#f2e6c4')
      g.particles.dust(q.x, q.y, 3, 0.7)
      if (taps === 2) g.say('トン！', p.x, p.y - L.h * 0.1, 0.8)
      if (taps >= TAPS && doneT < 0) {
        doneT = 0
        u.trim = 1
        sfx.ok(5)
        g.flash = 0.35
        g.say('できた かたち！', L.w * 0.5, L.h * 0.18, 0.95)
      }
    }
    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.4) g.goto('edge')
    }
    const target = fanScreen(g, taps % 2 ? 0.75 : 0.25, 0.95)
    g.hint = doneT >= 0 ? { kind: 'none', x: 0, y: 0 }
      : { kind: 'tap', x: target.x, y: target.y, r: Math.min(L.w, L.h) * 0.12 }
  },
  draw(g) {
    drawWorld(g)
    if (g.u.trim < 0.999) drawTrimGuide(g.scene, g.u, 0.3 + 0.14 * Math.sin(g.time * 2.6))
    drawHint(g)
    const L = g.layout
    const unit = Math.min(L.w, L.h)
    const p = g.input.p
    if (doneT < 0) {
      const x = p.down ? p.x : L.w * (L.portrait ? 0.72 : 0.68)
      const y = p.down ? p.y : L.h * 0.66
      const a = 0.5 - swing * 0.55 + (p.down ? 0 : Math.sin(g.time * 1.8) * 0.05)
      drawMallet(g.ctx, x, y - g.tipOffset() * (0.7 + swing * 0.5), unit * 0.0032, a)
    }
  }
}

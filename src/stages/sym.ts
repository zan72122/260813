import { Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { sfx } from '../core/audio'
import { clamp01, lerp } from '../core/math'
import { fanScreen } from '../game/fanmap'
import { fanCam } from './bow'

let doneT = -1
let acc = 0
const TARGET_SPREAD = 2.55

/** MODULE 6 — pull the outer edges and the fan settles into a clean symmetry */
export const symStage: Stage = {
  id: 'sym',
  enter(g) {
    doneT = -1
    acc = 0
    g.stageIndex = 5
    g.hintDelay = 2.4
    g.u.spread = Math.min(g.u.spread, 2.3)
    g.setCam(fanCam(g, 0.1), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.1), 2.6)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    const mid = fanScreen(g, 0.5, 0.55)

    if (p.down && doneT < 0 && p.moveDist > 0.3) {
      // outward drag on either side widens the fan — direction is inferred,
      // so touching the "wrong" side still works
      const side = p.x < mid.x ? -1 : 1
      const outward = p.dx * side
      const gain = Math.max(0, outward) + Math.abs(p.dx) * 0.3
      acc = clamp01(acc + gain / (L.w * 0.55))
      u.sym = Math.max(u.sym, acc)
      u.spread = lerp(2.3, TARGET_SPREAD, clamp01(acc))
      if (Math.random() < dt * 9 * clamp01(gain / 4)) sfx.chi(Math.floor(acc * 9))
    }

    if (acc >= 0.985 && doneT < 0) {
      doneT = 0
      u.sym = 1
      u.spread = TARGET_SPREAD
      u.bloom = 0.85
      u.bloomV = 0
      g.shake(0.4)
      sfx.ok(4)
      sfx.fasa()
      g.flash = 0.32
      g.say('ぴったり！', L.w * 0.5, L.h * 0.19)
      for (let i = 0; i < u.N; i += 3) {
        const q = g.cam.project(u.ribPoint(i, 1))
        if (q.ok) g.particles.burstSpark(q.x, q.y, 3, 0.9)
      }
    }
    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.4) g.goto('glue')
    }

    const lp = fanScreen(g, 0.03, 0.9)
    const rp = fanScreen(g, 0.97, 0.9)
    const useLeft = Math.floor(g.time * 0.5) % 2 === 0
    g.hint = doneT >= 0 ? { kind: 'none', x: 0, y: 0 } : {
      kind: 'drag',
      x: useLeft ? lp.x : rp.x,
      y: useLeft ? lp.y : rp.y,
      dx: useLeft ? -1 : 1, dy: 0
    }
  },
  draw(g) {
    drawWorld(g)
    drawHint(g)
    // faint outline of where the fan is heading
    if (doneT < 0) {
      const ctx = g.ctx
      ctx.save()
      ctx.globalAlpha = 0.16 + 0.06 * Math.sin(g.time * 3)
      ctx.strokeStyle = '#fffbe8'
      ctx.lineWidth = Math.max(2, Math.min(g.layout.w, g.layout.h) * 0.006)
      ctx.setLineDash([10, 10])
      ctx.beginPath()
      for (let k = 0; k <= 24; k++) {
        const f = k / 24
        const p = fanScreen(g, f, 1.0)
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
      ctx.restore()
    }
  }
}

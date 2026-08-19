import { Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { sfx } from '../core/audio'
import { clamp01 } from '../core/math'
import { FanMap, binIndex, fanScreen } from '../game/fanmap'
import { fanCam } from './bow'
import { drawBrush } from '../game/tools'

let doneT = -1
let soundAcc = 0
const map = new FanMap()
let frameId = 0

/** MODULE 7 — brush the glue on; the bamboo goes slightly wet and shiny */
export const glueStage: Stage = {
  id: 'glue',
  enter(g) {
    doneT = -1
    soundAcc = 0
    g.stageIndex = 6
    g.hintDelay = 2.4
    g.setCam(fanCam(g, 0.25), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.25), 2.6)
    map.build(g, ++frameId, 0.2, 0.95)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    const off = g.tipOffset()
    const tip = { x: p.x, y: p.y - off }
    const radius = Math.min(L.w, L.h) * 0.13

    if (p.down && doneT < 0) {
      map.within(tip.x, tip.y, radius, (c, d) => {
        const k = 1 - d / radius
        const b = binIndex(c.f)
        u.glue[b] = clamp01(u.glue[b] + k * dt * 6.5)
      })
      soundAcc += p.moveDist
      if (soundAcc > L.w * 0.09) {
        soundAcc = 0
        sfx.sara(0.8)
        g.particles.dust(tip.x, tip.y, 2, 0.6)
      }
    }

    const avg = u.glue.reduce((a, b) => a + b, 0) / u.glue.length
    if (avg > 0.88 && doneT < 0) {
      doneT = 0
      for (let i = 0; i < u.glue.length; i++) u.glue[i] = 1
      sfx.ok(2)
      g.say('ぬれた！', L.w * 0.5, L.h * 0.19)
    }
    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.2) g.goto('paper')
    }

    // point at the driest part of the fan
    let worst = 0
    for (let i = 1; i < u.glue.length; i++) if (u.glue[i] < u.glue[worst]) worst = i
    const q = fanScreen(g, worst / (u.glue.length - 1), 0.6)
    g.hint = doneT >= 0 ? { kind: 'none', x: 0, y: 0 }
      : { kind: 'trace', x: q.x, y: q.y + off, dx: 1, dy: 0 }
  },
  draw(g) {
    drawWorld(g)
    drawHint(g)
    const p = g.input.p
    const L = g.layout
    const off = g.tipOffset()
    const unit = Math.min(L.w, L.h)
    if (doneT < 0) {
      // at rest the brush waits on the driest part of the fan, not on the floor
      const rest = fanScreen(g, 0.5, 0.72)
      const x = p.down ? p.x : rest.x
      const y = (p.down ? p.y : rest.y + off) - off
      drawBrush(g.ctx, x, y, unit * 0.0032, p.down ? 0.35 : 0.35 + Math.sin(g.time * 2) * 0.08)
    }
  }
}

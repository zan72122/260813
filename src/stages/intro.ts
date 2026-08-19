import { Game, Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { frame } from '../game/framing'
import { drawUchiwaGlyph } from '../game/ui'
import { sfx } from '../core/audio'
import { clamp01, smooth } from '../core/math'

let t = 0
let taken = false

function cam(g: Game) {
  const L = g.layout
  return frame({
    center: { x: 0, y: -0.1, z: 0 },
    halfW: 0.95, halfH: 1.66,
    dist: 6.2, yaw: 0.46, pitch: 0.17,
    screenY: L.portrait ? 0.46 : 0.5,
    screenX: L.portrait ? 0.5 : 0.46
  }, L)
}

/** MODULE 1 — a single pole of bamboo, and a glimpse of what it becomes */
export const introStage: Stage = {
  id: 'intro',
  enter(g, from) {
    t = 0
    taken = false
    if (from !== 'split') {
      g.u.reset(g.newUchiwaSeed())
      g.stageIndex = 0
    }
    g.setCam(cam(g), 3.2, true)
    g.hintDelay = 2.4
  },
  update(g, dt) {
    t += dt
    g.setCam(cam(g), 3.2)
    const s = g.scene
    const p = s.cam.project({ x: 0, y: 0.35, z: 0 })
    g.hint = { kind: 'tap', x: p.x, y: p.y, r: Math.min(g.layout.w, g.layout.h) * 0.13 }
    if (!taken && g.input.p.justDown && t > 0.9) {
      taken = true
      sfx.ok(0)
      g.particles.burstSpark(g.input.p.x, g.input.p.y, 12, 1)
      g.say('たけ！', undefined, g.layout.h * 0.2)
    }
    if (taken) {
      t += dt
      if (t > 1.5) g.goto('split')
    }
  },
  draw(g) {
    drawWorld(g)
    const s = g.scene
    const L = g.layout
    // the promise: the finished uchiwa ghosted over the raw pole, then gone
    const a = clamp01(smooth(1 - (t - 0.45) / 1.15)) * (t > 0.15 ? 1 : smooth(t / 0.15))
    if (a > 0.01 && !taken) {
      const p = s.cam.project({ x: 0, y: 0.42, z: 0 })
      const r = Math.min(L.w, L.h) * 0.19
      s.ctx.save()
      s.ctx.globalAlpha = a * 0.55
      drawUchiwaGlyph(s.ctx, p.x, p.y, r, 0, 0.06)
      s.ctx.restore()
      s.ctx.save()
      s.ctx.globalAlpha = a * 0.5
      s.ctx.strokeStyle = '#fff6d2'
      s.ctx.lineWidth = 3
      s.ctx.beginPath()
      s.ctx.arc(p.x, p.y, r * (1.05 + (1 - a) * 0.35), 0, Math.PI * 2)
      s.ctx.stroke()
      s.ctx.restore()
    }
    drawHint(g)
  }
}

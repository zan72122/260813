import { Stage } from '../game/game'
import { drawWorkshop } from '../game/render'
import { drawUchiwaGlyph, drawButton, bigText, Btn } from '../game/ui'
import { sfx } from '../core/audio'
import { frame } from '../game/framing'
import { TAU } from '../core/math'

export const titleStage: Stage = {
  id: 'title',
  enter(g) {
    g.u.reset(1234)
    g.setCam(frame({
      center: { x: 0, y: 0.1, z: 0 }, halfW: 1.0, halfH: 1.9, dist: 6, yaw: 0.4, pitch: 0.16
    }, g.layout), 6, true)
  },
  update(g) {
    const L = g.layout
    g.buttons = []
    const r = Math.min(L.w, L.h) * 0.13
    const cy = L.portrait ? L.h * 0.70 : L.h * 0.72
    const gap = r * 2.5
    g.addButton({ id: 'start', x: L.w * 0.5 - gap * 0.5, y: cy, r, icon: 'again', label: 'つくる', tint: '#ffe8bd' })
    g.addButton({ id: 'para', x: L.w * 0.5 + gap * 0.5, y: cy, r, icon: 'para', label: 'パラパラ', tint: '#dff0c8' })
    const b = g.pickButton()
    if (b) {
      g.unlock()
      sfx.tap()
      if (b.id === 'start') g.goto('intro')
      else g.goto('fluff-free')
    } else if (g.input.p.tapped) {
      g.unlock()
      sfx.tap()
      g.goto('intro')
    }
  },
  draw(g) {
    const s = g.scene
    const L = g.layout
    drawWorkshop(s, 0.3, L.portrait ? -1 : 1)
    const ctx = s.ctx
    const r = Math.min(L.w, L.h) * (L.portrait ? 0.21 : 0.2)
    const cx = L.w * 0.5
    const cy = L.portrait ? L.h * 0.40 : L.h * 0.40
    // gentle float
    const fy = Math.sin(g.time * 1.3) * r * 0.05
    const rot = Math.sin(g.time * 0.8) * 0.09
    ctx.save()
    ctx.globalAlpha = 0.28
    ctx.fillStyle = '#7a4d24'
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.45, r * 0.7, r * 0.14, 0, 0, TAU); ctx.fill()
    ctx.restore()
    drawUchiwaGlyph(ctx, cx, cy + fy, r, 0, rot)
    bigText(ctx, 'ぱらっ！ふわっ！', cx, cy - r * 1.72, Math.min(L.w, L.h) * 0.082)
    bigText(ctx, 'まるがめうちわ工房', cx, cy - r * 1.72 + Math.min(L.w, L.h) * 0.1, Math.min(L.w, L.h) * 0.066)
    for (const b of g.buttons) drawButton(ctx, b as Btn, g.time)
  }
}

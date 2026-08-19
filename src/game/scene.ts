import { Game } from './game'
import {
  drawWorkshop, drawBench, drawHandle, buildRibs, drawRibs, drawNotches,
  drawBow, drawThread, drawPaper, drawEdgeStrip, drawContactShadow
} from './render'
import { drawUchiwaGlyph } from './ui'
import { drawPulse, drawChevrons, drawHandHint } from './tools'
import { clamp01 } from '../core/math'

export type WorldOpts = {
  bowGhost?: boolean
  paperLift?: number
  paperAlpha?: number
  hideRibs?: boolean
  props?: boolean
}

/**
 * One single renderer for the whole workpiece, driven purely by the model.
 * Every stage shows the same object, so nothing ever pops or disappears when
 * the stage changes or the device is rotated.
 */
export function drawWorld(g: Game, o: WorldOpts = {}) {
  const s = g.scene
  drawWorkshop(s, 0, g.layout.portrait ? -1 : 1)
  if (o.props !== false) drawProps(g)
  drawBench(s)
  drawContactShadow(s, { x: g.u.pivot.x, y: -1.6, z: g.u.pivot.z + 0.1 }, 0.9 + g.u.progress * 0.05, 0.28, 0.3)
  drawHandle(s, g.u)
  drawThread(s, g.u, 'back')
  if (!o.hideRibs) {
    const ribs = buildRibs(s, g.u)
    drawRibs(s, g.u, ribs)
    drawNotches(s, g.u, ribs)
  }
  // once the washi is down the bow is physically hidden underneath it
  const paperDown = g.u.paperOn > 0.5 && (o.paperLift ?? 0) < 0.06
  if (o.bowGhost) drawBow(s, g.u, 1, true)
  if (!paperDown) drawBow(s, g.u, g.u.bow)
  drawThread(s, g.u, 'front')
  if (g.u.paperOn > 0.001) {
    drawPaper(s, g.u, o.paperLift ?? 0, o.paperAlpha ?? clamp01(g.u.paperOn * 1.4))
    drawEdgeStrip(s, g.u)
  }
}

/** finished uchiwa leaning at the back of the bench — the visual promise */
function drawProps(g: Game) {
  const s = g.scene
  const spots: [number, number, number][] = [
    [-2.95, -0.86, -3.1], [-2.05, -0.92, -3.5], [2.75, -0.86, -3.0]
  ]
  spots.forEach((p, i) => {
    const q = s.cam.project({ x: p[0], y: p[1], z: p[2] })
    if (!q.ok) return
    const r = q.s * 0.5
    if (r < 4) return
    s.ctx.save()
    s.ctx.globalAlpha = 0.72
    drawUchiwaGlyph(s.ctx, q.x, q.y, r, i + 1, (i - 1) * 0.22, 0.9)
    s.ctx.restore()
  })
}

/** idle guidance: no sentences, just a hand, a pulse and a direction */
export function drawHint(g: Game, force = false) {
  const h = g.hint
  if (h.kind === 'none') return
  const idle = g.input.idle
  if (!force && idle < g.hintDelay) return
  const a = force ? 1 : clamp01((idle - g.hintDelay) / 0.7)
  const s = g.scene
  const unit = Math.min(g.layout.w, g.layout.h)
  const ctx = s.ctx
  ctx.save()
  if (h.kind === 'tap') {
    drawPulse(ctx, h.x, h.y, h.r ?? unit * 0.11, g.time, a)
    drawHandHint(ctx, h.x + unit * 0.035, h.y + unit * 0.05, unit * 0.0022 * (1 + 0.05 * Math.sin(g.time * 5)), a * 0.9)
  } else if (h.kind === 'swipeH' || h.kind === 'swipeV' || h.kind === 'drag' || h.kind === 'trace') {
    const dx = h.dx ?? (h.kind === 'swipeV' ? 0 : 1)
    const dy = h.dy ?? (h.kind === 'swipeV' ? 1 : 0)
    const size = unit * 0.09
    drawChevrons(ctx, h.x, h.y, dx, dy, size, g.time, a)
    if (h.kind !== 'trace') {
      const wob = Math.sin(g.time * 3.2) * unit * 0.035
      drawHandHint(ctx, h.x + dx * wob, h.y + dy * wob + unit * 0.035, unit * 0.0022, a * 0.85)
    }
  }
  ctx.restore()
}

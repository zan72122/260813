import { Game } from './game'
import {
  drawWorkshop, drawBench, drawHandle, drawPole, buildRibs, drawRibs, drawNotches,
  drawBow, drawThread, drawPaper, drawEdgeStrip, drawContactShadow
} from './render'
import { drawUchiwaGlyph } from './ui'
import { drawPulse, drawChevrons, drawHandHint } from './tools'
import { clamp, clamp01, lerp } from '../core/math'

export type WorldOpts = {
  bowGhost?: boolean
  paperLift?: number
  paperAlpha?: number
  hideRibs?: boolean
  props?: boolean
  /** skip the room + bench, for stages that draw something between them */
  background?: boolean
}

/** just the room and the bench, so a stage can layer things behind the work */
export function drawWorkshopBack(g: Game) {
  const s = g.scene
  drawWorkshop(s, 0, g.layout.portrait ? -1 : 1)
  drawBench(s)
}

/**
 * One single renderer for the whole workpiece, driven purely by the model.
 * Every stage shows the same object, so nothing ever pops or disappears when
 * the stage changes or the device is rotated.
 */
export function drawWorld(g: Game, o: WorldOpts = {}) {
  const s = g.scene
  if (o.background !== false) {
    drawWorkshop(s, 0, g.layout.portrait ? -1 : 1)
    if (o.props !== false) drawProps(g)
    drawBench(s)
  }
  drawContactShadow(s, { x: g.u.pivot.x, y: -1.6, z: g.u.pivot.z + 0.1 }, 0.9 + g.u.progress * 0.05, 0.28, 0.3)
  drawHandle(s, g.u)
  drawThread(s, g.u, 'back')
  if (!o.hideRibs) {
    const ribs = buildRibs(s, g.u)
    drawRibs(s, g.u, ribs)
    // the pole is still one solid piece everywhere the tool has not reached,
    // so the seams appear only where the cut has actually travelled
    const uncut = clamp01(1 - g.u.notch) * clamp01(1 - g.u.progress * 0.5)
    if (uncut > 0.02) {
      drawPole(s, g.u, -0.02, g.u.L * uncut, 1, 1.0, lerp(1.0, 0.93, uncut))
    }
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
    [-3.6, -0.95, -4.3], [-2.6, -1.0, -4.7], [3.4, -0.95, -4.2]
  ]
  spots.forEach((p, i) => {
    const q = s.cam.project({ x: p[0], y: p[1], z: p[2] })
    if (!q.ok) return
    // background props must never grow to compete with the workpiece
    const r = Math.min(q.s * 0.42, Math.min(g.layout.w, g.layout.h) * 0.085)
    if (r < 4) return
    s.ctx.save()
    s.ctx.globalAlpha = 0.55
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
    // fall through to the hand below
    drawHandHint(ctx, h.x + unit * 0.035, h.y + unit * 0.05, unit * 0.0022 * (1 + 0.05 * Math.sin(g.time * 5)), a * 0.9)
  } else if (h.kind === 'swipeH' || h.kind === 'swipeV' || h.kind === 'drag' || h.kind === 'trace') {
    const rx = h.dx ?? (h.kind === 'swipeV' ? 0 : 1)
    const ry = h.dy ?? (h.kind === 'swipeV' ? 1 : 0)
    // stages pass raw pixel deltas here; without normalising, the hand flies
    // hundreds of screens away
    const len = Math.hypot(rx, ry) || 1
    const dx = rx / len, dy = ry / len
    const size = unit * 0.09
    drawChevrons(ctx, h.x, h.y, dx, dy, size, g.time, a)
    const wob = Math.sin(g.time * 3.2) * unit * 0.035
    const hx = clamp(h.x + dx * wob, unit * 0.06, g.layout.w - unit * 0.06)
    const hy = clamp(h.y + dy * wob + unit * 0.035, unit * 0.06, g.layout.h - unit * 0.06)
    drawHandHint(ctx, hx, hy, unit * 0.0022, a * 0.85)
  }
  ctx.restore()
}

import { Game, Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { frame, WORLD } from '../game/framing'
import { sfx } from '../core/audio'
import { clamp01, lerp } from '../core/math'
import { fanScreen } from '../game/fanmap'

let doneT = -1
let slideAcc = 0

export function fanCam(g: Game, tight = 0) {
  const L = g.layout
  // the untrimmed washi blank is wider than the ribs, so the frame grows for it
  const wide = Math.max(WORLD.halfWOpen, g.u.paperHalfWidth() * 1.06)
  return frame({
    center: { x: 0, y: lerp(0.02, 0.18, tight), z: 0 },
    halfW: lerp(wide, wide * 0.9, tight),
    halfH: lerp(WORLD.halfH, WORLD.halfH * 0.86, tight),
    dist: 6.4, yaw: 0.12, pitch: 0.07,
    screenY: L.portrait ? 0.40 : 0.47,
    screenX: L.portrait ? 0.5 : 0.44
  }, L)
}

/** MODULE 4 — slide the bow bamboo through the ribs so the fan holds its shape */
export const bowStage: Stage = {
  id: 'bow',
  enter(g) {
    doneT = -1
    slideAcc = 0
    g.stageIndex = 3
    g.hintDelay = 2.4
    g.setCam(fanCam(g, 0.2), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.2), 2.6)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    const a = fanScreen(g, 0, 0.30)
    const b = fanScreen(g, 1, 0.30)
    const span = Math.max(60, Math.hypot(b.x - a.x, b.y - a.y))

    if (p.down && doneT < 0) {
      // any rightward-ish drag pushes the bow through; the guide does the aiming
      const along = (p.dx * (b.x - a.x) + p.dy * (b.y - a.y)) / span
      if (along > 0) {
        u.bow = clamp01(u.bow + along / span)
        slideAcc += along
        if (slideAcc > span / 7) {
          slideAcc = 0
          sfx.slide(u.bow)
        }
        // the fan firms up as the bow goes in
        u.sym = Math.max(u.sym, u.bow * 0.35)
      }
    }
    if (u.bow >= 0.99 && doneT < 0) {
      doneT = 0
      u.bow = 1
      sfx.click(1)
      sfx.ok(1)
      g.flash = 0.3
      g.say('カチッ！', L.w * 0.5, L.h * 0.2)
      const mid = fanScreen(g, 0.5, 0.3)
      g.particles.burstSpark(mid.x, mid.y, 12, 1.1)
    }
    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.2) g.goto('thread')
    }
    const hx = lerp(a.x, b.x, clamp01(u.bow))
    const hy = lerp(a.y, b.y, clamp01(u.bow))
    g.hint = doneT >= 0 ? { kind: 'none', x: 0, y: 0 }
      : { kind: 'drag', x: hx, y: hy, dx: b.x - a.x, dy: b.y - a.y }
  },
  draw(g) {
    drawWorld(g, { bowGhost: g.u.bow < 0.99 })
    drawHint(g)
    // the leading tip of the bow, so the child can see what is moving
    if (g.u.bow > 0.001 && g.u.bow < 0.999) {
      const p = fanScreen(g, g.u.bow, 0.30)
      const r = Math.min(g.layout.w, g.layout.h) * 0.022
      const ctx = g.ctx
      ctx.save()
      ctx.fillStyle = '#e8c98a'
      ctx.strokeStyle = 'rgba(110,80,36,0.7)'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.restore()
    }
  }
}

import { Game, Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { sfx } from '../core/audio'
import { clamp01 } from '../core/math'
import { ribAtScreen, fanScreen } from '../game/fanmap'
import { fanCam } from './bow'
import { drawButton, drawPanel, Btn } from '../game/ui'
import { THREAD_COLORS } from '../game/render'
import { drawSpool } from '../game/tools'

let doneT = -1
let lastRib = -1
let hits = 0
let autoT = -1

function layoutButtons(g: Game) {
  const L = g.layout
  g.buttons = []
  const r = Math.min(L.w, L.h) * 0.052
  const n = THREAD_COLORS.length
  if (L.portrait) {
    const y = L.h - Math.max(r * 2.0, L.safeBottom + r * 1.8)
    const gap = r * 2.5
    for (let i = 0; i < n; i++) {
      g.addButton({
        id: 'c' + i, x: L.w * 0.5 + (i - (n - 1) / 2) * gap, y, r,
        threadColor: THREAD_COLORS[i].id === 'rainbow' ? 'rainbow' : THREAD_COLORS[i].css,
        selected: g.u.threadColor === i
      })
    }
  } else {
    const x = L.w - Math.max(r * 2.0, L.safeRight + r * 1.8)
    const gap = r * 2.5
    for (let i = 0; i < n; i++) {
      g.addButton({
        id: 'c' + i, x, y: L.h * 0.5 + (i - (n - 1) / 2) * gap, r,
        threadColor: THREAD_COLORS[i].id === 'rainbow' ? 'rainbow' : THREAD_COLORS[i].css,
        selected: g.u.threadColor === i
      })
    }
  }
}

/** MODULE 5 — zig-zag across the ribs and the thread picks them up one by one */
export const threadStage: Stage = {
  id: 'thread',
  enter(g) {
    doneT = -1
    lastRib = -1
    hits = 0
    autoT = -1
    g.stageIndex = 4
    g.hintDelay = 2.6
    g.setCam(fanCam(g, 0.35), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.35), 2.6)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    layoutButtons(g)

    const btn = g.pickButton()
    if (btn && btn.id.startsWith('c')) {
      u.threadColor = parseInt(btn.id.slice(1), 10)
      sfx.tap()
    }

    if (p.down && doneT < 0 && p.moveDist > 0.5) {
      const near = ribAtScreen(g, p.x, p.y)
      const slack = Math.min(L.w, L.h) * 0.31
      if (near.i >= 0 && near.d < slack) {
        const from = lastRib < 0 ? near.i : lastRib
        const step = near.i >= from ? 1 : -1
        for (let i = from; step > 0 ? i <= near.i : i >= near.i; i += step) {
          if (!u.threadHit[i]) {
            u.threadHit[i] = true
            hits++
            sfx.chi(i)
            const q = g.cam.project(u.ribPoint(i, 0.62))
            if (q.ok) g.particles.burstSpark(q.x, q.y, 2, 0.6, THREAD_COLORS[u.threadColor].css)
            // each captured rib is pulled toward its ideal place
            u.sym = clamp01(Math.max(u.sym, hits / u.N * 0.7))
          }
        }
        lastRib = near.i
      }
    }
    if (!p.down) lastRib = -1
    u.thread = clamp01(hits / u.N)

    // once nearly every rib is caught the thread finishes the last few by
    // itself — reaching the very outermost rib is not a skill test
    if (autoT < 0 && hits >= u.N - 3 && hits < u.N) autoT = 0
    if (autoT >= 0 && hits < u.N) {
      autoT += dt
      if (autoT > 0.16) {
        autoT = 0
        for (let i = 0; i < u.N; i++) {
          if (!u.threadHit[i]) {
            u.threadHit[i] = true
            hits++
            sfx.chi(i)
            const q = g.cam.project(u.ribPoint(i, 0.62))
            if (q.ok) g.particles.burstSpark(q.x, q.y, 3, 0.7, THREAD_COLORS[u.threadColor].css)
            break
          }
        }
      }
    }

    if (hits >= u.N && doneT < 0) {
      doneT = 0
      sfx.ok(3)
      g.flash = 0.25
      g.say('そろった！', L.w * 0.5, L.h * 0.19)
    }
    if (doneT >= 0) {
      doneT += dt
      if (doneT > 1.3) g.goto('sym')
    }

    // point at the first rib that still has no thread
    let target = -1
    for (let i = 0; i < u.N; i++) if (!u.threadHit[i]) { target = i; break }
    if (target >= 0 && doneT < 0) {
      const q = g.cam.project(u.ribPoint(target, 0.62))
      g.hint = { kind: 'trace', x: q.x, y: q.y, dx: 1, dy: 0 }
    } else g.hint = { kind: 'none', x: 0, y: 0 }
  },
  draw(g) {
    drawWorld(g)
    drawHint(g)
    const L = g.layout
    const ctx = g.ctx
    if (g.buttons.length) {
      const bs = g.buttons
      const r = bs[0].r
      const a = bs[0], z = bs[bs.length - 1]
      if (L.portrait) drawPanel(ctx, a.x - r * 1.5, a.y - r * 1.5, (z.x - a.x) + r * 3, r * 3, r, 0.45)
      else drawPanel(ctx, a.x - r * 1.5, a.y - r * 1.5, r * 3, (z.y - a.y) + r * 3, r, 0.45)
    }
    for (const b of g.buttons) drawButton(ctx, b as Btn, g.time)
    // spool trailing the finger
    if (g.input.p.down && g.u.thread < 1) {
      const col = THREAD_COLORS[g.u.threadColor]
      const off = g.tipOffset()
      drawSpool(ctx, g.input.p.x + off * 0.42, g.input.p.y + off * 0.5,
        Math.min(L.w, L.h) * 0.0028, col.id === 'rainbow' ? '#eab9e0' : col.css, 0.3)
    }
    // where the thread should go next
    if (g.u.thread < 1) {
      const a = fanScreen(g, 0, 0.62)
      const b = fanScreen(g, 1, 0.62)
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.setLineDash([Math.min(L.w, L.h) * 0.02, Math.min(L.w, L.h) * 0.02])
      ctx.strokeStyle = '#fffbe8'
      ctx.lineWidth = Math.max(2, Math.min(L.w, L.h) * 0.006)
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.restore()
    }
  }
}

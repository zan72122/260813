import { Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { sfx } from '../core/audio'
import { clamp01, lerp, smooth } from '../core/math'
import { FanMap, binIndex, fanScreen } from '../game/fanmap'
import { fanCam } from './bow'
import { drawButton, drawPanel, Btn } from '../game/ui'
import { PATTERNS } from '../core/textures'
import { drawPaper } from '../game/render'

type Phase = 'choose' | 'place' | 'smooth' | 'done'
let phase: Phase = 'choose'
let lift = 0.9
let doneT = -1
let soundAcc = 0
const map = new FanMap()
let frameId = 0

const PICK = 6   // how many patterns are offered

/** MODULE 8 — choose the washi, lower it on, then stroke the wrinkles out */
export const paperStage: Stage = {
  id: 'paper',
  enter(g) {
    phase = 'choose'
    lift = 0.9
    doneT = -1
    soundAcc = 0
    g.stageIndex = 7
    g.hintDelay = 2.6
    g.u.paperOn = 0
    for (let i = 0; i < g.u.wrinkle.length; i++) g.u.wrinkle[i] = 0
    g.setCam(fanCam(g, 0.15), 2.6)
  },
  update(g, dt) {
    g.setCam(fanCam(g, 0.15), 2.6)
    map.build(g, ++frameId, 0.18, 0.95)
    const u = g.u
    const p = g.input.p
    const L = g.layout
    const unit = Math.min(L.w, L.h)
    g.buttons = []

    if (phase === 'choose') {
      const r = unit * (L.portrait ? 0.062 : 0.056)
      if (L.portrait) {
        const y = L.h - Math.max(r * 2.1, L.safeBottom + r * 1.9)
        for (let i = 0; i < PICK; i++) {
          g.addButton({
            id: 'p' + i, x: L.w * 0.5 + (i - (PICK - 1) / 2) * r * 2.28, y, r,
            patternIndex: i, selected: u.paperPattern === i
          })
        }
      } else {
        const x = L.w - Math.max(r * 2.1, L.safeRight + r * 1.9)
        // nudged below the sound button so the two never collide
        const cy = L.h * 0.5 + Math.min(L.h * 0.04, r * 0.9)
        for (let i = 0; i < PICK; i++) {
          g.addButton({
            id: 'p' + i, x, y: cy + (i - (PICK - 1) / 2) * r * 2.28, r,
            patternIndex: i, selected: u.paperPattern === i
          })
        }
      }
      const b = g.pickButton()
      if (b) {
        u.paperPattern = parseInt(b.id.slice(1), 10)
        sfx.tap()
        phase = 'place'
        u.paperOn = 1
        g.say('えらんだ！', L.w * 0.5, L.h * 0.18, 0.9)
      }
    } else if (phase === 'place') {
      // drag the sheet down; it snaps onto the ribs when it gets close
      if (p.down) {
        lift = clamp01(lift - (p.dy / (L.h * 0.42)))
        if (p.dy > 0) soundAcc += p.dy
        if (soundAcc > L.h * 0.09) { soundAcc = 0; sfx.sara(0.5) }
      }
      if (lift < 0.22) {
        lift = Math.max(0, lift - dt * 2.2)
        if (lift <= 0.002) {
          lift = 0
          phase = 'smooth'
          sfx.pon()
          g.flash = 0.22
          g.say('ぺたっ！', L.w * 0.5, L.h * 0.18)
          const c = fanScreen(g, 0.5, 0.5)
          g.particles.dust(c.x, c.y, 10, 1.1)
        }
      }
      const c = fanScreen(g, 0.5, 0.55)
      g.hint = { kind: 'swipeV', x: c.x, y: c.y - L.h * 0.16, dx: 0, dy: 1 }
    } else if (phase === 'smooth') {
      const radius = unit * 0.15
      if (p.down) {
        map.within(p.x, p.y - g.tipOffset() * 0.75, radius, (c, d) => {
          const k = 1 - d / radius
          const b = binIndex(c.f)
          // the wrinkle is pushed out as far as the finger has reached
          const val = clamp01(c.u * 1.25) * (0.62 + 0.38 * k)
          u.wrinkle[b] = Math.max(u.wrinkle[b], val)
          // the sheet is one piece: smoothing bleeds into the neighbours
          if (b > 0) u.wrinkle[b - 1] = Math.max(u.wrinkle[b - 1], val * 0.8)
          if (b < u.wrinkle.length - 1) u.wrinkle[b + 1] = Math.max(u.wrinkle[b + 1], val * 0.8)
        })
        soundAcc += p.moveDist
        if (soundAcc > L.w * 0.11) { soundAcc = 0; sfx.sara(1.1) }
      }
      const avg = u.wrinkle.reduce((a, b) => a + b, 0) / u.wrinkle.length
      if (avg > 0.78 && doneT < 0) {
        for (let i = 0; i < u.wrinkle.length; i++) u.wrinkle[i] = 1
        doneT = 0
        phase = 'done'
        sfx.ok(4)
        g.say('つるつる！', L.w * 0.5, L.h * 0.18)
      }
      let worst = 0
      for (let i = 1; i < u.wrinkle.length; i++) if (u.wrinkle[i] < u.wrinkle[worst]) worst = i
      const from = fanScreen(g, worst / (u.wrinkle.length - 1), 0.35)
      const to = fanScreen(g, worst / (u.wrinkle.length - 1), 0.9)
      g.hint = { kind: 'trace', x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y }
    }

    if (doneT >= 0) {
      doneT += dt
      g.hint = { kind: 'none', x: 0, y: 0 }
      if (doneT > 1.3) g.goto('hammer')
    }
  },
  draw(g) {
    const L = g.layout
    const ctx = g.ctx
    drawWorld(g, { paperLift: phase === 'place' ? lift * 0.34 : 0 })
    if (phase === 'choose') {
      // preview sheet hovering above, so the choice is visible in context
      const u = g.u
      const keep = u.paperOn
      u.paperOn = 1
      drawPaper(g.scene, u, 0.1 + Math.sin(g.time * 1.6) * 0.012, 0.46, 0.9)
      u.paperOn = keep
      if (g.buttons.length) {
        const bs = g.buttons
        const r = bs[0].r
        const a = bs[0], z = bs[bs.length - 1]
        if (L.portrait) drawPanel(ctx, a.x - r * 1.45, a.y - r * 1.45, (z.x - a.x) + r * 2.9, r * 2.9, r, 0.45)
        else drawPanel(ctx, a.x - r * 1.45, a.y - r * 1.45, r * 2.9, (z.y - a.y) + r * 2.9, r, 0.45)
      }
      for (const b of g.buttons) drawButton(ctx, b as Btn, g.time)
    }
    drawHint(g)
  }
}

export const PATTERN_COUNT = Math.min(PICK, PATTERNS.length)
export const paperEase = (t: number) => smooth(lerp(0, 1, t))

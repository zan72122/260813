import { Game, Stage } from '../game/game'
import { drawWorld, drawHint } from '../game/scene'
import { frame } from '../game/framing'
import { sfx } from '../core/audio'
import { clamp, clamp01, lerp, smooth, Rng } from '../core/math'
import { drawButton, bigText, Btn } from '../game/ui'

type S = {
  energy: number
  bloomed: boolean
  bloomT: number
  free: boolean
  popCount: number
  lastDir: number
  flipCool: number
  idleWiggle: number
  rounds: number
}

const st: S = {
  energy: 0, bloomed: false, bloomT: -1, free: false,
  popCount: 0, lastDir: 0, flipCool: 0, idleWiggle: 0, rounds: 0
}

/** how much finger travel (in screen widths) opens the whole fan */
const TRAVEL_WIDTHS = 3.2

function openness(g: Game) { return clamp01(g.u.progress / g.u.N) }

function cam(g: Game) {
  const L = g.layout
  const q = openness(g)
  const b = st.bloomT >= 0 ? smooth(clamp01(st.bloomT / 0.75)) : 0
  // continuous dolly: tight on the splitting fibre, then pull back for the reveal
  const k = Math.max(q, b)
  const halfW = lerp(0.48, 1.72, smooth(k))
  const halfH = lerp(1.22, 1.54, smooth(k))
  const yaw = lerp(0.40, 0.13, smooth(k))
  const pitch = lerp(0.13, 0.06, smooth(k))
  const dist = lerp(4.8, 6.4, smooth(k))
  return frame({
    center: { x: 0, y: lerp(0.32, 0.02, k), z: 0 },
    halfW, halfH, dist, yaw, pitch,
    screenY: L.portrait ? 0.43 : 0.5,
    screenX: L.portrait ? 0.5 : (st.free ? 0.5 : 0.46)
  }, L)
}

function reorder(u: Game['u'], rng: Rng) {
  const mode = rng.next()
  const N = u.N
  const ranks = new Array(N).fill(0)
  if (mode < 0.55) {
    const mid = (N - 1) / 2
    const seq: number[] = []
    for (let k = 0; k <= N * 2; k++) {
      const cand = k % 2 === 0 ? Math.round(mid - k / 2) : Math.round(mid + (k + 1) / 2)
      if (cand >= 0 && cand < N && !seq.includes(cand)) seq.push(cand)
    }
    seq.forEach((i, r) => (ranks[i] = r))
  } else if (mode < 0.8) {
    for (let i = 0; i < N; i++) ranks[i] = i
  } else {
    for (let i = 0; i < N; i++) ranks[i] = N - 1 - i
  }
  for (let i = 0; i < N; i++) u.ribs[i].rank = ranks[i]
}

function restart(g: Game) {
  const seed = g.newUchiwaSeed()
  g.u.reset(seed)
  const rng = new Rng(seed)
  g.u.notch = 1
  g.u.bambooHue = rng.next() < 0.5 ? rng.range(0, 0.25) : rng.range(0.6, 1)
  g.u.spread = rng.range(2.25, 2.72)
  g.u.threadColor = Math.floor(rng.range(0, 5))
  reorder(g.u, rng)
  st.energy = 0
  st.bloomed = false
  st.bloomT = -1
  st.popCount = 0
  st.rounds++
}

function make(id: string, free: boolean): Stage {
  return {
    id,
    enter(g, from) {
      st.free = free
      st.energy = 0
      st.bloomed = false
      st.bloomT = -1
      st.popCount = 0
      st.lastDir = 0
      st.flipCool = 0
      g.stageIndex = 2
      g.hintDelay = 2.2
      if (free && from !== id) restart(g)
      else g.u.notch = 1
      g.setCam(cam(g), 3.0, from === 'title')
    },

    update(g, dt) {
      const L = g.layout
      const u = g.u
      const p = g.input.p
      g.setCam(cam(g), 3.4)
      g.buttons = []

      // ---- finger -> fibre, 1:1 ----
      let dirNow = 0
      if (p.down && !st.bloomed) {
        const travel = Math.abs(p.dx) + Math.abs(p.dy) * 0.45
        st.energy += travel / (L.w * TRAVEL_WIDTHS)
        dirNow = Math.sign(p.dx)
        if (dirNow !== 0 && st.lastDir !== 0 && dirNow !== st.lastDir && st.flipCool <= 0 && Math.abs(p.vx) > L.w * 0.25) {
          // rewarding the back-and-forth twist
          st.energy += 0.022
          st.flipCool = 0.12
        }
        if (dirNow !== 0) st.lastDir = dirNow
      }
      if (p.justDown && !st.bloomed) st.energy += 0.012
      st.flipCool = Math.max(0, st.flipCool - dt)

      // acceleration curve: one rib, then three, then six, then a cascade
      const e = clamp01(st.energy)
      const target = (0.18 * e + 0.82 * Math.pow(e, 1.35)) * u.N
      u.progress = Math.max(u.progress, target)

      // live twist so the fan answers the finger even between pops
      const want = clamp(p.down ? p.vx / (L.w * 0.9) : 0, -1, 1)
      u.twist += (want - u.twist) * (1 - Math.exp(-12 * dt))

      // idle nudge — the bamboo asks to be touched
      if (g.input.idle > g.hintDelay && !st.bloomed) {
        st.idleWiggle += dt
        u.twist += Math.sin(st.idleWiggle * 4.2) * 0.1 * dt * 6
      }

      u.step(dt, i => onPop(g, i))

      // ---- the "fasa" bloom ----
      if (!st.bloomed && u.progress >= u.N - 0.02) {
        st.bloomed = true
        st.bloomT = 0
        u.bloom = 1
        u.progress = u.N
        sfx.fasa()
        g.flash = 0.5
        g.say('ひろがった！', L.w * 0.5, L.h * (L.portrait ? 0.2 : 0.18), 1.15)
        for (let i = 0; i < u.N; i += 2) {
          const s = g.scene
          const q = s.cam.project(u.ribPoint(i, 1))
          if (q.ok) g.particles.burstSpark(q.x, q.y, 4, 1.1, '#fff3c0')
        }
      }
      if (st.bloomT >= 0) st.bloomT += dt

      // ---- what happens after the bloom ----
      if (st.bloomed) {
        if (!free) {
          if (st.bloomT > 1.7) g.goto('bow')
        } else {
          const r = Math.min(L.w, L.h) * 0.115
          const y = L.portrait ? L.h - Math.max(r * 1.7, L.safeBottom + r * 1.5) : L.h - r * 1.7
          g.addButton({ id: 'again', x: L.w * 0.5 + r * 1.5, y, r, icon: 'again', label: 'もういっかい', tint: '#ffe8bd' })
          g.addButton({ id: 'home', x: L.w * 0.5 - r * 1.5, y, r, icon: 'home', label: 'もどる', tint: '#dfe9f2' })
          const b = g.pickButton()
          if (b?.id === 'again') { sfx.tap(); restart(g) }
          else if (b?.id === 'home') { sfx.tap(); g.goto('title') }
          else if (p.tapped && st.bloomT > 0.9) { restart(g) }
        }
      }

      // ---- hint ----
      const s = g.scene
      const anchor = s.cam.project(u.ribPoint(Math.floor(u.N / 2), 0.62))
      g.hint = st.bloomed
        ? { kind: 'none', x: 0, y: 0 }
        : { kind: 'swipeH', x: anchor.x, y: Math.min(anchor.y + L.h * 0.14, L.h * 0.86), dx: 1, dy: 0 }
    },

    draw(g) {
      drawWorld(g, { props: true })
      const L = g.layout
      const ctx = g.ctx
      drawHint(g)
      if (st.free) {
        for (const b of g.buttons) drawButton(ctx, b as Btn, g.time)
        if (!st.bloomed) {
          bigText(ctx, 'ゆびを　よこに！', L.w * 0.5, L.h * (L.portrait ? 0.09 : 0.1),
            Math.min(L.w, L.h) * 0.055, 0.75)
        }
      }
    }
  }
}

function onPop(g: Game, i: number) {
  const u = g.u
  st.popCount++
  sfx.para(i, 0.85)
  const s = g.scene
  const q = s.cam.project(u.ribPoint(i, 0.92))
  if (q.ok) {
    g.particles.burstChips(q.x, q.y, 2, 0.75, '#efe2ba')
    g.particles.burstSpark(q.x, q.y, 3, 0.7, '#fff6d0')
  }
  const opened = u.openCount()
  if (st.popCount === 1) g.say('パラッ', q.x, q.y - g.layout.h * 0.05, 0.85)
  else if (opened === 6 || opened === 12) g.say('パラパラ！', q.x, q.y - g.layout.h * 0.05, 0.9)
}

export const fluffStage = make('fluff', false)
export const fluffFreeStage = make('fluff-free', true)

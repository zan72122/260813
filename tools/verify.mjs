import { launch, newPage, shot, swipe, tap, state, VIEWPORTS } from './shot.mjs'

const b = await launch()
const out = []

// --- audio actually starts on a real gesture ---
{
  const page = await newPage(b, 'iphone-p')
  await tap(page, 195, 500)
  await page.waitForTimeout(400)
  const a = await page.evaluate(() => {
    const g = window.__game
    return { ready: !g.muted(), stage: g.curId }
  })
  out.push('audio unlocked on first tap: ' + JSON.stringify(a))
  await page.context().close()
}

// --- the synth actually produces sound (nodes get created and started) ---
{
  const page = await newPage(b, 'iphone-p')
  await page.evaluate(() => {
    window.__counts = { osc: 0, buf: 0 }
    const AC = window.AudioContext.prototype
    const o = AC.createOscillator, s = AC.createBufferSource
    AC.createOscillator = function () { window.__counts.osc++; return o.apply(this, arguments) }
    AC.createBufferSource = function () { window.__counts.buf++; return s.apply(this, arguments) }
  })
  await tap(page, 195, 500)
  await page.waitForTimeout(500)
  await page.evaluate(() => { window.__game.goto('fluff-free'); window.__counts = { osc: 0, buf: 0 } })
  await page.waitForTimeout(300)
  for (let i = 0; i < 8; i++) {
    await swipe(page, [60, 640], [330, 640], 10, 5)
    await swipe(page, [330, 640], [60, 640], 10, 5)
    if ((await state(page)).open >= 20) break
  }
  await page.waitForTimeout(700)
  const c = await page.evaluate(() => window.__counts)
  out.push('audio nodes fired in one para-para round: ' + JSON.stringify(c) +
    (c.osc + c.buf > 20 ? ' (ok)' : ' (SUSPICIOUS — synth may be silent)'))
  await page.context().close()
}

// --- para-para toy mode, ten consecutive rounds ---
{
  const page = await newPage(b, 'iphone-p')
  await page.evaluate(() => window.__game.goto('fluff-free'))
  await page.waitForTimeout(400)
  const rounds = []
  for (let r = 0; r < 10; r++) {
    let guard = 0
    while (guard++ < 14) {
      const s = await state(page)
      if (s.open >= 20) break
      await swipe(page, [60, 640], [330, 640], 10, 5)
      await swipe(page, [330, 640], [60, 640], 10, 5)
    }
    const s = await state(page)
    const look = await page.evaluate(() => ({
      hue: +window.__game.u.bambooHue.toFixed(2),
      spread: +window.__game.u.spread.toFixed(2),
      rank0: window.__game.u.ribs[0].rank
    }))
    rounds.push(`${s.open}/${20} h=${look.hue} sp=${look.spread} r0=${look.rank0}`)
    if (r === 0) await shot(page, 'vf-para-round1')
    await page.waitForTimeout(1300)
    await tap(page, 195, 400)          // tap anywhere restarts
    await page.waitForTimeout(500)
  }
  out.push('para-para 10 rounds: ' + rounds.join(' | '))
  out.push('errors after 10 rounds: ' + JSON.stringify(page.errors))
  await page.context().close()
}

// --- every viewport reaches the wind stage and shows the choices ---
for (const vp of Object.keys(VIEWPORTS)) {
  const page = await newPage(b, vp)
  const { width: W, height: H } = VIEWPORTS[vp]
  await page.evaluate(() => {
    const g = window.__game
    const u = g.u
    u.progress = u.N; u.ribs.forEach(r => { r.t = 1 }); u.notch = 1; u.sym = 1
    u.bow = 1; u.thread = 1; u.threadHit.fill(true); u.glue.fill(1)
    u.paperOn = 1; u.wrinkle.fill(1); u.trim = 1; u.edge = 1; u.roller = 1
    g.goto('finish')
    u.progress = u.N; u.ribs.forEach(r => { r.t = 1 }); u.sym = 1
    u.paperOn = 1; u.wrinkle.fill(1); u.trim = 1; u.edge = 1; u.roller = 1
    u.bow = 1; u.thread = 1; u.threadHit.fill(true); u.glue.fill(1)
  })
  await page.waitForTimeout(1200)
  for (let i = 0; i < 8; i++) {
    await swipe(page, [W * 0.28, H * 0.62], [W * 0.72, H * 0.62], 6, 4)
    await swipe(page, [W * 0.72, H * 0.62], [W * 0.28, H * 0.62], 6, 4)
  }
  await page.waitForTimeout(900)
  const info = await page.evaluate(() => ({
    buttons: window.__game.buttons.map(b => b.id),
    inside: window.__game.buttons.every(b =>
      b.x - b.r > 0 && b.x + b.r < innerWidth && b.y - b.r > 0 && b.y + b.r < innerHeight)
  }))
  out.push(`${vp}: wind choices ${JSON.stringify(info.buttons)} all on screen=${info.inside}`)
  await shot(page, 'vf-wind-' + vp)
  await page.context().close()
}

// --- system and title buttons are reachable, and never stolen by "tap anywhere" ---
for (const vp of ['iphone-p', 'ipad-l']) {
  const page = await newPage(b, vp)
  await page.waitForTimeout(700)
  const btns = await page.evaluate(() => window.__game.buttons.map(x => ({ id: x.id, x: x.x, y: x.y })))
  const para = btns.find(x => x.id === 'para')
  await tap(page, para.x, para.y)
  await page.waitForTimeout(600)
  const s1 = (await state(page)).stage
  await page.context().close()

  const p2 = await newPage(b, vp)
  await p2.waitForTimeout(600)
  const mb = await p2.evaluate(() => {
    const g = window.__game, L = g.layout
    const r = Math.max(16, Math.min(L.w, L.h) * 0.042)
    return [L.portrait ? L.w - r * 1.5 : r * 1.5, r * 1.5]
  })
  await tap(p2, mb[0], mb[1])
  await p2.waitForTimeout(400)
  const m = await p2.evaluate(() => ({ muted: window.__game.muted(), stage: window.__game.curId }))
  out.push(`${vp}: title para button -> ${s1}; mute -> muted=${m.muted} stage=${m.stage}`)
  await p2.context().close()
}

// --- the idle hand hint always lands on screen ---
for (const vp of ['iphone-p', 'ipad-l']) {
  const page = await newPage(b, vp)
  const bad = []
  for (const st of ['split', 'bow', 'thread', 'sym', 'glue', 'paper', 'hammer', 'edge']) {
    await page.evaluate((s) => {
      const g = window.__game, u = g.u
      u.progress = u.N; u.ribs.forEach(r => { r.t = 1 }); u.notch = 1; u.sym = 1
      u.bow = 1; u.thread = 1; u.threadHit.fill(true); u.glue.fill(1)
      if (s === 'hammer' || s === 'edge') { u.paperOn = 1; u.wrinkle.fill(1); u.trim = 1 }
      g.goto(s)
      if (s === 'split') { u.notch = 0; u.progress = 0; u.ribs.forEach(r => { r.t = 0 }) }
      g.input.idle = 8
    }, st)
    await page.waitForTimeout(800)
    const h = await page.evaluate(() => {
      const g = window.__game, h = g.hint
      const unit = Math.min(g.layout.w, g.layout.h)
      const len = Math.hypot(h.dx ?? 0, h.dy ?? 0) || 1
      const wob = unit * 0.035
      return {
        kind: h.kind,
        hx: h.x + ((h.dx ?? 0) / len) * wob,
        hy: h.y + ((h.dy ?? 0) / len) * wob + unit * 0.035,
        w: innerWidth, hgt: innerHeight
      }
    })
    if (h.kind !== 'none' && (h.hx < 0 || h.hx > h.w || h.hy < 0 || h.hy > h.hgt)) bad.push(st)
  }
  out.push(`${vp}: hints drawn off screen -> ${bad.length ? bad.join(',') : 'none'}`)
  await page.context().close()
}

// --- ribs never clip off screen in any orientation ---
for (const vp of Object.keys(VIEWPORTS)) {
  const page = await newPage(b, vp)
  await page.evaluate(() => {
    const g = window.__game
    g.goto('sym')
    const u = g.u
    u.progress = u.N; u.ribs.forEach(r => { r.t = 1 }); u.notch = 1; u.sym = 1; u.spread = 2.55
  })
  await page.waitForTimeout(1800)
  const fit = await page.evaluate(() => {
    const g = window.__game
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
    for (let i = 0; i < g.u.N; i++) {
      for (const uu of [0, 0.5, 1]) {
        const p = g.cam.project(g.u.ribPoint(i, uu))
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
    }
    return { minX: Math.round(minX), maxX: Math.round(maxX), minY: Math.round(minY), maxY: Math.round(maxY), w: innerWidth, h: innerHeight }
  })
  const ok = fit.minX >= 0 && fit.maxX <= fit.w && fit.minY >= 0 && fit.maxY <= fit.h
  out.push(`${vp}: fan bbox x[${fit.minX},${fit.maxX}] y[${fit.minY},${fit.maxY}] in ${fit.w}x${fit.h} -> ${ok ? 'FITS' : 'CLIPPED'}`)
  await page.context().close()
}

console.log(out.join('\n'))
await b.close()

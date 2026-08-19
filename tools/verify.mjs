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

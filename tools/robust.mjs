import { launch, newPage, shot, swipe, tap, state, VIEWPORTS } from './shot.mjs'

const b = await launch()
const page = await newPage(b, 'iphone-p')
const out = []
const P = { width: 390, height: 844 }
const L = { width: 844, height: 390 }

// 1. hammering the title with rapid taps
for (let i = 0; i < 12; i++) await tap(page, 100 + i * 15, 300 + i * 20)
out.push('rapid taps at title -> ' + (await state(page)).stage)

// jump straight into the free para toy
await page.evaluate(() => window.__game.goto('fluff-free'))
await page.waitForTimeout(400)

// 2. reverse + high-speed swipes, releasing mid-gesture
for (let i = 0; i < 4; i++) {
  await swipe(page, [350, 500], [40, 500], 4, 2)     // very fast right->left
  await page.mouse.move(40, 500); await page.mouse.down(); await page.mouse.move(300, 520)
  await page.mouse.move(60, 480)                      // release without pointerup on target
  await page.mouse.up()
}
const s1 = await state(page)
out.push('after chaotic swipes: progress=' + s1.progress + ' open=' + s1.open)

// 3. rotate the device mid-gesture
await page.mouse.move(200, 600); await page.mouse.down(); await page.mouse.move(320, 600)
await page.setViewportSize(L)
await page.waitForTimeout(250)
await page.mouse.move(500, 300)
await page.mouse.up()
const s2 = await state(page)
out.push('after rotate mid-drag: progress=' + s2.progress + ' stage=' + s2.stage)
await shot(page, 'rb-rotated-landscape')

// 4. rotate back and confirm nothing was lost
await page.setViewportSize(P)
await page.waitForTimeout(300)
const s3 = await state(page)
out.push('after rotate back: progress=' + s3.progress + ' (was ' + s2.progress + ')')

// 5. mid-production rotation with full state
await page.evaluate(() => {
  const g = window.__game
  g.goto('paper')
  const u = g.u
  u.progress = u.N; u.ribs.forEach(r => r.t = 1); u.notch = 1
  u.bow = 1; u.thread = 1; u.threadHit.fill(true); u.sym = 1; u.glue.fill(1)
})
await page.waitForTimeout(500)
const btn = await page.evaluate(() => { const b = window.__game.buttons[1]; return b ? [b.x, b.y] : null })
if (btn) await tap(page, btn[0], btn[1])
await page.waitForTimeout(400)
for (let i = 0; i < 5; i++) await swipe(page, [195, 300], [195, 700], 12, 6)
await page.waitForTimeout(400)
const before = await state(page)
await page.setViewportSize(L); await page.waitForTimeout(400)
const after = await state(page)
out.push('paper stage rotate: paper ' + before.paper + '->' + after.paper +
  ' wrinkle ' + before.wrinkle + '->' + after.wrinkle + ' pattern kept=' +
  await page.evaluate(() => window.__game.u.paperPattern))
await shot(page, 'rb-paper-landscape')

// 6. touch far away from anything, repeatedly
await page.setViewportSize(P); await page.waitForTimeout(300)
for (let i = 0; i < 10; i++) await tap(page, 10, 830)
out.push('offscreen-ish taps ok, stage=' + (await state(page)).stage)

// 7. idle hint appears
await page.waitForTimeout(4200)
await shot(page, 'rb-idle-hint')
out.push('idle=' + await page.evaluate(() => +window.__game.input.idle.toFixed(1)))

// 8. frame cost
const perf = await page.evaluate(async () => {
  const g = window.__game
  const t = []
  for (let i = 0; i < 90; i++) {
    const a = performance.now()
    g.frameStep(1 / 60); g.render()
    t.push(performance.now() - a)
  }
  t.sort((x, y) => x - y)
  return { median: +t[45].toFixed(2), p95: +t[85].toFixed(2), max: +t[89].toFixed(2) }
})
out.push('frame cost ms (software raster): ' + JSON.stringify(perf))

console.log(out.join('\n'))
console.log('ERRORS', page.errors)
await b.close()

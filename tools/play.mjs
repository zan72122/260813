import { launch, newPage, shot, swipe, tap, state, VIEWPORTS } from './shot.mjs'

const VP = process.env.VP || 'iphone-p'
const PREFIX = process.env.PREFIX || VP
const b = await launch()
const page = await newPage(b, VP)
const { width: W, height: H } = VIEWPORTS[VP]
const log = []
const step = async (name, expect) => {
  const s = await state(page)
  log.push(`${name}: ${s.stage} ${JSON.stringify(s).slice(0, 150)}`)
  if (expect && s.stage !== expect) log.push(`  !! expected ${expect}`)
  await shot(page, `${PREFIX}-${name}`)
  return s
}
const waitStage = async (id, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const s = await state(page)
    if (s.stage === id) return true
    await page.waitForTimeout(150)
  }
  return false
}

// title
await step('01-title', 'title')
await tap(page, W * 0.5, H * 0.86)
await page.waitForTimeout(400)
// intro
await waitStage('intro'); await page.waitForTimeout(1200)
await step('02-intro', 'intro')
await tap(page, W * 0.5, H * 0.45)
await waitStage('split'); await page.waitForTimeout(300)
await step('03-split', 'split')
// cut
for (let i = 0; i < 6; i++) {
  const s = await state(page)
  if (s.stage !== 'split') break
  await swipe(page, [W * 0.5, H * 0.2], [W * 0.5, H * 0.8], 16, 8)
}
await waitStage('fluff'); await page.waitForTimeout(200)
await step('04-fluff-start', 'fluff')
// para para
for (let i = 0; i < 12; i++) {
  const s = await state(page)
  if (s.stage !== 'fluff') break
  if (i === 2) await step('05-fluff-mid')
  await swipe(page, [W * 0.18, H * 0.72], [W * 0.82, H * 0.72], 14, 6)
  await swipe(page, [W * 0.82, H * 0.72], [W * 0.18, H * 0.72], 14, 6)
}
await page.waitForTimeout(400)
await step('06-fanned')
await waitStage('bow'); await page.waitForTimeout(400)
await step('07-bow', 'bow')
for (let i = 0; i < 8; i++) {
  const s = await state(page); if (s.stage !== 'bow') break
  await swipe(page, [W * 0.12, H * 0.55], [W * 0.9, H * 0.55], 16, 7)
}
await waitStage('thread'); await page.waitForTimeout(400)
await step('08-thread', 'thread')
for (let i = 0; i < 10; i++) {
  const s = await state(page); if (s.stage !== 'thread') break
  const y = H * (0.42 + (i % 2) * 0.06)
  await swipe(page, [W * 0.1, y], [W * 0.9, y + H * 0.05], 20, 6)
  await swipe(page, [W * 0.9, y + H * 0.05], [W * 0.1, y], 20, 6)
}
await waitStage('sym'); await page.waitForTimeout(400)
await step('09-sym', 'sym')
for (let i = 0; i < 10; i++) {
  const s = await state(page); if (s.stage !== 'sym') break
  await swipe(page, [W * 0.35, H * 0.45], [W * 0.05, H * 0.45], 14, 6)
  await swipe(page, [W * 0.65, H * 0.45], [W * 0.95, H * 0.45], 14, 6)
}
await waitStage('glue'); await page.waitForTimeout(400)
await step('10-glue', 'glue')
for (let i = 0; i < 14; i++) {
  const s = await state(page); if (s.stage !== 'glue') break
  const y = H * (0.35 + (i % 5) * 0.07)
  await swipe(page, [W * 0.08, y], [W * 0.92, y], 20, 5)
}
await waitStage('paper'); await page.waitForTimeout(500)
await step('11-paper-choose', 'paper')
const btns = await page.evaluate(() => window.__game.buttons.map(b => ({ id: b.id, x: b.x, y: b.y })))
log.push('paper buttons: ' + JSON.stringify(btns))
const pick = btns[2] || btns[0]
if (pick) await tap(page, pick.x, pick.y)
await page.waitForTimeout(500)
await step('12-paper-chosen')
for (let i = 0; i < 8; i++) {
  const s = await page.evaluate(() => window.__game.u.paperOn)
  await swipe(page, [W * 0.5, H * 0.3], [W * 0.5, H * 0.75], 16, 7)
  const st2 = await state(page); if (st2.stage !== 'paper') break
  if (await page.evaluate(() => window.__game.u.wrinkle.some(v => v > 0))) break
  void s
}
await step('13-paper-placed')
const fan = (f, u) => page.evaluate(([f, u]) => { const p = window.__fan(f, u); return [p.x, p.y] }, [f, u])
for (let i = 0; i < 20; i++) {
  const s = await state(page); if (s.stage !== 'paper') break
  const f = (i % 7) / 6
  const a = await fan(f, 0.2)
  const bb = await fan(f, 0.95)
  await swipe(page, a, bb, 16, 5)
}
await waitStage('hammer'); await page.waitForTimeout(400)
await step('14-hammer', 'hammer')
for (let i = 0; i < 8; i++) {
  const s = await state(page); if (s.stage !== 'hammer') break
  await tap(page, W * (0.3 + (i % 3) * 0.2), H * 0.6)
  await page.waitForTimeout(200)
}
await waitStage('edge'); await page.waitForTimeout(400)
await step('15-edge', 'edge')
for (let i = 0; i < 24; i++) {
  const s = await state(page); if (s.stage !== 'edge') break
  if (await page.evaluate(() => window.__game.u.edge >= 1)) break
  const e = await page.evaluate(() => window.__game.u.edge)
  const a = await fan(Math.min(0.98, e), 1.0)
  const bb = await fan(Math.min(1, e + 0.3), 1.0)
  await swipe(page, a, bb, 14, 5)
}
await step('16-edge-done')
for (let i = 0; i < 16; i++) {
  const s = await state(page); if (s.stage !== 'edge') break
  const a = await fan(0.5, 0.95)
  const bb = await fan(0.5, 0.2)
  await swipe(page, a, bb, 18, 5)
}
await waitStage('finish', 10000); await page.waitForTimeout(800)
await step('17-finish', 'finish')
for (let i = 0; i < 6; i++) {
  await swipe(page, [W * 0.25, H * 0.6], [W * 0.75, H * 0.6], 8, 5)
  await swipe(page, [W * 0.75, H * 0.6], [W * 0.25, H * 0.6], 8, 5)
}
await page.waitForTimeout(700)
await step('18-wind')
console.log(log.join('\n'))
console.log('ERRORS', page.errors)
await b.close()

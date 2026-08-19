import { launch, shot, drag, dbg } from './playtest.mjs'
const { browser, page, errors } = await launch('phone', '?stage=free')
await page.waitForTimeout(1200)
const cap = await page.evaluate(() => window.__game.sand.capacity)
console.log('capacity', cap)
for (let i = 0; i < 26; i++) {
  const y0 = 0.25 + (i % 8) * 0.06
  await drag(page, [{ x: 0.1, y: y0 }, { x: 0.9, y: y0 + 0.02 }], 60, 3)
  const d = await dbg(page)
  if (i % 6 === 0 || d.segments > cap * 0.9) console.log(i, d.segments, 'fps', d.fps)
  if (d.segments >= cap - 5) break
}
console.log('final', await dbg(page))
await shot(page, 'S1-stress')
const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent)
console.log('toast', toast)
// keep drawing after cap
await drag(page, [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], 100, 4)
await page.waitForTimeout(500)
console.log('after cap', await dbg(page))
await shot(page, 'S2-after-cap')
console.log('ERRORS', errors.slice(0, 10))
await browser.close()

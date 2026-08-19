import { launch, drag } from './playtest.mjs'
const { browser, page } = await launch('pad', '?stage=wall')
await page.waitForTimeout(1600)
const p = () => page.evaluate(() => {
  const g = window.__game
  const n = g.__nozzlePos ? g.__nozzlePos() : null
  return { n, stage: g.stage, hasPointer: g.hasPointer, idle: +g.idleSince.toFixed(2), nextCell: g.guide?.nextCell()?.p }
})
console.log('before', await p())
await drag(page, [{ x: 0.14, y: 0.56 }, { x: 0.86, y: 0.56 }], 200, 12)
await page.waitForTimeout(1200)
console.log('after', await p())
await page.waitForTimeout(3000)
console.log('idle', await p())
await browser.close()

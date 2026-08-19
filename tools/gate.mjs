import { launch, shot, drag, dbg } from './playtest.mjs'
const { browser, page, errors } = await launch('pad', '?stage=wall')
await page.waitForTimeout(1600)
await shot(page, 'G0-wall-guide')
// deliberately drag straight through the middle of the doorway
await drag(page, [{ x: 0.14, y: 0.56 }, { x: 0.86, y: 0.56 }], 200, 12)
await page.waitForTimeout(1200)
await shot(page, 'G1-wall-through-gate')
console.log(await dbg(page))
// then scribble low across the gate again
await drag(page, [{ x: 0.4, y: 0.66 }, { x: 0.6, y: 0.64 }], 300, 8)
await page.waitForTimeout(1200)
await shot(page, 'G2-gate-still-open')
console.log(await dbg(page), errors.slice(0, 8))
await browser.close()

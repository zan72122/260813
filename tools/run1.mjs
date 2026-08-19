import { launch, shot, drag, dbg } from './playtest.mjs'

const { browser, page, errors } = await launch('phone')
await shot(page, '01-title')
console.log('title dbg', await dbg(page))

// press play
await page.click('.playbtn', { force: true })
await page.waitForTimeout(900)
await shot(page, '02-surface')
await page.waitForTimeout(1400)
await shot(page, '03-dive')
await page.waitForTimeout(2200)
await shot(page, '04-foundation')
console.log('after dive', await dbg(page))

// short press
await drag(page, [{ x: 0.35, y: 0.72 }], 250)
await page.waitForTimeout(500)
await shot(page, '05-first-blob')
console.log('after short press', await dbg(page))

// drag along the base
await drag(page, [{ x: 0.25, y: 0.74 }, { x: 0.75, y: 0.73 }], 120)
await page.waitForTimeout(800)
await shot(page, '06-foundation-drag')
console.log('after drag', await dbg(page))

await page.waitForTimeout(1500)
await shot(page, '07-after-foundation')
console.log('stage now', await dbg(page))

console.log('ERRORS:', errors.slice(0, 20))
await browser.close()

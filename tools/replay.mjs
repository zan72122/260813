import { launch, shot, drag, dbg } from './playtest.mjs'
const { browser, page, errors } = await launch('phone', '?stage=decor&build=1')
await page.waitForTimeout(1600)
await shot(page, 'X0-decor')
// settings panel
await page.click('.topbar .rbtn[aria-label="せってい"]', { force: true })
await page.waitForTimeout(500)
await shot(page, 'X1-settings')
// move sliders
const inputs = await page.$$('.card input[type=range]')
console.log('sliders', inputs.length)
for (const inp of inputs) await inp.evaluate((e) => { e.value = e.min; e.dispatchEvent(new Event('input', { bubbles: true })) })
await page.waitForTimeout(400)
await shot(page, 'X2-settings-low')
// while the panel is open drawing must be blocked
const before = (await dbg(page)).segments
await drag(page, [{ x: 0.5, y: 0.6 }, { x: 0.6, y: 0.5 }], 200, 6)
const after = (await dbg(page)).segments
console.log('blocked while panel open:', before === after, before, after)
await page.click('.bigbtn', { force: true })
await page.waitForTimeout(500)
await shot(page, 'X3-after-settings-calm')
// restore settings
await page.click('.topbar .rbtn[aria-label="せってい"]', { force: true })
await page.waitForTimeout(400)
const inputs2 = await page.$$('.card input[type=range]')
for (const inp of inputs2) await inp.evaluate((e) => { e.value = e.max; e.dispatchEvent(new Event('input', { bubbles: true })) })
await page.click('.bigbtn', { force: true })
await page.waitForTimeout(400)

// go to finale then replay
await page.click('.nextbtn', { force: true })
await page.waitForTimeout(13500)
await shot(page, 'X4-finish')
const panel = await page.$('.panel.see-through')
console.log('finish panel', !!panel)
// "another castle"
const btns = await page.$$('.panel .bigbtn')
console.log('buttons', btns.length)
await btns[2].click({ force: true })
await page.waitForTimeout(2200)
await shot(page, 'X5-new-castle')
console.log('after new castle', await dbg(page))
const layout = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.debugLayout ?? {})))
console.log('layout', layout)
console.log('ERRORS', errors.slice(0, 15))
await browser.close()

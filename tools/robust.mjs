import { launch, shot, drag, dbg } from './playtest.mjs'
const { browser, page, ctx, errors } = await launch('phone', '?stage=foundation')
await page.waitForTimeout(1500)

// 1. very short tap
await drag(page, [{ x: 0.5, y: 0.7 }], 40)
await page.waitForTimeout(400)
console.log('tap ->', (await dbg(page)).segments)
await shot(page, 'R1-tap')

// 2. long hold in one place (pile up)
await drag(page, [{ x: 0.5, y: 0.7 }], 2200)
await page.waitForTimeout(400)
console.log('hold ->', (await dbg(page)).segments)
await shot(page, 'R2-hold')

// 3. very fast horizontal sweep
await drag(page, [{ x: 0.12, y: 0.72 }, { x: 0.9, y: 0.72 }], 0, 2)
await page.waitForTimeout(400)
console.log('fast sweep ->', (await dbg(page)).segments)
await shot(page, 'R3-fast')

// 4. draw far off-guide (top of screen)
await drag(page, [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.18 }], 100, 10)
await page.waitForTimeout(600)
console.log('off guide ->', await dbg(page))
await shot(page, 'R4-offguide')

// 5. orientation change mid-play
await page.setViewportSize({ width: 852, height: 393 })
await page.waitForTimeout(1400)
await shot(page, 'R5-rotated')
console.log('rotated ->', await dbg(page))
await page.setViewportSize({ width: 393, height: 852 })
await page.waitForTimeout(1400)
await shot(page, 'R6-rotated-back')

// 6. background / foreground
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(800)
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
await page.waitForTimeout(900)
await shot(page, 'R7-resumed')
console.log('resumed ->', await dbg(page))

// 7. two-finger touch should not break anything
await page.touchscreen.tap(100, 500)
await page.waitForTimeout(300)
console.log('after tap ->', (await dbg(page)).segments)

console.log('ERRORS', errors.slice(0, 20))
await browser.close()

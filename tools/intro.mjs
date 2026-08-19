import { launch, shot } from './playtest.mjs'
const dev = process.argv[2] || 'phone'
const { browser, page, errors } = await launch(dev)
await page.waitForTimeout(1400)
await shot(page, `IN-${dev}-title`)
await page.click('.playbtn', { force: true })
await page.waitForTimeout(1100); await shot(page, `IN-${dev}-surface`)
await page.waitForTimeout(1200); await shot(page, `IN-${dev}-crossing`)
await page.waitForTimeout(1600); await shot(page, `IN-${dev}-under`)
console.log(errors.slice(0, 6))
await browser.close()

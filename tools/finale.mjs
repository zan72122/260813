import { launch, shot, dbg } from './playtest.mjs'
const dev = process.argv[2] || 'phone'
const { browser, page, errors } = await launch(dev, '?stage=decor&build=1')
await page.waitForTimeout(12000)
await page.click('.nextbtn', { force: true })
for (const t of [1200, 1800, 1800, 1600, 1600, 2200]) {
  await page.waitForTimeout(t)
  await shot(page, `${dev}-fin-${t}-${Math.random().toString(36).slice(2, 5)}`)
}
console.log(await dbg(page), errors.slice(0, 8))
await browser.close()

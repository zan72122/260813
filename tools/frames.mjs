import { launch, shot } from './playtest.mjs'
const dev = process.argv[2] || 'phone'
for (const st of ['foundation', 'towerL', 'towerR', 'wall', 'arch', 'decor', 'free']) {
  const { browser, page, errors } = await launch(dev, `?stage=${st}`)
  await page.waitForTimeout(2600)
  await shot(page, `FR-${dev}-${st}`)
  if (errors.length) console.log(st, errors.slice(0, 4))
  await browser.close()
}
console.log('done', dev)

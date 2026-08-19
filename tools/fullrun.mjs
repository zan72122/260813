import { launch, shot, drag, dbg } from './playtest.mjs'

const device = process.argv[2] || 'phone'
const { browser, page, errors } = await launch(device)
const P = (n) => shot(page, `${device}-${n}`)

await P('00-title')
await page.click('.playbtn', { force: true })
await page.waitForTimeout(1000); await P('01-surface')
await page.waitForTimeout(1600); await P('02-dive')
await page.waitForTimeout(2600); await P('03-foundation')

async function playGuide(label, hold = 220) {
  const path = await page.evaluate(() => window.__game.guideFingerPath())
  if (!path.length) { console.log(label, 'no guide'); return }
  // trace with a little human wobble
  const wob = path.map((p, i) => ({
    x: p.x + (i % 3 === 0 ? 0.012 : -0.009),
    y: p.y + (i % 2 === 0 ? 0.006 : -0.005),
  }))
  await drag(page, wob, hold, 5)
  await page.waitForTimeout(1400)
  console.log(label, await dbg(page))
  await shot(page, `${device}-${label}`)
}

await playGuide('04-foundation-done')
await page.waitForTimeout(1200)
await playGuide('05-towerL')
await page.waitForTimeout(1200)
await playGuide('06-towerR')
await page.waitForTimeout(1200)
await playGuide('07-wall')
await page.waitForTimeout(1200)
await playGuide('08-arch')
await page.waitForTimeout(1400)
console.log('decor?', await dbg(page))
await P('09-decor')

// pick the pink pot and decorate a tower top
const pots = await page.$$('.pot')
console.log('pots', pots.length)
if (pots[1]) await pots[1].click({ force: true })
await page.waitForTimeout(300)
await drag(page, [{ x: 0.28, y: 0.34 }, { x: 0.3, y: 0.28 }], 260, 8)
await page.waitForTimeout(400)
if (pots[2]) await pots[2].click({ force: true })
await drag(page, [{ x: 0.72, y: 0.34 }, { x: 0.7, y: 0.28 }], 260, 8)
await page.waitForTimeout(700)
await P('10-decorated')
console.log('after decor', await dbg(page))

// finish
await page.click('.nextbtn', { force: true })
await page.waitForTimeout(2500); await P('11-finale-a')
await page.waitForTimeout(3000); await P('12-finale-b')
await page.waitForTimeout(3000); await P('13-finale-c')
await page.waitForTimeout(5000); await P('14-finish-panel')
console.log('finale', await dbg(page))
console.log('ERRORS', errors.slice(0, 25))
await browser.close()

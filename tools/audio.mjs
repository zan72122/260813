import { launch, drag } from './playtest.mjs'
const { browser, page, errors } = await launch('phone', '?stage=foundation')
await page.waitForTimeout(600)
// unlock via a tap, then attach an analyser to the master bus
await page.mouse.click(200, 700)
await page.waitForTimeout(400)
await page.evaluate(() => {
  const ctx = window.__audioProbe
  const master = window.__audioMaster
  const an = ctx.createAnalyser()
  an.fftSize = 1024
  master.connect(an)
  window.__an = an
  window.__buf = new Float32Array(an.fftSize)
  window.__peak = 0
  const tick = () => {
    an.getFloatTimeDomainData(window.__buf)
    let m = 0
    for (const v of window.__buf) m = Math.max(m, Math.abs(v))
    window.__peak = Math.max(window.__peak, m)
    requestAnimationFrame(tick)
  }
  tick()
})
const peaks = {}
const measure = async (label) => {
  await page.evaluate(() => { window.__peak = 0 })
  await page.waitForTimeout(900)
  peaks[label] = await page.evaluate(() => window.__peak)
}
await measure('idle-ambient')
await drag(page, [{ x: 0.3, y: 0.72 }, { x: 0.7, y: 0.7 }], 300, 10)
await measure('after-extrude')
await page.evaluate(() => window.__game.hud.toast('x'))
await measure('quiet')
console.log(peaks)
console.log('ERR', errors.slice(0, 8))
await browser.close()

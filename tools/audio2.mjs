import { launch, drag } from './playtest.mjs'
const { browser, page, errors } = await launch('phone')
await page.click('.playbtn', { force: true })
await page.waitForTimeout(500)
await page.evaluate(() => {
  const ctx = window.__audioProbe, master = window.__audioMaster
  const an = ctx.createAnalyser(); an.fftSize = 2048
  master.connect(an)
  window.__an = an; window.__buf = new Float32Array(an.fftSize); window.__peak = 0
  window.__fft = new Float32Array(an.frequencyBinCount)
  const tick = () => {
    an.getFloatTimeDomainData(window.__buf)
    let m = 0; for (const v of window.__buf) m = Math.max(m, Math.abs(v))
    window.__peak = Math.max(window.__peak, m)
    requestAnimationFrame(tick)
  }
  tick()
})
const brightness = () => page.evaluate(() => {
  window.__an.getFloatFrequencyData(window.__fft)
  const n = window.__fft.length, rate = window.__audioProbe.sampleRate
  let lo = 0, hi = 0
  for (let i = 1; i < n; i++) {
    const f = (i * rate) / 2 / n
    const a = Math.pow(10, window.__fft[i] / 20)
    if (f < 900) lo += a; else if (f < 9000) hi += a
  }
  return { lo: +lo.toFixed(4), hi: +hi.toFixed(4), ratio: +(hi / (lo + 1e-9)).toFixed(4) }
})
const m = async (label) => {
  await page.evaluate(() => { window.__peak = 0 })
  await page.waitForTimeout(1000)
  console.log(label, 'peak', (await page.evaluate(() => window.__peak)).toFixed(4), await brightness())
}
await m('above-water')
await page.waitForTimeout(2000)
await m('during-dive')
await page.waitForTimeout(2500)
await m('underwater-ambient')
await drag(page, [{ x: 0.3, y: 0.72 }, { x: 0.7, y: 0.7 }], 300, 10)
await m('after-extrude')
console.log('ERR', errors.slice(0, 8))
await browser.close()

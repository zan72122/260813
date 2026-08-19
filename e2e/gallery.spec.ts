import { test } from '@playwright/test'

const VIEWS: Array<[string, number, number]> = [
  ['iphone-p', 390, 844],
  ['iphone-l', 844, 390],
  ['ipad-p', 820, 1180],
  ['ipad-l', 1180, 820],
]

for (const [name, w, h] of VIEWS) {
  test(`gallery ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
    await page.waitForTimeout(1800)
    await page.screenshot({ path: `shots/final-${name}.png` })
  })
}

for (const pattern of ['sidepath', 'ridge', 'sandbox']) {
  test(`terrain ${pattern}`, async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/')
    await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
    await page.evaluate((p) => (window as any).__sand.setPattern(p), pattern)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `shots/terrain-${pattern}.png` })
  })
}

test('gallery reveal landscape', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const cfg = (window as any).__sandCfg
    const t = g.terrain
    for (let pass = 0; pass < 3; pass++) {
      for (let x = -4.7; x < cfg.CASTLE_X - 1.9; x += 0.25) {
        t.dig(x, 0, x + 0.25, 0, 0.5, 0.085 * 0.85)
      }
    }
    for (let s = 0; s < 120 * 70; s++) {
      const time = s / 120
      if (time < 8 || (time > 12 && time < 20) || (time > 26 && time < 34)) {
        g.water.add(t, -5.2, 0, 0.34, 0.46 / 120)
      }
      g.water.step(t, 1 / 120)
    }
  })
  await page.waitForFunction(
    () => ['fill', 'reveal'].includes((window as any).__sand.state().phase),
    null,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(3500)
  await page.screenshot({ path: 'shots/final-reveal-landscape.png' })
})

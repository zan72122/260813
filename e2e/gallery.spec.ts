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

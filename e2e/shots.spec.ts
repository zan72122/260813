import { test } from '@playwright/test'

const VIEWS = [
  { name: 'iphone-portrait', w: 390, h: 844 },
  { name: 'iphone-landscape', w: 844, h: 390 },
  { name: 'ipad-portrait', w: 820, h: 1180 },
  { name: 'ipad-landscape', w: 1180, h: 820 },
]

for (const v of VIEWS) {
  test(`shot ${v.name}`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h })
    await page.goto('/?e2e=1')
    await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `shots/${v.name}.png` })
  })
}

import { expect, test } from '@playwright/test'

const VIEWS: Array<[string, number, number]> = [
  ['iphone-portrait', 390, 844],
  ['iphone-landscape', 844, 390],
  ['ipad-portrait', 820, 1180],
  ['ipad-landscape', 1180, 820],
]

for (const [name, w, h] of VIEWS) {
  test(`picture menu is finger sized: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/?e2e=1')
    await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
    await page.evaluate(() => (window as any).__sand.game.openMenu(true))
    await page.waitForTimeout(700)
    await page.screenshot({ path: `shots/menu-${name}.png` })
    const cards = page.locator('#menu .card')
    await expect(cards).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const b = (await cards.nth(i).boundingBox())!
      expect(b, `${name} card ${i}`).not.toBeNull()
      expect(b.width * b.height, `${name} card ${i} area`).toBeGreaterThan(9000)
      expect(Math.min(b.width, b.height), `${name} card ${i} min side`).toBeGreaterThan(74)
      expect(b.x).toBeGreaterThanOrEqual(-1)
      expect(b.y).toBeGreaterThanOrEqual(-1)
      expect(b.x + b.width).toBeLessThanOrEqual(w + 1)
      expect(b.y + b.height).toBeLessThanOrEqual(h + 1)
    }
  })
}

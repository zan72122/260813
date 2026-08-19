import { expect, test } from '@playwright/test'

test('boots without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(1200)
  const s = await page.evaluate(() => (window as any).__sand.state())
  expect(s.phase).toBe('intro')
  expect(errors, errors.join('\n')).toEqual([])
})

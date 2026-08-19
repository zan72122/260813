import { test } from '@playwright/test'

test('mid-stroke: the shovel is in the sand and grains fly', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?e2e=0')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(800)
  const px = (x: number, z: number) =>
    page.evaluate(([a, b]) => (window as any).__sand.worldToScreen(a, b), [x, z] as [number, number])

  const a = await px(-4.6, 0)
  const b = await px(0.5, 0.2)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
    await page.waitForTimeout(35)
  }
  await page.screenshot({ path: 'shots/feel-dig.png' })
  await page.screenshot({ path: 'shots/feel-dig-crop.png', clip: { x: 120, y: 300, width: 160, height: 280 } })
  await page.mouse.up()
  await page.waitForTimeout(400)
  await page.screenshot({ path: 'shots/feel-after-dig.png' })

  // now the watering can, held down
  const slot = await page.evaluate(() => (window as any).__sand.game.tray.slotPos('pour'))
  await page.mouse.click(slot.x, slot.y)
  await page.waitForTimeout(250)
  const s = await px(-5.2, 0)
  await page.mouse.move(s.x, s.y)
  await page.mouse.down()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: 'shots/feel-pour.png' })
  await page.mouse.up()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'shots/feel-flow.png' })
})

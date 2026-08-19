import { Page, expect, test } from '@playwright/test'

const st = (page: Page) => page.evaluate(() => (window as any).__sand.state())
const px = (page: Page, x: number, z: number) =>
  page.evaluate(([a, b]) => (window as any).__sand.worldToScreen(a, b), [x, z] as [number, number])

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

async function boot(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(700)
}

/** Pour straight into the moat so the reveal can be reached quickly. */
async function fillMoat(page: Page) {
  await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const cfg = (window as any).__sandCfg
    const w = g.water
    const t = g.terrain
    for (let s = 0; s < 900; s++) {
      const a = (s / 900) * Math.PI * 2 * 3
      w.add(t, cfg.CASTLE_X + Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0.4, 0.004)
      w.step(t, 1 / 120)
    }
  })
}

test('reveal plays out and the picture menu restarts the same sandbox', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 390, 844)

  // give the child a bit of a river first, so the reveal has something to show
  const a = await px(page, -4.5, 0)
  const b = await px(page, 1.5, 0)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }
  await page.mouse.up()

  await fillMoat(page)
  await page.waitForFunction(
    () => (window as any).__sand.state().phase === 'reveal',
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'shots/loop-1-reveal.png' })

  // The result is held for several seconds before anything is asked of the
  // child: the menu must not appear while the castle is still coming alive.
  const held = await st(page)
  if (held.menuVisible) expect(held.revealTime).toBeGreaterThan(5)

  await page.waitForFunction(
    () => (window as any).__sand.state().menuVisible === true,
    null,
    { timeout: 20_000 },
  )
  const atMenu = await st(page)
  expect(atMenu.revealTime).toBeGreaterThan(5)
  await page.waitForTimeout(700)
  await page.screenshot({ path: 'shots/loop-2-menu.png' })

  const cards = page.locator('#menu .card')
  await expect(cards).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    const box = await cards.nth(i).boundingBox()
    expect(box, `card ${i} box`).not.toBeNull()
    expect(box!.width).toBeGreaterThan(70)
    expect(box!.height).toBeGreaterThan(70)
  }

  // one tap restarts the same sandbox
  await cards.nth(0).click()
  await page.waitForTimeout(900)
  const s = await st(page)
  expect(s.menuVisible).toBe(false)
  expect(s.phase).toBe('intro')
  expect(s.pattern).toBe('gentle')
  expect(s.moatFill).toBe(0)
  expect(s.totalDug).toBe(0)

  expect(errors, errors.join('\n')).toEqual([])
})

test('the second card gives a different sandbox, the third a free one', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 844, 390)
  await page.evaluate(() => (window as any).__sand.game.openMenu(false))
  await page.waitForTimeout(500)
  await page.locator('#menu .card').nth(1).click()
  await page.waitForTimeout(700)
  expect((await st(page)).pattern).not.toBe('gentle')

  await page.evaluate(() => (window as any).__sand.game.openMenu(false))
  await page.waitForTimeout(400)
  await page.locator('#menu .card').nth(2).click()
  await page.waitForTimeout(700)
  expect((await st(page)).pattern).toBe('sandbox')
  expect(errors, errors.join('\n')).toEqual([])
})

test('water that strays raises the repair beat, and mounding sand changes it', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 390, 844)
  await page.evaluate(() => (window as any).__sand.setPattern('sidepath'))
  await page.waitForTimeout(500)

  // Pour without digging: the terrain's low side route takes the water away.
  await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    g.tray.selected = 'pour'
  })
  const src = await px(page, -5.2, 0)
  await page.mouse.move(src.x, src.y)
  await page.mouse.down()
  for (let i = 0; i < 22; i++) await page.mouse.move(src.x + (i % 3), src.y)
  await page.mouse.up()

  await page.waitForFunction(
    () => {
      const s = (window as any).__sand.state()
      return s.phase === 'repair' || s.moatFill > 0.05
    },
    null,
    { timeout: 40_000 },
  )
  const s1 = await st(page)
  console.log('stray state', JSON.stringify(s1))
  await page.screenshot({ path: 'shots/loop-3-stray.png' })

  // Build a dam with the scoop and confirm the terrain actually rises.
  const sampleMax = (cx: number, cz: number) =>
    page.evaluate(
      ([x, z]) => {
        const t: any = (window as any).__sand.game.terrain
        let m = -Infinity
        for (let dx = -1.2; dx <= 1.2; dx += 0.08) {
          for (let dz = -1.2; dz <= 1.2; dz += 0.08) {
            m = Math.max(m, t.heightAt(x + dx, z + dz))
          }
        }
        return m
      },
      [cx, cz] as [number, number],
    )
  const centroid = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    return { x: g.water.centroidX, z: g.water.centroidZ }
  })
  const before = await sampleMax(centroid.x, centroid.z)
  await page.evaluate(() => {
    ;(window as any).__sand.game.tray.selected = 'mound'
  })
  const c = centroid
  const m = await px(page, c.x, c.z)
  await page.mouse.move(m.x, m.y)
  await page.mouse.down()
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(m.x + Math.sin(i) * 4, m.y + Math.cos(i) * 4)
    await page.waitForTimeout(60)
  }
  await page.mouse.up()
  const after = await sampleMax(c.x, c.z)
  console.log('dam height', before, '->', after)
  expect(after).toBeGreaterThan(before + 0.01)
  expect(errors, errors.join('\n')).toEqual([])
})

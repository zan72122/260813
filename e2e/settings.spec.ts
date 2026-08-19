import { Page, expect, test } from '@playwright/test'

async function boot(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(500)
}

test('audio unlocks on the first touch and never before', async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => (window as any).__sand.game.audio.isUnlocked)).toBe(false)
  await page.mouse.click(195, 500)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as any).__sand.game.audio.isUnlocked)).toBe(true)
})

test('the game is fully playable with the sound off', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await boot(page)
  await page.locator('#btn-sound').click()
  await page.waitForTimeout(200)
  await page.locator('#volpop .lvl').nth(0).click()
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => (window as any).__sand.game.settings.volume)).toBe(0)

  // dig and pour with audio muted
  const a = await page.evaluate(() => (window as any).__sand.worldToScreen(-4, 0))
  const b = await page.evaluate(() => (window as any).__sand.worldToScreen(0, 0))
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }
  await page.mouse.up()
  expect((await page.evaluate(() => (window as any).__sand.state())).totalDug).toBeGreaterThan(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('sound and motion settings survive a reload', async ({ page }) => {
  await boot(page)
  await page.locator('#btn-sound').click()
  await page.locator('#volpop .lvl').nth(1).click()
  await page.locator('#btn-motion').click()
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => (window as any).__sand.game.settings)
  expect(before.volume).toBe(1)

  await page.reload()
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => (window as any).__sand.game.settings)
  expect(after.volume).toBe(1)
  expect(after.calmMotion).toBe(before.calmMotion)
})

test('calm motion mode still shows the full result', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await boot(page)
  await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    g.settings.calmMotion = true
  })
  await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const cfg = (window as any).__sandCfg
    for (let s = 0; s < 900; s++) {
      const a = (s / 900) * Math.PI * 6
      g.water.add(g.terrain, cfg.CASTLE_X + Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0.4, 0.004)
      g.water.step(g.terrain, 1 / 120)
    }
  })
  await page.waitForFunction(
    () => (window as any).__sand.state().phase === 'reveal',
    null,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'shots/calm-reveal.png' })
  const activated = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    return { fill: g.water.moatFill }
  })
  expect(activated.fill).toBeGreaterThan(0.9)
  expect(errors, errors.join('\n')).toEqual([])
})

test('simulation and scene update stay inside a frame budget', async ({ page }) => {
  await boot(page)
  const r = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const t = g.terrain
    // Worst realistic case: water spread over a large part of the sandbox
    // while the child is dragging the shovel.
    for (let s = 0; s < 600; s++) {
      g.water.add(t, -4 + (s % 9) * 1.1, ((s % 5) - 2) * 1.1, 0.5, 0.02)
      g.water.step(t, 1 / 120)
    }
    const times: number[] = []
    for (let i = 0; i < 160; i++) {
      const x = -4 + (i % 40) * 0.2
      const t0 = performance.now()
      g.terrain.dig(x, 0, x + 0.2, 0.05, 0.44, 0.02)
      g.update(1 / 60)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    return {
      median: times[Math.floor(times.length / 2)],
      p95: times[Math.floor(times.length * 0.95)],
      wet: g.water.totalVolume,
    }
  })
  console.log('update ms median/p95:', r.median.toFixed(2), r.p95.toFixed(2), 'vol', r.wet.toFixed(2))
  // Leave most of a 16 ms frame for rendering even in the worst case.
  expect(r.median).toBeLessThan(7)
  expect(r.p95).toBeLessThan(12)
})

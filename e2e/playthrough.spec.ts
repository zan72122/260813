import { Page, expect, test } from '@playwright/test'

type State = {
  phase: string
  moatFill: number
  waterVolume: number
  totalDug: number
  totalPoured: number
  frontX: number
  menuVisible: boolean
  selectedTool: string
}

const st = (page: Page) => page.evaluate(() => (window as any).__sand.state() as State)
const px = (page: Page, x: number, z: number) =>
  page.evaluate(([a, b]) => (window as any).__sand.worldToScreen(a, b), [x, z] as [number, number])

async function boot(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(900)
}

/** Drag the currently selected tool along a list of world-space points. */
async function dragWorld(page: Page, pts: Array<[number, number]>, stepMs = 24) {
  const first = await px(page, pts[0][0], pts[0][1])
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const sub = 6
    for (let s = 1; s <= sub; s++) {
      const t = s / sub
      const p = await px(page, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
      await page.mouse.move(p.x, p.y)
      await page.waitForTimeout(stepMs)
    }
  }
  await page.mouse.up()
}

async function pickTool(page: Page, tool: 'dig' | 'mound' | 'pour') {
  const p = await page.evaluate(
    (t) => (window as any).__sand.game.tray.slotPos(t),
    tool,
  )
  await page.mouse.click(p.x, p.y)
  await page.waitForTimeout(180)
  expect((await st(page)).selectedTool).toBe(tool)
}

test('full loop: dig, pour, flow, fill, reveal, replay', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await boot(page, 390, 844)
  expect((await st(page)).phase).toBe('intro')

  // 1. dig a channel from the spout to the castle gate, in three strokes
  for (let pass = 0; pass < 3; pass++) {
    await dragWorld(page, [
      [-4.6, 0],
      [-2.2, 0.1],
      [0.4, 0.05],
      [2.0, 0],
    ])
    await page.waitForTimeout(120)
  }
  const dug = await st(page)
  expect(dug.totalDug).toBeGreaterThan(0.5)
  expect(['dig', 'invitePour']).toContain(dug.phase)
  await page.screenshot({ path: 'shots/play-1-dug.png' })

  // 2. pour at the spout, holding the finger down
  await pickTool(page, 'pour')
  const src = await px(page, -5.2, 0)
  await page.mouse.move(src.x, src.y)
  await page.mouse.down()
  for (let i = 0; i < 26; i++) {
    await page.mouse.move(src.x + Math.sin(i / 3) * 2, src.y)
    await page.waitForTimeout(180)
  }
  await page.mouse.up()
  const poured = await st(page)
  console.log('poured', JSON.stringify(poured))
  expect(poured.totalPoured).toBeGreaterThan(0.3)
  await page.screenshot({ path: 'shots/play-2-flow.png' })

  // 3. water should be moving toward the castle
  await page.waitForTimeout(2500)
  const flow = await st(page)
  console.log('after first pour', JSON.stringify(flow))
  expect(flow.frontX).toBeGreaterThan(-3)

  // 4. keep pouring until the moat is full
  for (let round = 0; round < 6; round++) {
    const s = await st(page)
    if (s.moatFill >= 0.99 || s.phase === 'reveal' || s.phase === 'menu') break
    await page.mouse.move(src.x, src.y)
    await page.mouse.down()
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(src.x + Math.sin(i / 3) * 2, src.y)
      await page.waitForTimeout(160)
    }
    await page.mouse.up()
    await page.waitForTimeout(3000)
    console.log('round', round, JSON.stringify(await st(page)))
  }

  // let the last of the water drain into the moat
  for (let i = 0; i < 12; i++) {
    const s = await st(page)
    if (s.moatFill >= 0.99 || s.phase === 'reveal' || s.phase === 'menu') break
    await page.waitForTimeout(2500)
  }
  const filled = await st(page)
  console.log('final', JSON.stringify(filled))
  await page.screenshot({ path: 'shots/play-3-filled.png' })
  expect(filled.moatFill).toBeGreaterThan(0.6)

  expect(errors, errors.join('\n')).toEqual([])
})

test('the same loop works in landscape', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await boot(page, 844, 390)
  expect((await st(page)).orientation).toBe('landscape')

  for (let pass = 0; pass < 3; pass++) {
    await dragWorld(page, [
      [-4.6, 0],
      [-2.2, 0.1],
      [0.4, 0.05],
      [2.0, 0],
    ])
  }
  expect((await st(page)).totalDug).toBeGreaterThan(0.5)

  await pickTool(page, 'pour')
  const src = await px(page, -5.2, 0)
  for (let round = 0; round < 4; round++) {
    await page.mouse.move(src.x, src.y)
    await page.mouse.down()
    for (let i = 0; i < 18; i++) {
      await page.mouse.move(src.x + (i % 3), src.y)
      await page.waitForTimeout(150)
    }
    await page.mouse.up()
    await page.waitForTimeout(2000)
    if ((await st(page)).moatFill > 0.4) break
  }
  const s = await st(page)
  console.log('landscape', JSON.stringify(s))
  await page.screenshot({ path: 'shots/play-landscape.png' })
  expect(s.moatFill).toBeGreaterThan(0.15)
  expect(errors, errors.join('\n')).toEqual([])
})
